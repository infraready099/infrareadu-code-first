# ─── MODULE: SERVICE CONTROL POLICIES ────────────────────────────────────────
# SCPs are IAM-like policies attached to OUs or the org root.
# They set the MAXIMUM permissions available to any principal in the OU —
# even the root user of member accounts cannot exceed them.
#
# This module creates 3 SCPs:
#   1. deny-root-usage        → attached to all workload OUs
#   2. deny-regions           → attached to all OUs (root-level)
#   3. require-tags           → attached to Workloads OU
#
# SCPs do NOT apply to the management account — it is exempt by design.
# This module runs in the MANAGEMENT account.

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
    Module = "scp"
  })
}

# ─── SCP 1: DENY ROOT ACCOUNT USAGE ──────────────────────────────────────────
# CIS AWS Foundations 1.1 — Root account should not be used for day-to-day work.
# This SCP denies all actions when the caller is the root user of any member account.
# Exceptions: actions that can ONLY be performed by root (e.g. billing, support) are
# not blocked because SCPs cannot override AWS service-specific root-only actions.

resource "aws_organizations_policy" "deny_root_usage" {
  name        = "${var.org_name}-deny-root-usage"
  description = "Deny all actions taken by root user in member accounts. CIS 1.1."
  type        = "SERVICE_CONTROL_POLICY"

  content = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "DenyRootUser"
        Effect = "Deny"
        Action = ["*"]
        Resource = ["*"]
        Condition = {
          StringLike = {
            "aws:PrincipalArn" = ["arn:aws:iam::*:root"]
          }
        }
      }
    ]
  })

  tags = merge(local.common_tags, {
    Name = "${var.org_name}-scp-deny-root"
  })
}

# Attach deny-root to Security OU, Infrastructure OU, Workloads OU, Sandbox OU
# Not attached to root — management account is exempt but we want all child OUs covered.

resource "aws_organizations_policy_attachment" "deny_root_security" {
  policy_id = aws_organizations_policy.deny_root_usage.id
  target_id = var.ou_ids["security"]
}

resource "aws_organizations_policy_attachment" "deny_root_infrastructure" {
  policy_id = aws_organizations_policy.deny_root_usage.id
  target_id = var.ou_ids["infrastructure"]
}

resource "aws_organizations_policy_attachment" "deny_root_workloads" {
  policy_id = aws_organizations_policy.deny_root_usage.id
  target_id = var.ou_ids["workloads"]
}

resource "aws_organizations_policy_attachment" "deny_root_sandbox" {
  policy_id = aws_organizations_policy.deny_root_usage.id
  target_id = var.ou_ids["sandbox"]
}

# ─── SCP 2: DENY NON-APPROVED REGIONS ────────────────────────────────────────
# Prevents any action in regions not in var.allowed_regions.
# This limits blast radius if credentials are compromised — attacker can't spin
# up resources in ap-southeast-1 that your team doesn't monitor.
#
# Critical exceptions:
# - Global services (IAM, STS, S3 control plane, CloudFront, Route53) use us-east-1
#   as their endpoint regardless of region — these must be excluded from the deny.
# - AWS Organizations API is always global.

resource "aws_organizations_policy" "deny_regions" {
  name        = "${var.org_name}-deny-non-approved-regions"
  description = "Deny all actions in regions not in the approved list. Exceptions for global services."
  type        = "SERVICE_CONTROL_POLICY"

  content = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "DenyNonApprovedRegions"
        Effect = "Deny"
        # Deny everything NOT in the approved region set
        NotAction = [
          # Global services that don't have a regional endpoint —
          # blocking these would break IAM, billing, and AWS console access.
          "a4b:*",
          "acm:*",
          "aws-marketplace-management:*",
          "aws-marketplace:*",
          "aws-portal:*",
          "budgets:*",
          "ce:*",
          "chime:*",
          "cloudfront:*",
          "config:*",
          "cur:*",
          "directconnect:*",
          "ec2:DescribeRegions",
          "ec2:DescribeTransitGateways",
          "ec2:DescribeVpnGateways",
          "fms:*",
          "globalaccelerator:*",
          "health:*",
          "iam:*",
          "importexport:*",
          "kms:*",
          "mobileanalytics:*",
          "networkmanager:*",
          "organizations:*",
          "pricing:*",
          "route53:*",
          "route53domains:*",
          "route53resolver:*",
          "s3:GetAccountPublic*",
          "s3:ListAllMyBuckets",
          "s3:PutAccountPublic*",
          "shield:*",
          "sts:*",
          "support:*",
          "trustedadvisor:*",
          "waf-regional:*",
          "waf:*",
          "wafv2:*",
        ]
        Resource = ["*"]
        Condition = {
          StringNotEquals = {
            "aws:RequestedRegion" = var.allowed_regions
          }
        }
      }
    ]
  })

  tags = merge(local.common_tags, {
    Name = "${var.org_name}-scp-deny-regions"
  })
}

# Attach deny-regions to the org root so it applies to all accounts in all OUs.
# Management account is exempt from SCPs per AWS design, so this is safe.

resource "aws_organizations_policy_attachment" "deny_regions_root" {
  policy_id = aws_organizations_policy.deny_regions.id
  target_id = var.root_id
}

# ─── SCP 3: REQUIRE MANDATORY TAGS ───────────────────────────────────────────
# Deny resource creation if required tags are missing.
# Required tags: Project, Environment, ManagedBy
#
# This covers the most common resource types. Tag policies (AWS Tag Policies)
# are the right long-term solution, but SCPs work here without additional
# infrastructure and enforce at deploy time.
#
# IMPORTANT: Not all AWS APIs support Condition keys on tags. This SCP targets
# the resource-creation APIs where it's supported (EC2, RDS, ECS, S3, Lambda).
# Review the AWS docs for full coverage: https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_aws-services-that-work-with-iam.html

resource "aws_organizations_policy" "require_tags" {
  name        = "${var.org_name}-require-mandatory-tags"
  description = "Deny creation of EC2, RDS, ECS, Lambda, and S3 resources without required tags."
  type        = "SERVICE_CONTROL_POLICY"

  content = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "DenyEC2WithoutRequiredTags"
        Effect = "Deny"
        Action = [
          "ec2:RunInstances",
          "ec2:CreateVolume",
          "ec2:CreateSecurityGroup",
          "ec2:CreateVpc",
          "ec2:CreateSubnet",
        ]
        Resource = ["*"]
        Condition = {
          "Null" = {
            "aws:RequestTag/Project"     = "true"
            "aws:RequestTag/Environment" = "true"
            "aws:RequestTag/ManagedBy"   = "true"
          }
        }
      },
      {
        Sid    = "DenyRDSWithoutRequiredTags"
        Effect = "Deny"
        Action = [
          "rds:CreateDBInstance",
          "rds:CreateDBCluster",
        ]
        Resource = ["*"]
        Condition = {
          "Null" = {
            "aws:RequestTag/Project"     = "true"
            "aws:RequestTag/Environment" = "true"
            "aws:RequestTag/ManagedBy"   = "true"
          }
        }
      },
      {
        Sid    = "DenyECSWithoutRequiredTags"
        Effect = "Deny"
        Action = [
          "ecs:CreateCluster",
          "ecs:RegisterTaskDefinition",
          "ecs:CreateService",
        ]
        Resource = ["*"]
        Condition = {
          "Null" = {
            "aws:RequestTag/Project"     = "true"
            "aws:RequestTag/Environment" = "true"
            "aws:RequestTag/ManagedBy"   = "true"
          }
        }
      },
      {
        Sid    = "DenyLambdaWithoutRequiredTags"
        Effect = "Deny"
        Action = [
          "lambda:CreateFunction",
          "lambda:TagResource",
        ]
        Resource = ["*"]
        Condition = {
          "Null" = {
            "aws:RequestTag/Project"     = "true"
            "aws:RequestTag/Environment" = "true"
            "aws:RequestTag/ManagedBy"   = "true"
          }
        }
      }
    ]
  })

  tags = merge(local.common_tags, {
    Name = "${var.org_name}-scp-require-tags"
  })
}

# Attach require-tags to the Workloads OU only.
# We don't enforce on Security/Infrastructure OUs because Landing Zone bootstrap
# resources are created before tags can be applied in some cases.

resource "aws_organizations_policy_attachment" "require_tags_workloads" {
  policy_id = aws_organizations_policy.require_tags.id
  target_id = var.ou_ids["workloads"]
}

# ─── SCP 4: PROTECT LANDING ZONE RESOURCES ───────────────────────────────────
# Prevent any principal (including account admins) from deleting or modifying
# core Landing Zone infrastructure: CloudTrail, Config recorder, GuardDuty detector.
# This SCP is a guardrail against accidental or malicious disablement of security controls.

resource "aws_organizations_policy" "protect_lz_controls" {
  name        = "${var.org_name}-protect-lz-controls"
  description = "Deny deletion or disablement of core Landing Zone security controls."
  type        = "SERVICE_CONTROL_POLICY"

  content = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "ProtectCloudTrail"
        Effect = "Deny"
        Action = [
          "cloudtrail:DeleteTrail",
          "cloudtrail:StopLogging",
          "cloudtrail:UpdateTrail",
        ]
        Resource = ["*"]
        Condition = {
          StringEquals = {
            "cloudtrail:TrailArn" = [
              "arn:aws:cloudtrail:*:*:trail/${var.org_name}-org-trail"
            ]
          }
        }
      },
      {
        Sid    = "ProtectGuardDuty"
        Effect = "Deny"
        Action = [
          "guardduty:DeleteDetector",
          "guardduty:DisassociateFromMasterAccount",
          "guardduty:StopMonitoringMembers",
          "guardduty:DisableOrganizationAdminAccount",
        ]
        Resource = ["*"]
      },
      {
        Sid    = "ProtectConfigRecorder"
        Effect = "Deny"
        Action = [
          "config:DeleteConfigurationRecorder",
          "config:StopConfigurationRecorder",
          "config:DeleteDeliveryChannel",
        ]
        Resource = ["*"]
      },
      {
        Sid    = "ProtectLogArchiveBucket"
        Effect = "Deny"
        Action = [
          "s3:DeleteBucket",
          "s3:DeleteBucketPolicy",
          "s3:PutBucketAcl",
          "s3:PutEncryptionConfiguration",
        ]
        Resource = [
          "arn:aws:s3:::${var.org_name}-cloudtrail-logs*",
          "arn:aws:s3:::${var.org_name}-config-logs*",
        ]
      }
    ]
  })

  tags = merge(local.common_tags, {
    Name = "${var.org_name}-scp-protect-lz-controls"
  })
}

resource "aws_organizations_policy_attachment" "protect_lz_controls_root" {
  policy_id = aws_organizations_policy.protect_lz_controls.id
  target_id = var.root_id
}
