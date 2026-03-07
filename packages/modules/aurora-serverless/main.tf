locals {
  name   = "${var.project_name}-${var.environment}"
  port   = var.engine == "aurora-postgresql" ? 5432 : 3306
  family = var.engine == "aurora-postgresql" ? "aurora-postgresql${split(".", var.engine_version)[0]}" : "aurora-mysql${split(".", var.engine_version)[0]}.${split(".", var.engine_version)[1]}"

  common_tags = merge(var.tags, {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "infraready"
    Module      = "aurora-serverless"
  })
}

# ─── KMS KEY ─────────────────────────────────────────────────────────────────
# SOC2 CC6.1 — Encryption at rest required

resource "aws_kms_key" "aurora" {
  description             = "KMS key for ${local.name} Aurora encryption"
  deletion_window_in_days = 30
  enable_key_rotation     = true

  tags = merge(local.common_tags, {
    Name = "${local.name}-aurora-kms"
  })
}

resource "aws_kms_alias" "aurora" {
  name          = "alias/${local.name}-aurora"
  target_key_id = aws_kms_key.aurora.key_id
}

# ─── SECURITY GROUP ──────────────────────────────────────────────────────────

resource "aws_security_group" "aurora" {
  name        = "${local.name}-aurora-sg"
  description = "Security group for ${local.name} Aurora — inbound from app layer only"
  vpc_id      = var.vpc_id

  dynamic "ingress" {
    for_each = var.app_security_group_id != "" ? [1] : []
    content {
      description     = "Allow DB access from application layer"
      from_port       = local.port
      to_port         = local.port
      protocol        = "tcp"
      security_groups = [var.app_security_group_id]
    }
  }

  egress {
    description = "Allow all outbound"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(local.common_tags, {
    Name = "${local.name}-aurora-sg"
  })

  lifecycle {
    create_before_destroy = true
  }
}

# ─── SUBNET GROUP ────────────────────────────────────────────────────────────

resource "aws_db_subnet_group" "this" {
  name        = "${local.name}-aurora-subnet-group"
  description = "Subnet group for ${local.name} Aurora — private subnets only"
  subnet_ids  = var.private_subnet_ids

  tags = merge(local.common_tags, {
    Name = "${local.name}-aurora-subnet-group"
  })
}

# ─── CLUSTER PARAMETER GROUP ─────────────────────────────────────────────────

resource "aws_rds_cluster_parameter_group" "this" {
  name        = "${local.name}-aurora-params"
  family      = local.family
  description = "Parameter group for ${local.name} Aurora Serverless v2"

  dynamic "parameter" {
    for_each = var.engine == "aurora-postgresql" ? [
      { name = "log_connections", value = "1" },
      { name = "log_disconnections", value = "1" },
      { name = "log_min_duration_statement", value = "1000" },
      { name = "shared_preload_libraries", value = "pg_stat_statements" }
    ] : []
    content {
      name  = parameter.value.name
      value = parameter.value.value
    }
  }

  tags = local.common_tags

  lifecycle {
    create_before_destroy = true
  }
}

# ─── RANDOM PASSWORD ─────────────────────────────────────────────────────────

resource "random_password" "db" {
  length           = 32
  special          = true
  override_special = "!#$%^&*()-_=+[]{}:?"
}

# ─── SECRETS MANAGER — DB CREDENTIALS ───────────────────────────────────────
# SOC2 CC6.1 — Credentials never in plaintext

resource "aws_secretsmanager_secret" "db" {
  name        = "infraready/${local.name}/aurora-credentials"
  description = "Aurora Serverless v2 credentials for ${local.name}"
  kms_key_id  = aws_kms_key.aurora.arn

  tags = local.common_tags
}

resource "aws_secretsmanager_secret_version" "db" {
  secret_id = aws_secretsmanager_secret.db.id
  secret_string = jsonencode({
    username = var.db_username
    password = random_password.db.result
    host     = aws_rds_cluster.this.endpoint
    port     = local.port
    dbname   = var.db_name
    url      = "postgresql://${var.db_username}:${urlencode(random_password.db.result)}@${aws_rds_cluster.this.endpoint}:${local.port}/${var.db_name}"
  })
}

# ─── AURORA SERVERLESS V2 CLUSTER ────────────────────────────────────────────
# Scales from min_capacity to max_capacity ACUs automatically.
# Cost: ~$0.12/ACU/hr (us-east-1). Min 0.5 ACU = ~$43/mo always-on.
# Scales up in seconds — perfect for bursty / unpredictable workloads.

resource "aws_rds_cluster" "this" {
  cluster_identifier = "${local.name}-aurora"

  engine         = var.engine
  engine_version = var.engine_version
  engine_mode    = "provisioned" # Required for Serverless v2

  serverlessv2_scaling_configuration {
    min_capacity = var.min_capacity
    max_capacity = var.max_capacity
  }

  database_name   = var.db_name
  master_username = var.db_username
  master_password = random_password.db.result

  db_subnet_group_name            = aws_db_subnet_group.this.name
  vpc_security_group_ids          = [aws_security_group.aurora.id]
  db_cluster_parameter_group_name = aws_rds_cluster_parameter_group.this.name

  storage_encrypted = true
  kms_key_id        = aws_kms_key.aurora.arn

  backup_retention_period   = var.backup_retention_days
  preferred_backup_window   = "03:00-04:00"
  preferred_maintenance_window = "Mon:04:00-Mon:05:00"
  copy_tags_to_snapshot     = true
  deletion_protection       = var.deletion_protection
  skip_final_snapshot       = var.skip_final_snapshot
  final_snapshot_identifier = var.skip_final_snapshot ? null : "${local.name}-aurora-final-snapshot"

  enabled_cloudwatch_logs_exports = var.engine == "aurora-postgresql" ? ["postgresql"] : ["error", "general", "slowquery", "audit"]

  apply_immediately = false

  tags = merge(local.common_tags, {
    Name = "${local.name}-aurora"
  })

  lifecycle {
    prevent_destroy = true
    ignore_changes  = [master_password]
  }

  depends_on = [aws_db_subnet_group.this, aws_rds_cluster_parameter_group.this]
}

# ─── AURORA WRITER INSTANCE (Serverless v2 requires at least one instance) ───

resource "aws_rds_cluster_instance" "writer" {
  identifier         = "${local.name}-aurora-writer"
  cluster_identifier = aws_rds_cluster.this.id

  instance_class = "db.serverless" # Required for Serverless v2
  engine         = aws_rds_cluster.this.engine
  engine_version = aws_rds_cluster.this.engine_version

  publicly_accessible            = false
  performance_insights_enabled   = true
  performance_insights_kms_key_id = aws_kms_key.aurora.arn
  monitoring_interval            = 60
  monitoring_role_arn            = aws_iam_role.rds_monitoring.arn

  auto_minor_version_upgrade = true
  apply_immediately          = false

  tags = merge(local.common_tags, {
    Name = "${local.name}-aurora-writer"
  })
}

# ─── OPTIONAL READ REPLICA ────────────────────────────────────────────────────

resource "aws_rds_cluster_instance" "reader" {
  count = var.enable_reader ? 1 : 0

  identifier         = "${local.name}-aurora-reader"
  cluster_identifier = aws_rds_cluster.this.id

  instance_class = "db.serverless"
  engine         = aws_rds_cluster.this.engine
  engine_version = aws_rds_cluster.this.engine_version

  publicly_accessible          = false
  performance_insights_enabled = true
  monitoring_interval          = 60
  monitoring_role_arn          = aws_iam_role.rds_monitoring.arn

  auto_minor_version_upgrade = true

  tags = merge(local.common_tags, {
    Name = "${local.name}-aurora-reader"
  })
}

# ─── ENHANCED MONITORING ROLE ────────────────────────────────────────────────

resource "aws_iam_role" "rds_monitoring" {
  name = "${local.name}-aurora-monitoring-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "monitoring.rds.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })

  tags = local.common_tags
}

resource "aws_iam_role_policy_attachment" "rds_monitoring" {
  role       = aws_iam_role.rds_monitoring.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonRDSEnhancedMonitoringRole"
}
