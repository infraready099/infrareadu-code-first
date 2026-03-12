# ─── INFRAREADY LANDING ZONE — ROOT MODULE ───────────────────────────────────
#
# Orchestrates 6 sub-modules to build a production multi-account AWS Landing Zone.
#
# Deployment sequence (enforced via depends_on):
#   1. organizations  — Create the org, OUs, and accounts
#   2. scp            — Attach guardrail SCPs to OUs
#   3. security       — GuardDuty, Security Hub, Config aggregator (security account)
#      logging        — Org CloudTrail, S3 log archive (log-archive account)
#      networking     — Transit Gateway, RAM share (network account)
#      identity       — SSO permission sets + groups (management account)
#
# IMPORTANT: This root module must run in the MANAGEMENT account.
# Sub-modules that require a different account (security, logging, networking)
# use aliased providers configured below. Pass the correct assume_role ARNs
# in your tfvars or backend configuration.

locals {
  common_tags = merge(var.tags, {
    ManagedBy   = "infraready"
    LandingZone = var.org_name
    OrgName     = var.org_name
  })
}

# ─── PROVIDER ALIASES ────────────────────────────────────────────────────────
# Each sub-account module requires a provider that assumes a role in that account.
# The bootstrap CloudFormation stack in each account must pre-create
# arn:aws:iam::<account_id>:role/InfraReadyLandingZoneBootstrap
# with trust to the management account.
#
# Alias naming: management (default), security, log_archive, network

provider "aws" {
  alias  = "management"
  region = "us-east-1"
  # Credentials come from environment / instance profile of the runner
  # running as the management account identity.
}

provider "aws" {
  alias  = "security"
  region = "us-east-1"

  assume_role {
    # This role is created by the organizations module after account creation.
    # OpenTofu resolves provider configuration at plan time — the dependency on
    # module.organizations is implicit through the account_ids output reference.
    role_arn     = "arn:aws:iam::${module.organizations.account_ids["security"]}:role/InfraReadyLandingZoneBootstrap"
    session_name = "infraready-lz-security"
  }
}

provider "aws" {
  alias  = "log_archive"
  region = "us-east-1"

  assume_role {
    role_arn     = "arn:aws:iam::${module.organizations.account_ids["log_archive"]}:role/InfraReadyLandingZoneBootstrap"
    session_name = "infraready-lz-log-archive"
  }
}

provider "aws" {
  alias  = "network"
  region = "us-east-1"

  assume_role {
    role_arn     = "arn:aws:iam::${module.organizations.account_ids["network"]}:role/InfraReadyLandingZoneBootstrap"
    session_name = "infraready-lz-network"
  }
}

# ─── STEP 1: AWS ORGANIZATIONS ───────────────────────────────────────────────
# Creates the org, OU structure, and all sub-accounts.
# Everything else depends on this completing first.

module "organizations" {
  source = "./modules/organizations"

  providers = {
    aws = aws.management
  }

  org_name           = var.org_name
  account_emails     = var.account_emails
  monthly_budget_usd = var.monthly_budget_usd
  budget_alert_email = var.budget_alert_email
  tags               = local.common_tags
}

# ─── STEP 2: SERVICE CONTROL POLICIES ────────────────────────────────────────
# Guardrails applied to OUs. Must run after organizations so OU IDs exist.

module "scp" {
  source = "./modules/scp"

  providers = {
    aws = aws.management
  }

  org_name        = var.org_name
  allowed_regions = var.allowed_regions
  ou_ids          = module.organizations.ou_ids
  root_id         = module.organizations.root_id
  tags            = local.common_tags

  depends_on = [module.organizations]
}

# ─── DELEGATED ADMIN SETUP (management account) ──────────────────────────────
# These three resources run in the MANAGEMENT account and designate the security
# account as the delegated administrator for GuardDuty, Security Hub, and Macie.
# AWS requires delegated-admin registration to originate from the management account.
# The security module then configures each service inside the security account.

resource "aws_guardduty_organization_admin_account" "security" {
  provider = aws.management

  admin_account_id = module.organizations.account_ids["security"]

  depends_on = [module.organizations]
}

resource "aws_securityhub_organization_admin_account" "security" {
  provider = aws.management

  admin_account_id = module.organizations.account_ids["security"]

  depends_on = [module.organizations]
}

# Macie must be enabled in the management account before delegating
resource "aws_macie2_account" "management" {
  provider = aws.management

  # ENABLED immediately; status can be PAUSED to suspend without deleting findings
  status = "ENABLED"

  depends_on = [module.organizations]
}

resource "aws_macie2_organization_admin_account" "security" {
  provider = aws.management

  admin_account_id = module.organizations.account_ids["security"]

  depends_on = [aws_macie2_account.management]
}

# ─── STEP 3a: SECURITY SERVICES ──────────────────────────────────────────────
# GuardDuty org admin, Security Hub, Config aggregator.
# Runs in the security account.

module "security" {
  source = "./modules/security"

  providers = {
    aws = aws.security
  }

  org_name              = var.org_name
  management_account_id = var.management_account_id
  security_account_id   = module.organizations.account_ids["security"]
  tags                  = local.common_tags

  # Must wait for delegated admin registration to complete before the security
  # account can call aws_guardduty_organization_configuration or
  # aws_securityhub_organization_configuration.
  depends_on = [
    module.scp,
    aws_guardduty_organization_admin_account.security,
    aws_securityhub_organization_admin_account.security,
    aws_macie2_organization_admin_account.security,
  ]
}

# ─── STEP 3b: LOGGING INFRASTRUCTURE ─────────────────────────────────────────
# Org CloudTrail, S3 log archive, Config delivery.
# Runs in the log-archive account.

module "logging" {
  source = "./modules/logging"

  providers = {
    aws = aws.log_archive
  }

  org_name              = var.org_name
  management_account_id = var.management_account_id
  organization_id       = module.organizations.organization_id
  log_retention_days    = var.log_retention_days
  tags                  = local.common_tags

  depends_on = [module.scp]
}

# ─── STEP 3c: TRANSIT GATEWAY + NETWORKING ───────────────────────────────────
# Transit Gateway, RAM share, centralized egress (optional).
# Runs in the network account.

module "networking" {
  source = "./modules/networking"

  providers = {
    aws = aws.network
  }

  org_name                  = var.org_name
  organization_id           = module.organizations.organization_id
  enable_centralized_egress = var.enable_centralized_egress
  spoke_vpc_attachments     = var.transit_gateway_spoke_vpc_attachments
  tags                      = local.common_tags

  depends_on = [module.scp]
}

# ─── STEP 3d: IAM IDENTITY CENTER (SSO) ──────────────────────────────────────
# Permission sets + Identity Store groups.
# Runs in management account (SSO is always management-account-scoped).

module "identity" {
  source = "./modules/identity"

  providers = {
    aws = aws.management
  }

  org_name = var.org_name
  tags     = local.common_tags

  depends_on = [module.scp]
}
