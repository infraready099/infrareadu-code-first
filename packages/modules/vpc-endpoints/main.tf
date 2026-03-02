# ─── VPC ENDPOINTS MODULE ────────────────────────────────────────────────────
# Keep all AWS API traffic on the private AWS network.
# Without these, ECS tasks in private subnets call AWS APIs over the internet
# through the NAT gateway — costing money and creating attack surface.
#
# SOC2 CC6.1, CC6.7 — Logical access controls, data transmission security
# HIPAA: Required to keep PHI off public internet when calling AWS services

locals {
  name = "${var.project_name}-${var.environment}"

  common_tags = merge(var.tags, {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "infraready"
    Module      = "vpc-endpoints"
  })
}

data "aws_region" "current" {}

# Security group for Interface Endpoints
resource "aws_security_group" "endpoints" {
  name        = "${local.name}-vpc-endpoints-sg"
  description = "Security group for VPC Interface Endpoints — allows HTTPS from VPC"
  vpc_id      = var.vpc_id

  ingress {
    description = "HTTPS from VPC CIDR"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = [var.vpc_cidr]
  }

  tags = merge(local.common_tags, { Name = "${local.name}-endpoints-sg" })
}

# ─── GATEWAY ENDPOINTS (Free — no hourly cost) ───────────────────────────────

resource "aws_vpc_endpoint" "s3" {
  vpc_id            = var.vpc_id
  service_name      = "com.amazonaws.${data.aws_region.current.name}.s3"
  vpc_endpoint_type = "Gateway"
  route_table_ids   = var.private_route_table_ids

  tags = merge(local.common_tags, { Name = "${local.name}-s3-endpoint" })
}

resource "aws_vpc_endpoint" "dynamodb" {
  count             = var.enable_dynamodb_endpoint ? 1 : 0
  vpc_id            = var.vpc_id
  service_name      = "com.amazonaws.${data.aws_region.current.name}.dynamodb"
  vpc_endpoint_type = "Gateway"
  route_table_ids   = var.private_route_table_ids

  tags = merge(local.common_tags, { Name = "${local.name}-dynamodb-endpoint" })
}

# ─── INTERFACE ENDPOINTS (~$0.01/hr each) ────────────────────────────────────
# These allow ECS tasks to reach AWS APIs without going through NAT gateway

locals {
  interface_services = concat(
    [
      "ecr.api",          # Pull ECR images
      "ecr.dkr",          # Docker protocol for ECR
      "logs",             # CloudWatch Logs
      "monitoring",       # CloudWatch Metrics
      "secretsmanager",   # Read secrets
      "ssm",              # Systems Manager
      "ssmmessages",      # SSM Session Manager
      "ec2messages",      # SSM agent
      "kms",              # KMS encryption operations
      "sts",              # STS AssumeRole
      "sqs",              # SQS for job queue
    ],
    var.enable_xray_endpoint ? ["xray"] : []
  )
}

resource "aws_vpc_endpoint" "interface" {
  for_each = toset(local.interface_services)

  vpc_id              = var.vpc_id
  service_name        = "com.amazonaws.${data.aws_region.current.name}.${each.value}"
  vpc_endpoint_type   = "Interface"
  private_dns_enabled = true
  subnet_ids          = var.private_subnet_ids
  security_group_ids  = [aws_security_group.endpoints.id]

  tags = merge(local.common_tags, {
    Name = "${local.name}-${each.value}-endpoint"
  })
}
