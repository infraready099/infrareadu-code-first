# ─── KMS MODULE ───────────────────────────────────────────────────────────────
# Creates Customer-Managed Keys (CMKs) for every AWS service used.
#
# Why CMKs instead of AWS-managed keys?
#   - HIPAA §164.312(a)(2)(iv) — requires customer control over encryption keys
#   - SOC2 CC6.1 — encryption key management must be auditable
#   - CMKs can be disabled/deleted to immediately revoke access (AWS-managed cannot)
#   - CMKs have full CloudTrail audit trail (every encrypt/decrypt call is logged)
#   - CMKs support cross-account access for multi-account architectures
#
# Each service gets its own key so compromising one doesn't compromise all.
# This is called "key separation" and is required for PCI DSS.

locals {
  name = "${var.project_name}-${var.environment}"

  common_tags = merge(var.tags, {
    Project            = var.project_name
    Environment        = var.environment
    ManagedBy          = "infraready"
    Module             = "kms"
    DataClassification = var.enable_hipaa ? "PHI" : "Internal"
  })
}

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

# ─── SHARED KEY POLICY ────────────────────────────────────────────────────────

locals {
  root_policy_statement = {
    Sid    = "EnableRootAccess"
    Effect = "Allow"
    Principal = { AWS = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:root" }
    Action   = "kms:*"
    Resource = "*"
  }
}

# ─── RDS KEY ─────────────────────────────────────────────────────────────────

resource "aws_kms_key" "rds" {
  description             = "${local.name} — RDS database encryption"
  deletion_window_in_days = var.deletion_window_in_days
  enable_key_rotation     = true
  multi_region            = false

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      local.root_policy_statement,
      {
        Sid    = "AllowRDSService"
        Effect = "Allow"
        Principal = { Service = "rds.amazonaws.com" }
        Action   = ["kms:CreateGrant", "kms:Describe*"]
        Resource = "*"
      }
    ]
  })

  tags = merge(local.common_tags, { Name = "${local.name}-rds", Service = "RDS" })
}

resource "aws_kms_alias" "rds" {
  name          = "alias/${local.name}-rds"
  target_key_id = aws_kms_key.rds.key_id
}

# ─── S3 KEY ──────────────────────────────────────────────────────────────────

resource "aws_kms_key" "s3" {
  description             = "${local.name} — S3 bucket encryption"
  deletion_window_in_days = var.deletion_window_in_days
  enable_key_rotation     = true

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      local.root_policy_statement,
      {
        Sid    = "AllowS3Service"
        Effect = "Allow"
        Principal = { Service = "s3.amazonaws.com" }
        Action   = ["kms:Decrypt", "kms:GenerateDataKey*"]
        Resource = "*"
      },
      {
        Sid    = "AllowDeliveryServices"
        Effect = "Allow"
        Principal = {
          Service = [
            "cloudtrail.amazonaws.com",
            "config.amazonaws.com",
            "delivery.logs.amazonaws.com"
          ]
        }
        Action   = ["kms:Decrypt", "kms:GenerateDataKey*", "kms:DescribeKey"]
        Resource = "*"
      }
    ]
  })

  tags = merge(local.common_tags, { Name = "${local.name}-s3", Service = "S3" })
}

resource "aws_kms_alias" "s3" {
  name          = "alias/${local.name}-s3"
  target_key_id = aws_kms_key.s3.key_id
}

# ─── SNS KEY ─────────────────────────────────────────────────────────────────

resource "aws_kms_key" "sns" {
  description             = "${local.name} — SNS topic encryption"
  deletion_window_in_days = var.deletion_window_in_days
  enable_key_rotation     = true

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      local.root_policy_statement,
      {
        Sid    = "AllowSNSAndCloudWatch"
        Effect = "Allow"
        Principal = {
          Service = [
            "sns.amazonaws.com",
            "cloudwatch.amazonaws.com",
            "events.amazonaws.com",
            "securityhub.amazonaws.com",
            "guardduty.amazonaws.com"
          ]
        }
        Action   = ["kms:Decrypt", "kms:GenerateDataKey*"]
        Resource = "*"
      }
    ]
  })

  tags = merge(local.common_tags, { Name = "${local.name}-sns", Service = "SNS" })
}

resource "aws_kms_alias" "sns" {
  name          = "alias/${local.name}-sns"
  target_key_id = aws_kms_key.sns.key_id
}

# ─── SQS KEY ─────────────────────────────────────────────────────────────────

resource "aws_kms_key" "sqs" {
  description             = "${local.name} — SQS queue encryption"
  deletion_window_in_days = var.deletion_window_in_days
  enable_key_rotation     = true

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      local.root_policy_statement,
      {
        Sid    = "AllowSQSAndLambda"
        Effect = "Allow"
        Principal = { Service = ["sqs.amazonaws.com", "lambda.amazonaws.com"] }
        Action   = ["kms:Decrypt", "kms:GenerateDataKey*"]
        Resource = "*"
      }
    ]
  })

  tags = merge(local.common_tags, { Name = "${local.name}-sqs", Service = "SQS" })
}

resource "aws_kms_alias" "sqs" {
  name          = "alias/${local.name}-sqs"
  target_key_id = aws_kms_key.sqs.key_id
}

# ─── CLOUDWATCH LOGS KEY ──────────────────────────────────────────────────────

resource "aws_kms_key" "cloudwatch" {
  description             = "${local.name} — CloudWatch Logs encryption"
  deletion_window_in_days = var.deletion_window_in_days
  enable_key_rotation     = true

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      local.root_policy_statement,
      {
        Sid    = "AllowCloudWatchLogs"
        Effect = "Allow"
        Principal = { Service = "logs.${data.aws_region.current.name}.amazonaws.com" }
        Action   = ["kms:Encrypt*", "kms:Decrypt*", "kms:ReEncrypt*", "kms:GenerateDataKey*", "kms:Describe*"]
        Resource = "*"
        Condition = {
          ArnLike = {
            "kms:EncryptionContext:aws:logs:arn" = "arn:aws:logs:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:*"
          }
        }
      }
    ]
  })

  tags = merge(local.common_tags, { Name = "${local.name}-cloudwatch", Service = "CloudWatchLogs" })
}

resource "aws_kms_alias" "cloudwatch" {
  name          = "alias/${local.name}-cloudwatch"
  target_key_id = aws_kms_key.cloudwatch.key_id
}

# ─── SECRETS MANAGER KEY ──────────────────────────────────────────────────────

resource "aws_kms_key" "secrets" {
  description             = "${local.name} — Secrets Manager encryption"
  deletion_window_in_days = var.deletion_window_in_days
  enable_key_rotation     = true

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      local.root_policy_statement,
      {
        Sid    = "AllowSecretsManager"
        Effect = "Allow"
        Principal = { Service = "secretsmanager.amazonaws.com" }
        Action   = ["kms:Decrypt", "kms:GenerateDataKey*", "kms:DescribeKey", "kms:CreateGrant"]
        Resource = "*"
      }
    ]
  })

  tags = merge(local.common_tags, { Name = "${local.name}-secrets", Service = "SecretsManager" })
}

resource "aws_kms_alias" "secrets" {
  name          = "alias/${local.name}-secrets"
  target_key_id = aws_kms_key.secrets.key_id
}

# ─── BACKUP KEY ───────────────────────────────────────────────────────────────

resource "aws_kms_key" "backup" {
  description             = "${local.name} — AWS Backup vault encryption"
  deletion_window_in_days = var.deletion_window_in_days
  enable_key_rotation     = true

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      local.root_policy_statement,
      {
        Sid    = "AllowBackupService"
        Effect = "Allow"
        Principal = { Service = "backup.amazonaws.com" }
        Action   = ["kms:CreateGrant", "kms:Decrypt", "kms:GenerateDataKey*", "kms:DescribeKey"]
        Resource = "*"
      }
    ]
  })

  tags = merge(local.common_tags, { Name = "${local.name}-backup", Service = "AWSBackup" })
}

resource "aws_kms_alias" "backup" {
  name          = "alias/${local.name}-backup"
  target_key_id = aws_kms_key.backup.key_id
}
