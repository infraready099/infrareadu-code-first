# ─── MODULE: SECURITY SERVICES ───────────────────────────────────────────────
# Centralized security operations running in the dedicated security account.
#
# Resources:
#   - GuardDuty org-wide detector + malware protection + org admin delegation
#   - Security Hub with CIS v1.4, AFSBP, and PCI DSS standards
#   - AWS Config organization aggregator (aggregates findings from all accounts)
#
# This module runs in the SECURITY account (not the management account).
# The security account is designated as the delegated administrator for
# GuardDuty and Security Hub — this is an AWS best practice.
#
# SOC2 controls addressed:
#   CC7.1 — Threat detection (GuardDuty)
#   CC7.2 — System monitoring (Security Hub aggregation)
#   CC4.1 — Ongoing monitoring (Config aggregator)

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
    Module = "security"
  })
}

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

# ─── GUARDDUTY ────────────────────────────────────────────────────────────────
# GuardDuty detector in the security account.
# The management account uses aws_guardduty_organization_admin_account to
# delegate admin to this account — that resource runs in the root module
# using the management account provider.

resource "aws_guardduty_detector" "this" {
  enable = true

  # 6-hour finding update frequency is the SOC2/compliance sweet spot.
  # FIFTEEN_MINUTES is available for higher urgency environments.
  finding_publishing_frequency = "SIX_HOURS"

  datasources {
    s3_logs {
      enable = true
    }
    kubernetes {
      audit_logs {
        enable = true
      }
    }
    malware_protection {
      scan_ec2_instance_with_findings {
        ebs_volumes {
          enable = true
        }
      }
    }
  }

  tags = merge(local.common_tags, {
    Name = "${var.org_name}-guardduty-detector"
  })
}

# Designate this (security) account as the GuardDuty org administrator.
# Must be called from the management account context — but we model it
# here because it logically belongs to the security module.
# The actual resource is created via the management provider in root main.tf.
# We expose the detector ID for cross-module wiring.

resource "aws_guardduty_organization_configuration" "this" {
  auto_enable_organization_members = "ALL"
  detector_id                      = aws_guardduty_detector.this.id

  datasources {
    s3_logs {
      auto_enable = true
    }
    kubernetes {
      audit_logs {
        enable = true
      }
    }
    malware_protection {
      scan_ec2_instance_with_findings {
        ebs_volumes {
          auto_enable = true
        }
      }
    }
  }
}

# SNS topic for GuardDuty HIGH/CRITICAL findings
resource "aws_sns_topic" "security_alerts" {
  name = "${var.org_name}-security-alerts"

  tags = local.common_tags
}

# Route GuardDuty severity >= 7 (HIGH) findings to SNS
resource "aws_cloudwatch_event_rule" "guardduty_high" {
  name        = "${var.org_name}-guardduty-high-findings"
  description = "Capture GuardDuty HIGH and CRITICAL findings"

  event_pattern = jsonencode({
    source      = ["aws.guardduty"]
    detail-type = ["GuardDuty Finding"]
    detail = {
      severity = [
        { numeric = [">=", 7] }
      ]
    }
  })

  tags = local.common_tags
}

resource "aws_cloudwatch_event_target" "guardduty_sns" {
  rule      = aws_cloudwatch_event_rule.guardduty_high.name
  target_id = "GuardDutyToSNS"
  arn       = aws_sns_topic.security_alerts.arn
}

resource "aws_sns_topic_policy" "security_alerts" {
  arn = aws_sns_topic.security_alerts.arn

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowEventBridgePublish"
        Effect = "Allow"
        Principal = {
          Service = "events.amazonaws.com"
        }
        Action   = "sns:Publish"
        Resource = aws_sns_topic.security_alerts.arn
      }
    ]
  })
}

# ─── SECURITY HUB ─────────────────────────────────────────────────────────────
# Security Hub aggregates findings from GuardDuty, Inspector, Macie, Config, etc.
# into a single pane of glass. Delegated admin from management account.

resource "aws_securityhub_account" "this" {
  # Disable default standards — we enable them explicitly below for full control
  enable_default_standards  = false
  auto_enable_controls      = true
  control_finding_generator = "SECURITY_CONTROL"
}

# Enable org-wide auto-enrollment — new accounts automatically get Security Hub
resource "aws_securityhub_organization_configuration" "this" {
  auto_enable           = true
  auto_enable_standards = "DEFAULT"

  depends_on = [aws_securityhub_account.this]
}

# CIS AWS Foundations Benchmark v1.4
resource "aws_securityhub_standards_subscription" "cis" {
  standards_arn = "arn:aws:securityhub:${data.aws_region.current.name}::standards/cis-aws-foundations-benchmark/v/1.4.0"

  depends_on = [aws_securityhub_account.this]
}

# AWS Foundational Security Best Practices (covers 200+ checks)
resource "aws_securityhub_standards_subscription" "afsbp" {
  standards_arn = "arn:aws:securityhub:${data.aws_region.current.name}::standards/aws-foundational-security-best-practices/v/1.0.0"

  depends_on = [aws_securityhub_account.this]
}

# PCI DSS v3.2.1 — required for any payment card data handling
resource "aws_securityhub_standards_subscription" "pci_dss" {
  standards_arn = "arn:aws:securityhub:${data.aws_region.current.name}::standards/pci-dss/v/3.2.1"

  depends_on = [aws_securityhub_account.this]
}

# Route CRITICAL Security Hub findings to SNS
resource "aws_cloudwatch_event_rule" "securityhub_critical" {
  name        = "${var.org_name}-securityhub-critical"
  description = "Capture CRITICAL and HIGH Security Hub findings"

  event_pattern = jsonencode({
    source      = ["aws.securityhub"]
    detail-type = ["Security Hub Findings - Imported"]
    detail = {
      findings = {
        Severity = {
          Label = ["CRITICAL", "HIGH"]
        }
        Workflow = {
          Status = ["NEW"]
        }
        RecordState = ["ACTIVE"]
      }
    }
  })

  tags = local.common_tags
}

resource "aws_cloudwatch_event_target" "securityhub_sns" {
  rule      = aws_cloudwatch_event_rule.securityhub_critical.name
  target_id = "SecurityHubToSNS"
  arn       = aws_sns_topic.security_alerts.arn
}

# ─── AWS CONFIG AGGREGATOR ────────────────────────────────────────────────────
# An organization aggregator collects Config data from all accounts and regions.
# This gives a single view of compliance posture across the entire org.
#
# Must run in the account designated as Config delegated administrator.

resource "aws_iam_role" "config_aggregator" {
  name = "${var.org_name}-config-aggregator-role"

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

resource "aws_iam_role_policy_attachment" "config_aggregator" {
  role       = aws_iam_role.config_aggregator.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSConfigRoleForOrganizations"
}

# Allow this account to aggregate Config data from all accounts
resource "aws_config_aggregate_authorization" "this" {
  account_id = data.aws_caller_identity.current.account_id
  region     = data.aws_region.current.name

  tags = local.common_tags
}

# Organization-wide aggregator — collects from all accounts and all regions
resource "aws_config_configuration_aggregator" "org" {
  name = "${var.org_name}-org-aggregator"

  organization_aggregation_source {
    all_regions = true
    role_arn    = aws_iam_role.config_aggregator.arn
  }

  tags = merge(local.common_tags, {
    Name = "${var.org_name}-config-aggregator"
  })

  depends_on = [aws_iam_role_policy_attachment.config_aggregator]
}
