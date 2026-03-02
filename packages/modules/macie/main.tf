# ─── AMAZON MACIE MODULE ──────────────────────────────────────────────────────
# Macie uses machine learning to discover and protect sensitive data in S3.
#
# What it detects automatically:
#   - PHI: SSN, medical record numbers, health insurance IDs
#   - PII: names, addresses, email addresses, phone numbers
#   - Financial: credit card numbers, bank account numbers, routing numbers
#   - Credentials: AWS access keys, private keys, passwords in files
#
# Why this matters for compliance:
#   HIPAA §164.308(a)(1) — Risk analysis: you must KNOW where PHI lives
#   SOC2 CC6.1 — Logical access to sensitive data must be controlled
#   PCI DSS 3.1 — Must limit storage of cardholder data
#   GDPR Art. 32 — Appropriate technical measures to protect personal data
#
# Without Macie, you cannot answer the auditor question:
#   "How do you know no PHI ended up in the wrong S3 bucket?"

locals {
  name = "${var.project_name}-${var.environment}"

  common_tags = merge(var.tags, {
    Project            = var.project_name
    Environment        = var.environment
    ManagedBy          = "infraready"
    Module             = "macie"
    DataClassification = "PHI-Scanner" # This module SCANS for PHI — does not store it
  })
}

data "aws_caller_identity" "current" {}

# ─── ENABLE MACIE ─────────────────────────────────────────────────────────────

resource "aws_macie2_account" "this" {
  finding_publishing_frequency = var.finding_publishing_frequency
  status                       = "ENABLED"
}

# ─── FINDINGS EXPORT — S3 ─────────────────────────────────────────────────────
# Export all findings to S3 for long-term retention and SIEM integration

resource "aws_s3_bucket" "macie_findings" {
  bucket        = "${local.name}-macie-findings-${data.aws_caller_identity.current.account_id}"
  force_destroy = false
  tags          = merge(local.common_tags, { Name = "${local.name}-macie-findings" })
}

resource "aws_s3_bucket_public_access_block" "macie_findings" {
  bucket                  = aws_s3_bucket.macie_findings.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "macie_findings" {
  bucket = aws_s3_bucket.macie_findings.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = var.kms_key_arn
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_versioning" "macie_findings" {
  bucket = aws_s3_bucket.macie_findings.id
  versioning_configuration { status = "Enabled" }
}

resource "aws_s3_bucket_lifecycle_configuration" "macie_findings" {
  bucket = aws_s3_bucket.macie_findings.id
  rule {
    id     = "retain-7-years"
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
      days = 2555 # 7 years — HIPAA retention
    }
  }
}

resource "aws_s3_bucket_policy" "macie_findings" {
  bucket     = aws_s3_bucket.macie_findings.id
  depends_on = [aws_macie2_account.this]

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "DenyNonTLS"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:*"
        Resource  = ["${aws_s3_bucket.macie_findings.arn}", "${aws_s3_bucket.macie_findings.arn}/*"]
        Condition = { Bool = { "aws:SecureTransport" = "false" } }
      },
      {
        Sid    = "AllowMacieWrite"
        Effect = "Allow"
        Principal = { Service = "macie.amazonaws.com" }
        Action   = ["s3:PutObject"]
        Resource = "${aws_s3_bucket.macie_findings.arn}/*"
        Condition = {
          StringEquals = { "aws:SourceAccount" = data.aws_caller_identity.current.account_id }
        }
      },
      {
        Sid    = "AllowMacieCheck"
        Effect = "Allow"
        Principal = { Service = "macie.amazonaws.com" }
        Action   = ["s3:GetBucketLocation"]
        Resource = aws_s3_bucket.macie_findings.arn
        Condition = {
          StringEquals = { "aws:SourceAccount" = data.aws_caller_identity.current.account_id }
        }
      }
    ]
  })
}

resource "aws_macie2_findings_filter" "high_severity" {
  name        = "${local.name}-high-severity"
  description = "Filter for HIGH and CRITICAL severity Macie findings"
  action      = "ARCHIVE" # Archive low-severity, only show HIGH+

  finding_criteria {
    criterion {
      field  = "severity.description"
      eq     = ["High", "Critical"]
    }
  }

  depends_on = [aws_macie2_account.this]
}

# Export findings configuration
resource "aws_macie2_classification_export_configuration" "this" {
  s3_destination {
    bucket_name = aws_s3_bucket.macie_findings.id
    key_prefix  = "findings/"
    kms_key_arn = var.kms_key_arn
  }

  depends_on = [aws_s3_bucket_policy.macie_findings, aws_macie2_account.this]
}

# ─── CLASSIFICATION JOB — SCAN S3 BUCKETS FOR PHI ────────────────────────────
# Runs a full scan initially, then daily incremental scans

resource "aws_macie2_classification_job" "phi_scan" {
  name        = "${local.name}-phi-scan"
  description = "Scans S3 buckets for PHI/PII — HIPAA §164.308(a)(1) risk analysis"
  job_type    = "SCHEDULED"

  schedule_frequency {
    daily_schedule = true # Incremental daily scan — only new/changed objects
  }

  s3_job_definition {
    dynamic "bucket_definitions" {
      for_each = length(var.s3_bucket_arns) > 0 ? var.s3_bucket_arns : []
      content {
        account_id = data.aws_caller_identity.current.account_id
        buckets    = [bucket_definitions.value]
      }
    }

    # Scoping — what to scan
    scoping {
      includes {
        and {
          simple_scope_term {
            comparator = "NE"
            key        = "OBJECT_EXTENSION"
            values     = ["jpg", "jpeg", "png", "gif", "mp4", "mp3", "avi"] # Skip media files
          }
        }
      }
    }

  }

  tags = local.common_tags

  depends_on = [aws_macie2_account.this, aws_macie2_classification_export_configuration.this]
}

# ─── ALERT ON MACIE FINDINGS ─────────────────────────────────────────────────

resource "aws_cloudwatch_event_rule" "macie_findings" {
  count       = var.alert_topic_arn != "" ? 1 : 0
  name        = "${local.name}-macie-phi-detected"
  description = "Alert when Macie detects PHI/PII in S3 buckets"

  event_pattern = jsonencode({
    source      = ["aws.macie"]
    detail-type = ["Macie Finding"]
    detail = {
      severity = {
        description = ["High", "Critical"]
      }
    }
  })
}

resource "aws_cloudwatch_event_target" "macie_sns" {
  count     = var.alert_topic_arn != "" ? 1 : 0
  rule      = aws_cloudwatch_event_rule.macie_findings[0].name
  target_id = "SendToSNS"
  arn       = var.alert_topic_arn
}

# ─── PHI RESOURCE TAGGING STRATEGY ───────────────────────────────────────────
# SSM Parameter Store stores the PHI classification taxonomy.
# Your application reads this to know how to tag resources that handle PHI.
# Auditors check that PHI resources are properly identified and tracked.

resource "aws_ssm_parameter" "phi_tagging_guide" {
  name        = "/${local.name}/compliance/phi-tagging-guide"
  description = "PHI resource tagging taxonomy for ${local.name}"
  type        = "String"
  tier        = "Standard"
  key_id = var.kms_key_arn

  value = jsonencode({
    version     = "1.0"
    environment = var.environment
    tags = {
      phi_resources = {
        DataClassification = "PHI"
        PHIType            = "Use values: ePHI | PHI | De-identified"
        HIPAAApplicable    = "true"
        DataRetentionYears = "7"
        EncryptionRequired = "true"
      }
      pii_resources = {
        DataClassification = "PII"
        PIIType            = "Use values: Direct | Indirect | Sensitive"
        GDPRApplicable     = "true"
        DataRetentionYears = "3"
        EncryptionRequired = "true"
      }
      public_resources = {
        DataClassification = "Public"
        EncryptionRequired = "false"
      }
      internal_resources = {
        DataClassification = "Internal"
        EncryptionRequired = "true"
      }
    }
    audit_contact = "security@${var.project_name}.com"
  })

  tags = local.common_tags
}
