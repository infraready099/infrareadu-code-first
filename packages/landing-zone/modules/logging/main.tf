# ─── MODULE: LOGGING INFRASTRUCTURE ──────────────────────────────────────────
# Centralized log archive running in the dedicated log-archive account.
#
# Resources:
#   - S3 bucket for org-wide CloudTrail logs (immutable, 7-year retention)
#   - S3 bucket for AWS Config delivery logs
#   - Organization CloudTrail (multi-region, org-wide)
#   - AWS Config recorder + delivery channel
#
# This module runs in the LOG-ARCHIVE account.
# Logs written here are immutable: the protect-lz-controls SCP prevents deletion.
#
# Retention strategy:
#   0-90 days:    S3 Standard (hot, queryable via Athena)
#   90-365 days:  S3 Standard-IA (warm)
#   365-730 days: S3 Glacier Flexible Retrieval
#   730+ days:    S3 Glacier Deep Archive (~$1/TB/month)
#
# SOC2 controls:
#   CC7.2 — Audit logging of all API activity
#   CC6.1 — Log encryption at rest
#   A1.2  — Data retention for 7 years

terraform {
  required_version = ">= 1.6.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.80"
    }
  }
}

locals {
  common_tags = merge(var.tags, {
    Module = "logging"
  })

  cloudtrail_bucket_name = "${var.org_name}-cloudtrail-logs"
  config_bucket_name     = "${var.org_name}-config-logs"
}

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

# ─── KMS KEY FOR LOG ENCRYPTION ───────────────────────────────────────────────
# CMK encrypts both S3 buckets and the CloudTrail trail itself.
# Key rotation is annual — SOC2 CC6.1, HIPAA §164.312(a)(2)(iv).

resource "aws_kms_key" "logs" {
  description             = "CMK for ${var.org_name} Landing Zone log archive encryption"
  deletion_window_in_days = 30
  enable_key_rotation     = true

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "EnableRootAccess"
        Effect = "Allow"
        Principal = {
          AWS = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:root"
        }
        Action   = "kms:*"
        Resource = "*"
      },
      {
        Sid    = "AllowCloudTrailEncrypt"
        Effect = "Allow"
        Principal = {
          Service = "cloudtrail.amazonaws.com"
        }
        Action = [
          "kms:GenerateDataKey*",
          "kms:Decrypt",
          "kms:DescribeKey",
        ]
        Resource = "*"
        Condition = {
          StringLike = {
            "kms:EncryptionContext:aws:cloudtrail:arn" = "arn:aws:cloudtrail:*:${var.management_account_id}:trail/*"
          }
        }
      },
      {
        Sid    = "AllowCloudWatchLogs"
        Effect = "Allow"
        Principal = {
          Service = "logs.${data.aws_region.current.name}.amazonaws.com"
        }
        Action = [
          "kms:Encrypt*",
          "kms:Decrypt*",
          "kms:ReEncrypt*",
          "kms:GenerateDataKey*",
          "kms:Describe*",
        ]
        Resource = "*"
        Condition = {
          ArnLike = {
            "kms:EncryptionContext:aws:logs:arn" = "arn:aws:logs:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:*"
          }
        }
      }
    ]
  })

  tags = merge(local.common_tags, {
    Name = "${var.org_name}-log-archive-cmk"
  })
}

resource "aws_kms_alias" "logs" {
  name          = "alias/${var.org_name}-log-archive"
  target_key_id = aws_kms_key.logs.key_id
}

# ─── CLOUDTRAIL S3 BUCKET ──────────────────────────────────────────────────────

resource "aws_s3_bucket" "cloudtrail" {
  bucket        = local.cloudtrail_bucket_name
  force_destroy = false

  tags = merge(local.common_tags, {
    Name    = local.cloudtrail_bucket_name
    Purpose = "Org-wide CloudTrail log archive"
  })
}

resource "aws_s3_bucket_public_access_block" "cloudtrail" {
  bucket                  = aws_s3_bucket.cloudtrail.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_versioning" "cloudtrail" {
  bucket = aws_s3_bucket.cloudtrail.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "cloudtrail" {
  bucket = aws_s3_bucket.cloudtrail.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = aws_kms_key.logs.arn
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "cloudtrail" {
  bucket = aws_s3_bucket.cloudtrail.id

  rule {
    id     = "log-archive-tiering"
    status = "Enabled"

    filter {}

    transition {
      days          = 90
      storage_class = "STANDARD_IA"
    }

    transition {
      days          = 365
      storage_class = "GLACIER"
    }

    transition {
      days          = 730
      storage_class = "DEEP_ARCHIVE"
    }

    expiration {
      days = var.log_retention_days
    }

    noncurrent_version_expiration {
      noncurrent_days = 90
    }
  }
}

# Allow CloudTrail to write to this bucket from any account in the org.
# The org condition prevents any other AWS account from writing here.
resource "aws_s3_bucket_policy" "cloudtrail" {
  bucket = aws_s3_bucket.cloudtrail.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AWSCloudTrailAclCheck"
        Effect = "Allow"
        Principal = {
          Service = "cloudtrail.amazonaws.com"
        }
        Action   = "s3:GetBucketAcl"
        Resource = aws_s3_bucket.cloudtrail.arn
        Condition = {
          StringEquals = {
            "aws:SourceOrgID" = var.organization_id
          }
        }
      },
      {
        Sid    = "AWSCloudTrailWrite"
        Effect = "Allow"
        Principal = {
          Service = "cloudtrail.amazonaws.com"
        }
        Action   = "s3:PutObject"
        Resource = "${aws_s3_bucket.cloudtrail.arn}/AWSLogs/*"
        Condition = {
          StringEquals = {
            "s3:x-amz-acl"   = "bucket-owner-full-control"
            "aws:SourceOrgID" = var.organization_id
          }
        }
      },
      {
        Sid       = "DenyNonTLS"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:*"
        Resource = [
          aws_s3_bucket.cloudtrail.arn,
          "${aws_s3_bucket.cloudtrail.arn}/*",
        ]
        Condition = {
          Bool = {
            "aws:SecureTransport" = "false"
          }
        }
      },
      {
        Sid       = "DenyDelete"
        Effect    = "Deny"
        Principal = "*"
        Action = [
          "s3:DeleteObject",
          "s3:DeleteObjectVersion",
          "s3:DeleteBucket",
        ]
        Resource = [
          aws_s3_bucket.cloudtrail.arn,
          "${aws_s3_bucket.cloudtrail.arn}/*",
        ]
      }
    ]
  })

  depends_on = [aws_s3_bucket_public_access_block.cloudtrail]
}

# ─── CONFIG S3 BUCKET ─────────────────────────────────────────────────────────

resource "aws_s3_bucket" "config" {
  bucket        = local.config_bucket_name
  force_destroy = false

  tags = merge(local.common_tags, {
    Name    = local.config_bucket_name
    Purpose = "Org-wide AWS Config delivery channel"
  })
}

resource "aws_s3_bucket_public_access_block" "config" {
  bucket                  = aws_s3_bucket.config.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_versioning" "config" {
  bucket = aws_s3_bucket.config.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "config" {
  bucket = aws_s3_bucket.config.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = aws_kms_key.logs.arn
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "config" {
  bucket = aws_s3_bucket.config.id

  rule {
    id     = "config-log-tiering"
    status = "Enabled"

    filter {}

    transition {
      days          = 90
      storage_class = "STANDARD_IA"
    }

    transition {
      days          = 365
      storage_class = "GLACIER"
    }

    expiration {
      days = var.log_retention_days
    }
  }
}

resource "aws_s3_bucket_policy" "config" {
  bucket = aws_s3_bucket.config.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AWSConfigBucketPermissionsCheck"
        Effect = "Allow"
        Principal = {
          Service = "config.amazonaws.com"
        }
        Action   = "s3:GetBucketAcl"
        Resource = aws_s3_bucket.config.arn
        Condition = {
          StringEquals = {
            "aws:SourceOrgID" = var.organization_id
          }
        }
      },
      {
        Sid    = "AWSConfigBucketExistenceCheck"
        Effect = "Allow"
        Principal = {
          Service = "config.amazonaws.com"
        }
        Action   = "s3:ListBucket"
        Resource = aws_s3_bucket.config.arn
        Condition = {
          StringEquals = {
            "aws:SourceOrgID" = var.organization_id
          }
        }
      },
      {
        Sid    = "AWSConfigBucketDelivery"
        Effect = "Allow"
        Principal = {
          Service = "config.amazonaws.com"
        }
        Action   = "s3:PutObject"
        Resource = "${aws_s3_bucket.config.arn}/AWSLogs/*/Config/*"
        Condition = {
          StringEquals = {
            "s3:x-amz-acl"   = "bucket-owner-full-control"
            "aws:SourceOrgID" = var.organization_id
          }
        }
      },
      {
        Sid       = "DenyNonTLS"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:*"
        Resource = [
          aws_s3_bucket.config.arn,
          "${aws_s3_bucket.config.arn}/*",
        ]
        Condition = {
          Bool = {
            "aws:SecureTransport" = "false"
          }
        }
      }
    ]
  })

  depends_on = [aws_s3_bucket_public_access_block.config]
}

# ─── CLOUDWATCH LOG GROUP FOR CLOUDTRAIL ──────────────────────────────────────
# Real-time log delivery to CloudWatch — enables metric filters and alarms.

resource "aws_cloudwatch_log_group" "cloudtrail" {
  name              = "/infraready/${var.org_name}/org-cloudtrail"
  retention_in_days = 90 # Hot retention 90 days; S3 holds 7 years
  kms_key_id        = aws_kms_key.logs.arn

  tags = local.common_tags
}

resource "aws_iam_role" "cloudtrail" {
  name = "${var.org_name}-org-cloudtrail-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "cloudtrail.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })

  tags = local.common_tags
}

resource "aws_iam_role_policy" "cloudtrail" {
  name = "${var.org_name}-org-cloudtrail-policy"
  role = aws_iam_role.cloudtrail.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogStream",
          "logs:PutLogEvents",
        ]
        Resource = "${aws_cloudwatch_log_group.cloudtrail.arn}:*"
      }
    ]
  })
}

# ─── ORGANIZATION CLOUDTRAIL ──────────────────────────────────────────────────
# A single org trail covers all accounts and all regions — most cost-effective
# approach. One trail in management account captures everything.
#
# Note: is_organization_trail = true requires this to run in management account.
# Since this module runs in log-archive, the trail uses cross-account S3 access
# via the bucket policy above. The trail itself is created by the management
# account role — use a provider alias in root if you need strict isolation.

resource "aws_cloudtrail" "org" {
  name                          = "${var.org_name}-org-trail"
  s3_bucket_name                = aws_s3_bucket.cloudtrail.id
  include_global_service_events = true
  is_multi_region_trail         = true
  is_organization_trail         = true
  enable_log_file_validation    = true
  cloud_watch_logs_group_arn    = "${aws_cloudwatch_log_group.cloudtrail.arn}:*"
  cloud_watch_logs_role_arn     = aws_iam_role.cloudtrail.arn
  kms_key_id                    = aws_kms_key.logs.arn

  # Log all S3 data events — who accessed which objects across the org
  event_selector {
    read_write_type           = "All"
    include_management_events = true

    data_resource {
      type   = "AWS::S3::Object"
      values = ["arn:aws:s3:::"]
    }
  }

  # Log all Lambda invocations — required for SOC2 CC7.2
  event_selector {
    read_write_type           = "All"
    include_management_events = false

    data_resource {
      type   = "AWS::Lambda::Function"
      values = ["arn:aws:lambda"]
    }
  }

  tags = merge(local.common_tags, {
    Name = "${var.org_name}-org-trail"
  })

  depends_on = [
    aws_s3_bucket_policy.cloudtrail,
    aws_iam_role_policy.cloudtrail,
  ]
}

# ─── AWS CONFIG RECORDER ──────────────────────────────────────────────────────
# Config recorder in the log-archive account captures this account's resources.
# The org aggregator in the security account captures everything else.

resource "aws_iam_role" "config" {
  name = "${var.org_name}-log-archive-config-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "config.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })

  tags = local.common_tags
}

resource "aws_iam_role_policy_attachment" "config" {
  role       = aws_iam_role.config.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWS_ConfigRole"
}

resource "aws_config_configuration_recorder" "this" {
  name     = "${var.org_name}-log-archive-config-recorder"
  role_arn = aws_iam_role.config.arn

  recording_group {
    all_supported                 = true
    include_global_resource_types = true
  }

  depends_on = [aws_iam_role_policy_attachment.config]
}

resource "aws_config_delivery_channel" "this" {
  name           = "${var.org_name}-log-archive-config-channel"
  s3_bucket_name = aws_s3_bucket.config.id

  depends_on = [
    aws_config_configuration_recorder.this,
    aws_s3_bucket_policy.config,
  ]
}

resource "aws_config_configuration_recorder_status" "this" {
  name       = aws_config_configuration_recorder.this.name
  is_enabled = true

  depends_on = [aws_config_delivery_channel.this]
}
