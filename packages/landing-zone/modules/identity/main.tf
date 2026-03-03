# ─── MODULE: IAM IDENTITY CENTER (SSO) ───────────────────────────────────────
# Centralized identity and access management using AWS IAM Identity Center
# (formerly AWS SSO). This replaces per-account IAM users with federated,
# role-based access.
#
# Resources:
#   - 4 permission sets: AdministratorAccess, ReadOnlyAccess, DeveloperAccess, SecurityAudit
#   - 3 Identity Store groups: platform-admins, developers, security-auditors
#
# What this does NOT create:
#   - Account assignments (which group gets which permission set in which account)
#     — these are managed per-account in the workload deployment, not here.
#   - Users — add users via the Identity Center console or SCIM sync from your IdP.
#   - External IdP configuration (Okta, Azure AD) — done in the console.
#
# IAM Identity Center is always enabled in the management account.
# This module runs in the MANAGEMENT account.
#
# SOC2 controls:
#   CC6.1 — Logical access to resources via centralized identity
#   CC6.2 — MFA enforced at the identity provider level
#   CC6.3 — Role-based access control (RBAC) via permission sets

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
    Module = "identity"
  })
}

# ─── SSO INSTANCE ─────────────────────────────────────────────────────────────
# Identity Center is enabled in the management account by AWS automatically
# when the organization has all features enabled. We use a data source to
# get the instance ARN rather than creating it (it's not a Terraform-managed resource).

data "aws_ssoadmin_instances" "this" {}

locals {
  sso_instance_arn      = tolist(data.aws_ssoadmin_instances.this.arns)[0]
  identity_store_id     = tolist(data.aws_ssoadmin_instances.this.identity_store_ids)[0]
}

# ─── PERMISSION SETS ──────────────────────────────────────────────────────────
# A permission set is a template of permissions that gets applied when a user
# assumes a role in a target account. Each permission set creates an IAM role
# in the target account when an account assignment is made.

# AdministratorAccess — full admin. Only for platform-admins group in break-glass scenarios.
resource "aws_ssoadmin_permission_set" "administrator" {
  name             = "AdministratorAccess"
  description      = "Full administrator access. Use only for break-glass scenarios."
  instance_arn     = local.sso_instance_arn
  session_duration = "PT4H" # 4-hour session — reduce blast radius of stolen session

  tags = local.common_tags
}

resource "aws_ssoadmin_managed_policy_attachment" "administrator" {
  instance_arn       = local.sso_instance_arn
  managed_policy_arn = "arn:aws:iam::aws:policy/AdministratorAccess"
  permission_set_arn = aws_ssoadmin_permission_set.administrator.arn
}

# ReadOnlyAccess — read-only across all services. For auditors and executives.
resource "aws_ssoadmin_permission_set" "read_only" {
  name             = "ReadOnlyAccess"
  description      = "Read-only access to all AWS services. For auditors and executives."
  instance_arn     = local.sso_instance_arn
  session_duration = "PT8H"

  tags = local.common_tags
}

resource "aws_ssoadmin_managed_policy_attachment" "read_only" {
  instance_arn       = local.sso_instance_arn
  managed_policy_arn = "arn:aws:iam::aws:policy/ReadOnlyAccess"
  permission_set_arn = aws_ssoadmin_permission_set.read_only.arn
}

# DeveloperAccess — scoped to services devs need. No IAM, no org-level access.
# Custom inline policy for least-privilege developer access.
resource "aws_ssoadmin_permission_set" "developer" {
  name             = "DeveloperAccess"
  description      = "Scoped developer access: ECS, ECR, Lambda, S3, RDS, CloudWatch, Secrets Manager. No IAM admin."
  instance_arn     = local.sso_instance_arn
  session_duration = "PT8H"

  tags = local.common_tags
}

# Attach AWS managed PowerUserAccess as the base — then deny IAM/Org actions via inline
resource "aws_ssoadmin_managed_policy_attachment" "developer" {
  instance_arn       = local.sso_instance_arn
  managed_policy_arn = "arn:aws:iam::aws:policy/PowerUserAccess"
  permission_set_arn = aws_ssoadmin_permission_set.developer.arn
}

# Inline policy on the developer permission set — deny IAM mutations and org access
# This overrides the broad PowerUserAccess for the specific risky actions
resource "aws_ssoadmin_permission_set_inline_policy" "developer_deny_iam" {
  instance_arn       = local.sso_instance_arn
  permission_set_arn = aws_ssoadmin_permission_set.developer.arn

  inline_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "DenyIAMMutations"
        Effect = "Deny"
        Action = [
          "iam:CreateUser",
          "iam:DeleteUser",
          "iam:CreateRole",
          "iam:DeleteRole",
          "iam:PutRolePolicy",
          "iam:AttachRolePolicy",
          "iam:DetachRolePolicy",
          "iam:CreatePolicy",
          "iam:DeletePolicy",
          "iam:CreateAccessKey",
          "iam:DeleteAccessKey",
          "iam:UpdateAccountPasswordPolicy",
          "iam:PassRole",
        ]
        Resource = ["*"]
      },
      {
        Sid    = "DenyOrgAccess"
        Effect = "Deny"
        Action = [
          "organizations:*",
          "account:*",
        ]
        Resource = ["*"]
      },
      {
        Sid    = "DenySecurityToolsMutations"
        Effect = "Deny"
        Action = [
          "guardduty:DeleteDetector",
          "guardduty:DisassociateFromMasterAccount",
          "cloudtrail:DeleteTrail",
          "cloudtrail:StopLogging",
          "config:DeleteConfigurationRecorder",
          "config:StopConfigurationRecorder",
        ]
        Resource = ["*"]
      }
    ]
  })
}

# SecurityAudit — read-only across security services. For compliance auditors.
resource "aws_ssoadmin_permission_set" "security_audit" {
  name             = "SecurityAudit"
  description      = "Read-only access to security services: GuardDuty, SecurityHub, Config, CloudTrail, IAM."
  instance_arn     = local.sso_instance_arn
  session_duration = "PT8H"

  tags = local.common_tags
}

resource "aws_ssoadmin_managed_policy_attachment" "security_audit" {
  instance_arn       = local.sso_instance_arn
  managed_policy_arn = "arn:aws:iam::aws:policy/SecurityAudit"
  permission_set_arn = aws_ssoadmin_permission_set.security_audit.arn
}

# Add ViewOnlyAccess for billing/cost visibility during audits
resource "aws_ssoadmin_managed_policy_attachment" "security_audit_view_only" {
  instance_arn       = local.sso_instance_arn
  managed_policy_arn = "arn:aws:iam::aws:policy/job-function/ViewOnlyAccess"
  permission_set_arn = aws_ssoadmin_permission_set.security_audit.arn
}

# ─── IDENTITY STORE GROUPS ────────────────────────────────────────────────────
# Groups map to permission sets via account assignments.
# Users are added to groups — not directly to permission sets.
# This is the RBAC pattern: User → Group → Permission Set → Account Role.

resource "aws_identitystore_group" "platform_admins" {
  identity_store_id = local.identity_store_id
  display_name      = "platform-admins"
  description       = "Platform engineering team — full admin access via break-glass. Requires approval workflow."
}

resource "aws_identitystore_group" "developers" {
  identity_store_id = local.identity_store_id
  display_name      = "developers"
  description       = "Product engineers — scoped access to application services in workload accounts."
}

resource "aws_identitystore_group" "security_auditors" {
  identity_store_id = local.identity_store_id
  display_name      = "security-auditors"
  description       = "Security and compliance team — read-only access to security services in all accounts."
}
