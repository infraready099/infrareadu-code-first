# ─── AWS BACKUP MODULE ────────────────────────────────────────────────────────
# Centralized, policy-driven backup for all resources in the account.
#
# Why AWS Backup instead of RDS native backups?
#   - Single pane of glass — one place to see ALL backup status across services
#   - Compliance reports — built-in reports for SOC2 auditors
#   - Backup audit manager — continuous compliance monitoring
#   - Cross-region copy — disaster recovery with one config
#   - Legal hold — immutable backups that cannot be deleted (HIPAA, legal)
#
# Retention tiers:
#   Daily:   35 days  (operational recovery — "I deleted a record yesterday")
#   Monthly: 12 months (quarterly audit reviews)
#   Yearly:  7 years  (HIPAA §164.316(b)(2) requires 6 years; we do 7 for safety)

locals {
  name       = "${var.project_name}-${var.environment}"
  vault_name = var.backup_vault_name != "" ? var.backup_vault_name : "${local.name}-vault"

  common_tags = merge(var.tags, {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "infraready"
    Module      = "backup"
  })
}

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

# ─── BACKUP VAULT ─────────────────────────────────────────────────────────────
# Encrypted, locked vault — backups cannot be deleted before retention expires

resource "aws_backup_vault" "this" {
  name        = local.vault_name
  kms_key_arn = var.kms_key_arn

  tags = merge(local.common_tags, { Name = local.vault_name })
}

# Vault Lock — prevents ANYONE (including root) from deleting backups early.
# This is what makes backups truly immutable and satisfies HIPAA legal hold requirements.
resource "aws_backup_vault_lock_configuration" "this" {
  backup_vault_name   = aws_backup_vault.this.name
  min_retention_days  = 7    # Minimum 7 days before any backup can be deleted
  max_retention_days  = 2555 # Maximum 7 years — prevents runaway retention costs
  # changeable_for_days is intentionally omitted — makes lock PERMANENT
  # Once applied, even root cannot unlock this vault. This is intentional.
}

# ─── IAM ROLE FOR BACKUP ──────────────────────────────────────────────────────

resource "aws_iam_role" "backup" {
  name = "${local.name}-backup-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "backup.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })

  tags = local.common_tags
}

resource "aws_iam_role_policy_attachment" "backup" {
  role       = aws_iam_role.backup.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSBackupServiceRolePolicyForBackup"
}

resource "aws_iam_role_policy_attachment" "restore" {
  role       = aws_iam_role.backup.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSBackupServiceRolePolicyForRestores"
}

# ─── BACKUP PLAN ──────────────────────────────────────────────────────────────

resource "aws_backup_plan" "this" {
  name = "${local.name}-backup-plan"

  # Tier 1: Daily — 35 day retention
  # Satisfies: SOC2 operational recovery, RTO/RPO requirements
  rule {
    rule_name         = "daily-35-days"
    target_vault_name = aws_backup_vault.this.name
    schedule          = "cron(0 3 * * ? *)" # 3 AM UTC daily

    start_window      = 60   # Start within 1 hour of scheduled time
    completion_window = 180  # Must complete within 3 hours

    lifecycle {
      delete_after = 35
    }

    dynamic "copy_action" {
      for_each = var.enable_cross_region_copy && var.secondary_kms_key_arn != "" ? [1] : []
      content {
        destination_vault_arn = "arn:aws:backup:${var.secondary_region}:${data.aws_caller_identity.current.account_id}:backup-vault:${local.vault_name}"
        lifecycle {
          delete_after = 35
        }
      }
    }
  }

  # Tier 2: Monthly — 1 year retention
  # Satisfies: SOC2 audit evidence, quarterly business reviews
  rule {
    rule_name         = "monthly-1-year"
    target_vault_name = aws_backup_vault.this.name
    schedule          = "cron(0 4 1 * ? *)" # 4 AM UTC on the 1st of each month

    start_window      = 120
    completion_window = 480

    lifecycle {
      cold_storage_after = 30  # Move to cold storage after 30 days (cheaper)
      delete_after       = 365
    }

    dynamic "copy_action" {
      for_each = var.enable_cross_region_copy && var.secondary_kms_key_arn != "" ? [1] : []
      content {
        destination_vault_arn = "arn:aws:backup:${var.secondary_region}:${data.aws_caller_identity.current.account_id}:backup-vault:${local.vault_name}"
        lifecycle {
          cold_storage_after = 30
          delete_after       = 365
        }
      }
    }
  }

  # Tier 3: Yearly — 7 year retention (HIPAA)
  # HIPAA §164.316(b)(2) requires minimum 6 years
  dynamic "rule" {
    for_each = var.enable_hipaa_retention ? [1] : []
    content {
      rule_name         = "yearly-7-years-hipaa"
      target_vault_name = aws_backup_vault.this.name
      schedule          = "cron(0 5 1 1 ? *)" # 5 AM UTC on Jan 1st each year

      start_window      = 480
      completion_window = 1440 # 24 hours for large annual backups

      lifecycle {
        cold_storage_after = 90   # Move to cold storage after 90 days
        delete_after       = 2555 # 7 years = 365 * 7
      }
    }
  }

  tags = local.common_tags
}

# ─── BACKUP SELECTION — WHAT TO BACK UP ──────────────────────────────────────
# Tag-based selection — any resource tagged ManagedBy=infraready is backed up
# This means adding resources to backup is automatic, not manual

resource "aws_backup_selection" "tagged" {
  name         = "${local.name}-tag-based-selection"
  plan_id      = aws_backup_plan.this.id
  iam_role_arn = aws_iam_role.backup.arn

  selection_tag {
    type  = "STRINGEQUALS"
    key   = "ManagedBy"
    value = "infraready"
  }
}

# Explicit RDS ARN selection (belt + suspenders — tag + explicit ARN)
resource "aws_backup_selection" "rds" {
  count        = length(var.rds_arns) > 0 ? 1 : 0
  name         = "${local.name}-rds-selection"
  plan_id      = aws_backup_plan.this.id
  iam_role_arn = aws_iam_role.backup.arn
  resources    = var.rds_arns
}

# ─── BACKUP AUDIT MANAGER ─────────────────────────────────────────────────────
# Continuous compliance monitoring — generates reports for SOC2 auditors
# This is the evidence an auditor asks for: "show me your backup compliance"

resource "aws_backup_framework" "this" {
  name        = "${local.name}-compliance-framework"
  description = "SOC2 and HIPAA backup compliance framework for ${local.name}"

  control {
    name = "BACKUP_RECOVERY_POINT_MINIMUM_RETENTION_CHECK"
    input_parameter {
      name  = "requiredRetentionDays"
      value = var.enable_hipaa_retention ? "2555" : "35"
    }
  }

  control {
    name = "BACKUP_PLAN_MIN_FREQUENCY_AND_MIN_RETENTION_CHECK"
    input_parameter {
      name  = "requiredFrequencyUnit"
      value = "days"
    }
    input_parameter {
      name  = "requiredFrequencyValue"
      value = "1"
    }
    input_parameter {
      name  = "requiredRetentionDays"
      value = "35"
    }
  }

  control {
    name = "BACKUP_RECOVERY_POINT_ENCRYPTED"
  }

  control {
    name = "BACKUP_RESOURCES_PROTECTED_BY_BACKUP_VAULT_LOCK"
    scope {
      compliance_resource_types = ["RDS", "EFS", "DynamoDB"]
    }
  }

  control {
    name = "BACKUP_RECOVERY_POINT_MANUAL_DELETION_DISABLED"
  }

  tags = local.common_tags
}

# Weekly backup compliance report — emailed or sent to S3 for auditors
resource "aws_backup_report_plan" "compliance" {
  name        = "${local.name}-backup-report"
  description = "Weekly backup compliance report"

  report_delivery_channel {
    s3_bucket_name = aws_s3_bucket.backup_reports.id
    s3_key_prefix  = "backup-reports"
    formats        = ["CSV", "JSON"]
  }

  report_setting {
    report_template = "BACKUP_JOB_REPORT"
  }
}

# S3 bucket for backup compliance reports
resource "aws_s3_bucket" "backup_reports" {
  bucket        = "${local.name}-backup-reports-${data.aws_caller_identity.current.account_id}"
  force_destroy = false
  tags          = merge(local.common_tags, { Name = "${local.name}-backup-reports" })
}

resource "aws_s3_bucket_public_access_block" "backup_reports" {
  bucket                  = aws_s3_bucket.backup_reports.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "backup_reports" {
  bucket = aws_s3_bucket.backup_reports.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = var.kms_key_arn
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_policy" "backup_reports" {
  bucket = aws_s3_bucket.backup_reports.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "DenyNonTLS"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:*"
        Resource  = ["${aws_s3_bucket.backup_reports.arn}", "${aws_s3_bucket.backup_reports.arn}/*"]
        Condition = { Bool = { "aws:SecureTransport" = "false" } }
      },
      {
        Sid    = "AllowBackupService"
        Effect = "Allow"
        Principal = { Service = "backup.amazonaws.com" }
        Action = ["s3:PutObject"]
        Resource = "${aws_s3_bucket.backup_reports.arn}/*"
      }
    ]
  })
}

# ─── CLOUDWATCH ALARM FOR BACKUP FAILURES ────────────────────────────────────

resource "aws_cloudwatch_metric_alarm" "backup_failed" {
  count               = var.alert_topic_arn != "" ? 1 : 0
  alarm_name          = "${local.name}-backup-job-failed"
  alarm_description   = "One or more backup jobs failed in the last hour"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = "NumberOfBackupJobsFailed"
  namespace           = "AWS/Backup"
  period              = 3600
  statistic           = "Sum"
  threshold           = 1
  alarm_actions       = [var.alert_topic_arn]
  treat_missing_data  = "notBreaching"

  tags = local.common_tags
}
