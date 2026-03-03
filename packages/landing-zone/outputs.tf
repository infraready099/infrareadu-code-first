# ─── LANDING ZONE ROOT OUTPUTS ───────────────────────────────────────────────

# ── Organizations ──────────────────────────────────────────────────────────

output "organization_id" {
  description = "AWS Organizations organization ID"
  value       = module.organizations.organization_id
}

output "organization_arn" {
  description = "AWS Organizations organization ARN"
  value       = module.organizations.organization_arn
}

output "root_id" {
  description = "Organizations root ID — used for SCP attachments at org-wide scope"
  value       = module.organizations.root_id
}

output "account_ids" {
  description = "Map of account name → account ID for all accounts created by the Landing Zone"
  value       = module.organizations.account_ids
}

output "ou_ids" {
  description = "Map of OU name → OU ID"
  value       = module.organizations.ou_ids
}

# ── Security ───────────────────────────────────────────────────────────────

output "guardduty_detector_id" {
  description = "GuardDuty detector ID in the security account"
  value       = module.security.guardduty_detector_id
}

output "security_hub_arn" {
  description = "Security Hub account ARN"
  value       = module.security.security_hub_arn
}

output "config_aggregator_arn" {
  description = "AWS Config organization aggregator ARN"
  value       = module.security.config_aggregator_arn
}

# ── Logging ────────────────────────────────────────────────────────────────

output "cloudtrail_bucket_arn" {
  description = "S3 bucket ARN receiving org-wide CloudTrail logs"
  value       = module.logging.cloudtrail_bucket_arn
}

output "config_bucket_arn" {
  description = "S3 bucket ARN receiving org-wide Config delivery"
  value       = module.logging.config_bucket_arn
}

output "org_cloudtrail_arn" {
  description = "Organization CloudTrail ARN"
  value       = module.logging.org_cloudtrail_arn
}

# ── Networking ─────────────────────────────────────────────────────────────

output "transit_gateway_id" {
  description = "Transit Gateway ID — share this with workload accounts for VPC attachments"
  value       = module.networking.transit_gateway_id
}

output "transit_gateway_arn" {
  description = "Transit Gateway ARN"
  value       = module.networking.transit_gateway_arn
}

output "tgw_ram_share_arn" {
  description = "RAM resource share ARN for Transit Gateway — attach to workload OUs"
  value       = module.networking.tgw_ram_share_arn
}

# ── Identity ───────────────────────────────────────────────────────────────

output "sso_instance_arn" {
  description = "IAM Identity Center (SSO) instance ARN"
  value       = module.identity.sso_instance_arn
}

output "permission_set_arns" {
  description = "Map of permission set name → ARN"
  value       = module.identity.permission_set_arns
}

output "group_ids" {
  description = "Map of group name → Identity Store group ID"
  value       = module.identity.group_ids
}
