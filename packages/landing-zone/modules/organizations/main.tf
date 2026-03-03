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
  # ALL_FEATURES is required for SCPs, delegated admins, and service access
  feature_set = "ALL_FEATURES"

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
