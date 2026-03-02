# ─── SECURITY BASELINE MODULE ─────────────────────────────────────────────────
# This module implements SOC2 Type II foundational controls:
# CC6.1  — Encryption and access controls
# CC6.2  — Authentication and access management
# CC6.7  — Data transmission controls
# CC7.1  — Threat and vulnerability detection
# CC7.2  — System monitoring
# CC7.3  — Incident response
# A1.1   — Availability monitoring

locals {
  name = "${var.project_name}-${var.environment}"

  common_tags = merge(var.tags, {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "infraready"
    Module      = "security"
  })
}

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

# ─── SNS TOPIC FOR ALERTS ─────────────────────────────────────────────────────

resource "aws_sns_topic" "alerts" {
  name = "${local.name}-security-alerts"
  tags = local.common_tags
}

resource "aws_sns_topic_subscription" "email" {
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = var.alert_email
}

# ─── CLOUDTRAIL — AUDIT LOG ALL API CALLS ────────────────────────────────────
# SOC2 CC7.2 — Required: log all API activity across all regions

resource "aws_s3_bucket" "cloudtrail" {
  bucket        = "${local.name}-cloudtrail-${data.aws_caller_identity.current.account_id}"
  force_destroy = false

  tags = merge(local.common_tags, { Name = "${local.name}-cloudtrail" })
}

resource "aws_s3_bucket_public_access_block" "cloudtrail" {
  bucket                  = aws_s3_bucket.cloudtrail.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "cloudtrail" {
  bucket = aws_s3_bucket.cloudtrail.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "cloudtrail" {
  bucket = aws_s3_bucket.cloudtrail.id
  rule {
    id     = "archive-and-expire"
    status = "Enabled"
    filter {}
    transition {
      days          = 90
      storage_class = "STANDARD_IA"
    }
    transition {
      days          = 180
      storage_class = "GLACIER"
    }
    expiration {
      days = var.log_retention_days
    }
  }
}

resource "aws_s3_bucket_policy" "cloudtrail" {
  bucket = aws_s3_bucket.cloudtrail.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AWSCloudTrailAclCheck"
        Effect = "Allow"
        Principal = { Service = "cloudtrail.amazonaws.com" }
        Action   = "s3:GetBucketAcl"
        Resource = aws_s3_bucket.cloudtrail.arn
      },
      {
        Sid    = "AWSCloudTrailWrite"
        Effect = "Allow"
        Principal = { Service = "cloudtrail.amazonaws.com" }
        Action   = "s3:PutObject"
        Resource = "${aws_s3_bucket.cloudtrail.arn}/AWSLogs/${data.aws_caller_identity.current.account_id}/*"
        Condition = {
          StringEquals = { "s3:x-amz-acl" = "bucket-owner-full-control" }
        }
      },
      {
        Sid    = "DenyDelete"
        Effect = "Deny"
        Principal = "*"
        Action = ["s3:DeleteObject", "s3:DeleteBucket"]
        Resource = [
          aws_s3_bucket.cloudtrail.arn,
          "${aws_s3_bucket.cloudtrail.arn}/*"
        ]
      }
    ]
  })
}

resource "aws_cloudwatch_log_group" "cloudtrail" {
  name              = "/infraready/${local.name}/cloudtrail"
  retention_in_days = 90
  tags              = local.common_tags
}

resource "aws_iam_role" "cloudtrail" {
  name = "${local.name}-cloudtrail-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "cloudtrail.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })

  tags = local.common_tags
}

resource "aws_iam_role_policy" "cloudtrail" {
  name = "${local.name}-cloudtrail-policy"
  role = aws_iam_role.cloudtrail.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = ["logs:CreateLogStream", "logs:PutLogEvents"]
      Resource = "${aws_cloudwatch_log_group.cloudtrail.arn}:*"
    }]
  })
}

resource "aws_cloudtrail" "this" {
  name                          = "${local.name}-trail"
  s3_bucket_name                = aws_s3_bucket.cloudtrail.id
  include_global_service_events = true
  is_multi_region_trail         = true  # All regions
  enable_log_file_validation    = true  # Detect tampering
  cloud_watch_logs_group_arn    = "${aws_cloudwatch_log_group.cloudtrail.arn}:*"
  cloud_watch_logs_role_arn     = aws_iam_role.cloudtrail.arn

  event_selector {
    read_write_type           = "All"
    include_management_events = true

    data_resource {
      type   = "AWS::S3::Object"
      values = ["arn:aws:s3:::"] # All S3 objects
    }
  }

  tags = merge(local.common_tags, {
    Name = "${local.name}-cloudtrail"
  })

  depends_on = [aws_s3_bucket_policy.cloudtrail]
}

# ─── GUARDDUTY — THREAT DETECTION ────────────────────────────────────────────
# SOC2 CC7.1 — Detects compromised credentials, crypto mining, port scanning

resource "aws_guardduty_detector" "this" {
  count  = var.enable_guardduty ? 1 : 0
  enable = true

  datasources {
    s3_logs { enable = true }
    kubernetes { audit_logs { enable = true } }
    malware_protection {
      scan_ec2_instance_with_findings { ebs_volumes { enable = true } }
    }
  }

  tags = local.common_tags
}

# ─── AWS CONFIG — COMPLIANCE MONITORING ──────────────────────────────────────
# SOC2 — Continuously monitors resource configurations for compliance

resource "aws_config_configuration_recorder" "this" {
  count = var.enable_config ? 1 : 0
  name  = "${local.name}-config-recorder"

  role_arn = aws_iam_role.config[0].arn

  recording_group {
    all_supported                 = true
    include_global_resource_types = true
  }
}

resource "aws_config_delivery_channel" "this" {
  count = var.enable_config ? 1 : 0
  name  = "${local.name}-config-channel"

  s3_bucket_name = aws_s3_bucket.cloudtrail.id
  sns_topic_arn  = aws_sns_topic.alerts.arn

  depends_on = [aws_config_configuration_recorder.this]
}

resource "aws_config_configuration_recorder_status" "this" {
  count      = var.enable_config ? 1 : 0
  name       = aws_config_configuration_recorder.this[0].name
  is_enabled = true

  depends_on = [aws_config_delivery_channel.this]
}

resource "aws_iam_role" "config" {
  count = var.enable_config ? 1 : 0
  name  = "${local.name}-config-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "config.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })

  tags = local.common_tags
}

resource "aws_iam_role_policy_attachment" "config" {
  count      = var.enable_config ? 1 : 0
  role       = aws_iam_role.config[0].name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWS_ConfigRole"
}

# Key Config Rules for SOC2
resource "aws_config_config_rule" "s3_no_public" {
  count      = var.enable_config ? 1 : 0
  name       = "s3-bucket-public-read-prohibited"
  depends_on = [aws_config_configuration_recorder_status.this]

  source {
    owner             = "AWS"
    source_identifier = "S3_BUCKET_PUBLIC_READ_PROHIBITED"
  }
}

resource "aws_config_config_rule" "rds_no_public" {
  count      = var.enable_config ? 1 : 0
  name       = "rds-instance-public-access-check"
  depends_on = [aws_config_configuration_recorder_status.this]

  source {
    owner             = "AWS"
    source_identifier = "RDS_INSTANCE_PUBLIC_ACCESS_CHECK"
  }
}

resource "aws_config_config_rule" "root_mfa" {
  count      = var.enable_config ? 1 : 0
  name       = "root-account-mfa-enabled"
  depends_on = [aws_config_configuration_recorder_status.this]

  source {
    owner             = "AWS"
    source_identifier = "ROOT_ACCOUNT_MFA_ENABLED"
  }
}

# ─── SECURITY HUB ─────────────────────────────────────────────────────────────

resource "aws_securityhub_account" "this" {
  count = var.enable_security_hub ? 1 : 0
}

resource "aws_securityhub_standards_subscription" "cis" {
  count         = var.enable_security_hub ? 1 : 0
  standards_arn = "arn:aws:securityhub:::ruleset/cis-aws-foundations-benchmark/v/1.2.0"
  depends_on    = [aws_securityhub_account.this]
}

# ─── IAM PASSWORD POLICY ─────────────────────────────────────────────────────
# SOC2 CC6.2 — Enforce strong passwords

resource "aws_iam_account_password_policy" "this" {
  minimum_password_length        = 16
  require_uppercase_characters   = true
  require_lowercase_characters   = true
  require_numbers                = true
  require_symbols                = true
  allow_users_to_change_password = true
  max_password_age               = 90
  password_reuse_prevention      = 12
  hard_expiry                    = false
}

# ─── BILLING ALARM ────────────────────────────────────────────────────────────
# Prevent surprise AWS bills — alert at $100 by default

resource "aws_cloudwatch_metric_alarm" "billing" {
  alarm_name          = "${local.name}-billing-alarm"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = "EstimatedCharges"
  namespace           = "AWS/Billing"
  period              = 86400 # Daily
  statistic           = "Maximum"
  threshold           = var.billing_alarm_threshold_usd
  alarm_description   = "AWS bill has exceeded $${var.billing_alarm_threshold_usd}"
  alarm_actions       = [aws_sns_topic.alerts.arn]

  dimensions = {
    Currency = "USD"
  }

  tags = local.common_tags
}

# ─── ROOT ACCOUNT ACTIVITY ALARM ─────────────────────────────────────────────
# SOC2 CC6.2 — Alert on any root account usage (should never happen)

resource "aws_cloudwatch_log_metric_filter" "root_activity" {
  name           = "${local.name}-root-activity-filter"
  log_group_name = aws_cloudwatch_log_group.cloudtrail.name
  pattern        = "{ $.userIdentity.type = \"Root\" && $.userIdentity.invokedBy NOT EXISTS && $.eventType != \"AwsServiceEvent\" }"

  metric_transformation {
    name      = "RootAccountActivity"
    namespace = "InfraReady/${local.name}"
    value     = "1"
  }
}

resource "aws_cloudwatch_metric_alarm" "root_activity" {
  alarm_name          = "${local.name}-root-account-activity"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = "RootAccountActivity"
  namespace           = "InfraReady/${local.name}"
  period              = 300
  statistic           = "Sum"
  threshold           = 1
  alarm_description   = "Root account activity detected — immediate investigation required"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  treat_missing_data  = "notBreaching"

  tags = local.common_tags
}
