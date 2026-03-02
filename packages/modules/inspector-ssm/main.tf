# ─── INSPECTOR v2 + SYSTEMS MANAGER MODULE ───────────────────────────────────
#
# AWS Inspector v2:
#   Continuously scans EC2 instances, Lambda functions, and ECR container images
#   for known CVEs (Common Vulnerabilities and Exposures).
#   SOC2 CC7.1 — Threat and vulnerability management
#   HIPAA §164.308(a)(8) — Evaluation: regular technical security evaluations
#
# AWS Systems Manager (SSM):
#   Replaces SSH and bastion hosts entirely. Engineers access servers through
#   SSM Session Manager — no open port 22, no SSH keys to manage, no bastion host.
#   Every session is logged to CloudWatch and S3.
#   SOC2 CC6.2 — Access controls, authentication
#   CIS 3.15 — No SSH key pairs, use SSM instead

locals {
  name = "${var.project_name}-${var.environment}"

  common_tags = merge(var.tags, {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "infraready"
    Module      = "inspector-ssm"
  })
}

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

# ─── AWS INSPECTOR v2 ─────────────────────────────────────────────────────────

resource "aws_inspector2_enabler" "this" {
  count          = var.enable_inspector ? 1 : 0
  account_ids    = [data.aws_caller_identity.current.account_id]

  resource_types = [
    "ECR",      # Container image scanning — every image pushed to ECR is scanned
    "EC2",      # EC2 instance scanning — running CVE checks
    "LAMBDA",   # Lambda function scanning — checks dependencies for CVEs
  ]
}

# Route HIGH and CRITICAL Inspector findings to SNS
resource "aws_cloudwatch_event_rule" "inspector_critical" {
  count       = var.enable_inspector && var.alert_topic_arn != "" ? 1 : 0
  name        = "${local.name}-inspector-critical"
  description = "Route Inspector v2 CRITICAL/HIGH findings to SNS for immediate response"

  event_pattern = jsonencode({
    source      = ["aws.inspector2"]
    detail-type = ["Inspector2 Finding"]
    detail = {
      severity = ["CRITICAL", "HIGH"]
      status   = ["ACTIVE"]
    }
  })
}

resource "aws_cloudwatch_event_target" "inspector_sns" {
  count     = var.enable_inspector && var.alert_topic_arn != "" ? 1 : 0
  rule      = aws_cloudwatch_event_rule.inspector_critical[0].name
  target_id = "SendToSNS"
  arn       = var.alert_topic_arn
}

# ─── SSM SESSION MANAGER ──────────────────────────────────────────────────────
# All session activity is logged — who connected, when, every command typed.
# Auditors love this: it's the audit trail for "privileged access" (SOC2 CC6.3)

resource "aws_cloudwatch_log_group" "ssm_sessions" {
  name              = "/infraready/${local.name}/ssm-sessions"
  retention_in_days = 365
  kms_key_id        = var.cloudwatch_log_key_arn

  tags = merge(local.common_tags, { Name = "${local.name}-ssm-sessions" })
}

resource "aws_s3_bucket" "ssm_sessions" {
  bucket        = "${local.name}-ssm-sessions-${data.aws_caller_identity.current.account_id}"
  force_destroy = false
  tags          = merge(local.common_tags, { Name = "${local.name}-ssm-sessions" })
}

resource "aws_s3_bucket_public_access_block" "ssm_sessions" {
  bucket                  = aws_s3_bucket.ssm_sessions.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "ssm_sessions" {
  bucket = aws_s3_bucket.ssm_sessions.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = var.kms_key_arn
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_policy" "ssm_sessions" {
  bucket = aws_s3_bucket.ssm_sessions.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "DenyNonTLS"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:*"
        Resource  = ["${aws_s3_bucket.ssm_sessions.arn}", "${aws_s3_bucket.ssm_sessions.arn}/*"]
        Condition = { Bool = { "aws:SecureTransport" = "false" } }
      },
      {
        Sid       = "DenyDelete"
        Effect    = "Deny"
        Principal = "*"
        Action    = ["s3:DeleteObject", "s3:DeleteObjectVersion"]
        Resource  = "${aws_s3_bucket.ssm_sessions.arn}/*"
      }
    ]
  })
}

resource "aws_ssm_document" "session_preferences" {
  name            = "${local.name}-session-preferences"
  document_type   = "Session"
  document_format = "JSON"

  content = jsonencode({
    schemaVersion = "1.0"
    description   = "Session Manager preferences for ${local.name} — all sessions logged"
    sessionType   = "Standard_Stream"
    inputs = {
      s3BucketName                = aws_s3_bucket.ssm_sessions.id
      s3KeyPrefix                 = "sessions"
      s3EncryptionEnabled         = true
      cloudWatchLogGroupName      = aws_cloudwatch_log_group.ssm_sessions.name
      cloudWatchEncryptionEnabled = true
      cloudWatchStreamingEnabled  = true
      idleSessionTimeout          = "20"            # Disconnect idle sessions after 20 min
      maxSessionDuration          = "60"            # Max 60 min per session
      kmsKeyId                    = var.kms_key_arn # Encrypt the session stream itself
      runAsEnabled                = false
      shellProfile = {
        linux   = "exec bash"
        windows = ""
      }
    }
  })

  tags = local.common_tags
}

# ─── SSM PATCH MANAGER ────────────────────────────────────────────────────────
# Automates OS patching — satisfies SOC2 CC7.1 (vulnerability management)
# and HIPAA §164.308(a)(8) (technical evaluation / patch management)

resource "aws_ssm_patch_baseline" "linux" {
  count            = var.enable_ssm_patch_manager ? 1 : 0
  name             = "${local.name}-linux-baseline"
  description      = "Production patch baseline for ${local.name} — auto-approves security patches"
  operating_system = "AMAZON_LINUX_2023"

  # Auto-approve SECURITY patches 7 days after release
  # 7 days allows time for patches to be validated — balance security vs stability
  approval_rule {
    approve_after_days = 7
    compliance_level   = "HIGH"
    enable_non_security = false # Only security patches, not feature updates

    patch_filter {
      key    = "CLASSIFICATION"
      values = ["Security", "Bugfix", "Critical"]
    }

    patch_filter {
      key    = "SEVERITY"
      values = ["Critical", "Important", "Medium"]
    }
  }

  tags = local.common_tags
}

resource "aws_ssm_maintenance_window" "patching" {
  count             = var.enable_ssm_patch_manager ? 1 : 0
  name              = "${local.name}-patching-window"
  schedule          = var.patch_schedule
  duration          = 4     # 4-hour window
  cutoff            = 1     # Stop initiating 1 hour before window closes
  allow_unassociated_targets = false

  tags = local.common_tags
}

resource "aws_ssm_maintenance_window_target" "patching" {
  count             = var.enable_ssm_patch_manager ? 1 : 0
  window_id         = aws_ssm_maintenance_window.patching[0].id
  name              = "all-infraready-instances"
  description       = "All instances managed by InfraReady"
  resource_type     = "INSTANCE"

  # Tag-based — any EC2 tagged ManagedBy=infraready is patched automatically
  targets {
    key    = "tag:ManagedBy"
    values = ["infraready"]
  }
}

resource "aws_ssm_maintenance_window_task" "patching" {
  count           = var.enable_ssm_patch_manager ? 1 : 0
  window_id       = aws_ssm_maintenance_window.patching[0].id
  task_type       = "RUN_COMMAND"
  task_arn        = "AWS-RunPatchBaseline"
  priority        = 1
  service_role_arn = aws_iam_role.ssm_maintenance.arn

  targets {
    key    = "WindowTargetIds"
    values = [aws_ssm_maintenance_window_target.patching[0].id]
  }

  task_invocation_parameters {
    run_command_parameters {
      output_s3_bucket     = aws_s3_bucket.ssm_sessions.id
      output_s3_key_prefix = "patch-logs"
      timeout_seconds      = 600

      parameter {
        name   = "Operation"
        values = ["Install"]
      }

      parameter {
        name   = "RebootOption"
        values = ["RebootIfNeeded"]
      }
    }
  }
}

resource "aws_iam_role" "ssm_maintenance" {
  name = "${local.name}-ssm-maintenance-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "ssm.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })

  tags = local.common_tags
}

resource "aws_iam_role_policy_attachment" "ssm_maintenance" {
  role       = aws_iam_role.ssm_maintenance.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonSSMMaintenanceWindowRole"
}

# ─── CLOUDWATCH ALARM FOR PATCH COMPLIANCE ───────────────────────────────────

resource "aws_cloudwatch_metric_alarm" "non_compliant_patches" {
  count               = var.enable_ssm_patch_manager && var.alert_topic_arn != "" ? 1 : 0
  alarm_name          = "${local.name}-non-compliant-patches"
  alarm_description   = "Instances with non-compliant patches detected"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "NonCompliantInstance"
  namespace           = "AWS/SSM"
  period              = 86400 # Check daily
  statistic           = "Sum"
  threshold           = 0
  alarm_actions       = [var.alert_topic_arn]
  treat_missing_data  = "notBreaching"

  tags = local.common_tags
}
