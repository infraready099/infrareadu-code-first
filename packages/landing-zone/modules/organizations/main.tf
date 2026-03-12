# ─── MODULE: ORGANIZATIONS ───────────────────────────────────────────────────
# Creates and configures the AWS Organization with:
#   - All features enabled (required for SCPs and service delegated admins)
#   - Trusted AWS service access for all Landing Zone services
#   - 4-OU hierarchy: Security, Infrastructure, Workloads, Sandbox
#   - 6 sub-accounts via Account Factory
#
# This module runs in the MANAGEMENT account.
# It must complete before any other Landing Zone module runs.

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
    Module = "organizations"
  })
}

# ─── AWS ORGANIZATION ────────────────────────────────────────────────────────

resource "aws_organizations_organization" "this" {
  # ALL is the correct value for full-features mode (SCPs, delegated admins, service access).
  # AWS docs say "ALL" = All Features; "CONSOLIDATED_BILLING" = billing-only mode.
  feature_set = "ALL"

  # Enable service access so these services can operate org-wide.
  # Each entry allows the service's APIs to call Organizations on your behalf.
  aws_service_access_principals = [
    "cloudtrail.amazonaws.com",
    "config.amazonaws.com",
    "config-multiaccountsetup.amazonaws.com",
    "guardduty.amazonaws.com",
    "securityhub.amazonaws.com",
    "sso.amazonaws.com",
    "account.amazonaws.com",
    "ram.amazonaws.com",
    "backup.amazonaws.com",
    "inspector2.amazonaws.com",
    "malware-protection.guardduty.amazonaws.com",
  ]

  # Enable policy types so SCPs can be attached
  enabled_policy_types = [
    "SERVICE_CONTROL_POLICY",
    "TAG_POLICY",
  ]
}

# ─── ORGANIZATIONAL UNITS ─────────────────────────────────────────────────────
# Hierarchy: Root → Security OU, Infrastructure OU, Workloads OU, Sandbox OU
# The root ID is fetched from the org resource — only one root exists per org.

locals {
  root_id = aws_organizations_organization.this.roots[0].id
}

resource "aws_organizations_organizational_unit" "security" {
  name      = "Security"
  parent_id = local.root_id

  tags = merge(local.common_tags, {
    Name    = "${var.org_name}-ou-security"
    Purpose = "Centralized security services — GuardDuty master, SecurityHub, Config aggregator"
  })
}

resource "aws_organizations_organizational_unit" "infrastructure" {
  name      = "Infrastructure"
  parent_id = local.root_id

  tags = merge(local.common_tags, {
    Name    = "${var.org_name}-ou-infrastructure"
    Purpose = "Shared infrastructure — Transit Gateway, centralized egress, DNS"
  })
}

resource "aws_organizations_organizational_unit" "workloads" {
  name      = "Workloads"
  parent_id = local.root_id

  tags = merge(local.common_tags, {
    Name    = "${var.org_name}-ou-workloads"
    Purpose = "Customer workload accounts — prod, staging, dev"
  })
}

resource "aws_organizations_organizational_unit" "sandbox" {
  name      = "Sandbox"
  parent_id = local.root_id

  tags = merge(local.common_tags, {
    Name    = "${var.org_name}-ou-sandbox"
    Purpose = "Developer sandboxes — less restrictive SCPs, auto-cleanup"
  })
}

# ─── ACCOUNT FACTORY ──────────────────────────────────────────────────────────
# Creates all sub-accounts. Each account is a separate billing entity.
#
# IMPORTANT: Account creation is slow (up to 4 minutes per account) and
# AWS allows max 5 concurrent account creation requests. OpenTofu will
# parallelize up to that limit automatically.
#
# After creation, each account gets a bootstrap IAM role via a delegated
# CloudFormation StackSet (not managed here — see infra/bootstrap/).

resource "aws_organizations_account" "security" {
  name      = "${var.org_name}-security"
  email     = var.account_emails.security
  parent_id = aws_organizations_organizational_unit.security.id

  # Close the account when destroyed — set to false in prod to prevent accidents
  close_on_deletion = false

  # Prevent role_name from being recreated on every plan
  # (AWS auto-creates OrganizationAccountAccessRole)
  role_name = "OrganizationAccountAccessRole"

  tags = merge(local.common_tags, {
    Name        = "${var.org_name}-security"
    AccountType = "security"
    OU          = "Security"
  })

  lifecycle {
    # Email cannot be changed after account creation
    ignore_changes = [email, name, role_name]
  }
}

resource "aws_organizations_account" "log_archive" {
  name      = "${var.org_name}-log-archive"
  email     = var.account_emails.log_archive
  parent_id = aws_organizations_organizational_unit.security.id

  close_on_deletion = false
  role_name         = "OrganizationAccountAccessRole"

  tags = merge(local.common_tags, {
    Name        = "${var.org_name}-log-archive"
    AccountType = "log-archive"
    OU          = "Security"
  })

  lifecycle {
    ignore_changes = [email, name, role_name]
  }
}

resource "aws_organizations_account" "network" {
  name      = "${var.org_name}-network"
  email     = var.account_emails.network
  parent_id = aws_organizations_organizational_unit.infrastructure.id

  close_on_deletion = false
  role_name         = "OrganizationAccountAccessRole"

  tags = merge(local.common_tags, {
    Name        = "${var.org_name}-network"
    AccountType = "network"
    OU          = "Infrastructure"
  })

  lifecycle {
    ignore_changes = [email, name, role_name]
  }
}

resource "aws_organizations_account" "prod" {
  name      = "${var.org_name}-prod"
  email     = var.account_emails.prod
  parent_id = aws_organizations_organizational_unit.workloads.id

  close_on_deletion = false
  role_name         = "OrganizationAccountAccessRole"

  tags = merge(local.common_tags, {
    Name        = "${var.org_name}-prod"
    AccountType = "workload"
    Environment = "prod"
    OU          = "Workloads"
  })

  lifecycle {
    ignore_changes = [email, name, role_name]
  }
}

resource "aws_organizations_account" "staging" {
  name      = "${var.org_name}-staging"
  email     = var.account_emails.staging
  parent_id = aws_organizations_organizational_unit.workloads.id

  close_on_deletion = false
  role_name         = "OrganizationAccountAccessRole"

  tags = merge(local.common_tags, {
    Name        = "${var.org_name}-staging"
    AccountType = "workload"
    Environment = "staging"
    OU          = "Workloads"
  })

  lifecycle {
    ignore_changes = [email, name, role_name]
  }
}

resource "aws_organizations_account" "dev" {
  name      = "${var.org_name}-dev"
  email     = var.account_emails.dev
  parent_id = aws_organizations_organizational_unit.workloads.id

  close_on_deletion = false
  role_name         = "OrganizationAccountAccessRole"

  tags = merge(local.common_tags, {
    Name        = "${var.org_name}-dev"
    AccountType = "workload"
    Environment = "dev"
    OU          = "Workloads"
  })

  lifecycle {
    ignore_changes = [email, name, role_name]
  }
}

# ─── IAM ACCOUNT PASSWORD POLICY ─────────────────────────────────────────────
# CIS AWS Foundations 1.8–1.11 — Strong password policy for IAM users.
# Applies to the management account. Member account password policies should be
# set via a Config rule or StackSet — this covers the management account root.
#
# SOC2 CC6.1: Logical access controls.

resource "aws_iam_account_password_policy" "this" {
  minimum_password_length        = 14
  require_numbers                = true
  require_symbols                = true
  require_uppercase_characters   = true
  require_lowercase_characters   = true
  allow_users_to_change_password = true
  hard_expiry                    = false
  max_password_age               = 90
  password_reuse_prevention      = 24
}

# ─── IAM ACCESS ANALYZER (ORGANIZATION LEVEL) ─────────────────────────────────
# IAM Access Analyzer identifies resource-based policies granting unintended
# external access. Organization-level analyzer covers all member accounts.
#
# CIS AWS Foundations 1.21 — IAM Access Analyzer enabled.
# SOC2 CC6.3: Logical and physical access removed on termination.

resource "aws_accessanalyzer_analyzer" "org" {
  analyzer_name = "${var.org_name}-org-analyzer"
  type          = "ORGANIZATION"

  tags = merge(local.common_tags, {
    Name = "${var.org_name}-org-analyzer"
  })

  depends_on = [aws_organizations_organization.this]
}

# ─── ROOT ACCOUNT ACTIVITY ALARM ─────────────────────────────────────────────
# CIS AWS Foundations 1.7 — Alert on root account logins.
# CloudTrail metric filter + CloudWatch alarm + SNS notification.
#
# NOTE: CloudTrail must be enabled and delivering to CloudWatch Logs in the
# management account. The org trail (in the logging module) covers this.
# This alarm references the log group created by the org CloudTrail.

resource "aws_cloudwatch_log_metric_filter" "root_login" {
  name           = "${var.org_name}-root-account-usage"
  log_group_name = "/aws/cloudtrail/${var.org_name}-org-trail"

  pattern = "{ $.userIdentity.type = \"Root\" && $.userIdentity.invokedBy NOT EXISTS && $.eventType != \"AwsServiceEvent\" }"

  metric_transformation {
    name      = "RootAccountUsage"
    namespace = "${var.org_name}/CISControls"
    value     = "1"
  }
}

resource "aws_sns_topic" "root_login_alerts" {
  name = "${var.org_name}-root-login-alerts"

  tags = merge(local.common_tags, {
    Name = "${var.org_name}-root-login-alerts"
  })
}

resource "aws_cloudwatch_metric_alarm" "root_login" {
  alarm_name          = "${var.org_name}-root-account-usage"
  alarm_description   = "Root account activity detected. CIS 1.7 — immediate investigation required."
  metric_name         = "RootAccountUsage"
  namespace           = "${var.org_name}/CISControls"
  statistic           = "Sum"
  period              = 60
  evaluation_periods  = 1
  threshold           = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"

  alarm_actions = [aws_sns_topic.root_login_alerts.arn]

  tags = merge(local.common_tags, {
    Name        = "${var.org_name}-root-login-alarm"
    CISControl  = "1.7"
    SOC2Control = "CC7.3"
  })

  depends_on = [aws_cloudwatch_log_metric_filter.root_login]
}
