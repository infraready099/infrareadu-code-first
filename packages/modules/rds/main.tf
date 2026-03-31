locals {
  name   = "${var.project_name}-${var.environment}"
  port   = var.engine == "postgres" ? 5432 : 3306
  family = var.engine == "postgres" ? "postgres${split(".", var.engine_version)[0]}" : "mysql${split(".", var.engine_version)[0]}.${split(".", var.engine_version)[1]}"

  common_tags = merge(var.tags, {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "infraready"
    Module      = "rds"
  })
}

# ─── KMS KEY FOR ENCRYPTION AT REST ─────────────────────────────────────────
# SOC2 CC6.1 — Encryption at rest required

resource "aws_kms_key" "rds" {
  description             = "KMS key for ${local.name} RDS encryption"
  deletion_window_in_days = 30
  enable_key_rotation     = true

  tags = merge(local.common_tags, {
    Name = "${local.name}-rds-kms"
  })
}

resource "aws_kms_alias" "rds" {
  name          = "alias/${local.name}-rds"
  target_key_id = aws_kms_key.rds.key_id
}

# ─── SECURITY GROUP ──────────────────────────────────────────────────────────
# Only allow inbound from app security group — no public access ever

resource "aws_security_group" "rds" {
  name        = "${local.name}-rds-sg"
  description = "Security group for ${local.name} RDS - allows inbound from app layer only"
  vpc_id      = var.vpc_id

  # Allow inbound from app security group if provided
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
    Name = "${local.name}-rds-sg"
  })

  lifecycle {
    create_before_destroy = true
  }
}

# ─── DB SUBNET GROUP ─────────────────────────────────────────────────────────

resource "aws_db_subnet_group" "this" {
  name        = "${local.name}-db-subnet-group"
  description = "Subnet group for ${local.name} RDS - private subnets only"
  subnet_ids  = var.private_subnet_ids

  tags = merge(local.common_tags, {
    Name = "${local.name}-db-subnet-group"
  })
}

# ─── DB PARAMETER GROUP ──────────────────────────────────────────────────────
# Optimized defaults for production workloads

resource "aws_db_parameter_group" "this" {
  name        = "${local.name}-db-params"
  family      = local.family
  description = "Parameter group for ${local.name} RDS"

  dynamic "parameter" {
    for_each = var.engine == "postgres" ? [
      # Dynamic parameters — take effect immediately
      { name = "log_connections",           value = "1",                              apply_method = "immediate" },
      { name = "log_disconnections",        value = "1",                              apply_method = "immediate" },
      { name = "log_duration",              value = "1",                              apply_method = "immediate" },
      { name = "log_lock_waits",            value = "1",                              apply_method = "immediate" },
      { name = "log_min_duration_statement",value = "1000",                           apply_method = "immediate" },
      { name = "pgaudit.log",               value = "all",                            apply_method = "immediate" },
      { name = "pgaudit.log_catalog",       value = "1",                              apply_method = "immediate" },
      { name = "pgaudit.log_parameter",     value = "1",                              apply_method = "immediate" },
      { name = "pgaudit.log_relation",      value = "1",                              apply_method = "immediate" },
      { name = "log_statement",             value = "ddl",                            apply_method = "immediate" },
      { name = "log_min_error_statement",   value = "error",                          apply_method = "immediate" },
      # Static parameter — requires DB reboot to take effect
      { name = "shared_preload_libraries",  value = "pg_stat_statements,pgaudit",     apply_method = "pending-reboot" },
    ] : []
    content {
      name         = parameter.value.name
      value        = parameter.value.value
      apply_method = parameter.value.apply_method
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

# ─── SECRETS MANAGER — STORE DB CREDENTIALS ─────────────────────────────────
# SOC2 CC6.1 — Credentials never in plaintext, never in environment variables

resource "aws_secretsmanager_secret" "db" {
  name                    = "infraready/${local.name}/rds-credentials"
  description             = "Database credentials for ${local.name}"
  kms_key_id              = aws_kms_key.rds.arn
  recovery_window_in_days = 0

  tags = local.common_tags
}

resource "aws_secretsmanager_secret_version" "db" {
  secret_id = aws_secretsmanager_secret.db.id
  secret_string = jsonencode({
    username = var.db_username
    password = random_password.db.result
    host     = aws_db_instance.this.address
    port     = local.port
    dbname   = var.db_name
    # Full connection URL for application use
    url = "postgresql://${var.db_username}:${urlencode(random_password.db.result)}@${aws_db_instance.this.address}:${local.port}/${var.db_name}"
  })
}

# ─── RDS INSTANCE ────────────────────────────────────────────────────────────

resource "aws_db_instance" "this" {
  identifier = "${local.name}-db"

  # Engine
  engine         = var.engine
  engine_version = var.engine_version
  instance_class = var.instance_class

  # Storage
  allocated_storage     = var.allocated_storage_gb
  max_allocated_storage = var.max_allocated_storage_gb > 0 ? var.max_allocated_storage_gb : null
  storage_type          = "gp3"
  storage_encrypted     = true
  kms_key_id            = aws_kms_key.rds.arn

  # Database
  db_name  = var.db_name
  username = var.db_username
  password = random_password.db.result
  port     = local.port

  # Network — private only, no public access
  db_subnet_group_name   = aws_db_subnet_group.this.name
  vpc_security_group_ids = [aws_security_group.rds.id]
  publicly_accessible    = false
  multi_az               = var.multi_az

  # Configuration
  parameter_group_name = aws_db_parameter_group.this.name

  # Backups
  backup_retention_period   = var.backup_retention_days
  backup_window             = "03:00-04:00" # 3-4 AM UTC
  maintenance_window        = "Mon:04:00-Mon:05:00"
  copy_tags_to_snapshot     = true
  delete_automated_backups  = false

  # Monitoring
  monitoring_interval = 60 # Enhanced monitoring every 60s
  monitoring_role_arn = aws_iam_role.rds_monitoring.arn
  enabled_cloudwatch_logs_exports = var.engine == "postgres" ? [
    "postgresql", "upgrade"
  ] : ["error", "general", "slowquery", "audit"]

  # Safety
  deletion_protection = var.deletion_protection
  skip_final_snapshot = var.skip_final_snapshot
  final_snapshot_identifier = var.skip_final_snapshot ? null : "${local.name}-db-final-snapshot"

  # Performance Insights (free for db.t3.* instances)
  performance_insights_enabled          = true
  performance_insights_retention_period = 7
  performance_insights_kms_key_id       = aws_kms_key.rds.arn

  # Auto minor version upgrade
  auto_minor_version_upgrade = true
  apply_immediately          = false

  tags = merge(local.common_tags, {
    Name = "${local.name}-db"
  })

  lifecycle {
    ignore_changes = [password]
  }

  depends_on = [aws_db_subnet_group.this, aws_db_parameter_group.this]
}

# ─── RDS ENHANCED MONITORING ROLE ────────────────────────────────────────────

resource "aws_iam_role" "rds_monitoring" {
  name = "${local.name}-rds-monitoring-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "monitoring.rds.amazonaws.com"
      }
    }]
  })

  tags = local.common_tags
}

resource "aws_iam_role_policy_attachment" "rds_monitoring" {
  role       = aws_iam_role.rds_monitoring.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonRDSEnhancedMonitoringRole"
}
