output "deny_root_usage_policy_id" {
  description = "Policy ID of the deny-root-usage SCP"
  value       = aws_organizations_policy.deny_root_usage.id
}

output "deny_regions_policy_id" {
  description = "Policy ID of the deny-non-approved-regions SCP"
  value       = aws_organizations_policy.deny_regions.id
}

output "require_tags_policy_id" {
  description = "Policy ID of the require-mandatory-tags SCP"
  value       = aws_organizations_policy.require_tags.id
}

output "protect_lz_controls_policy_id" {
  description = "Policy ID of the protect-lz-controls SCP"
  value       = aws_organizations_policy.protect_lz_controls.id
}

output "policy_ids" {
  description = "Map of SCP name → policy ID for all SCPs created by this module"
  value = {
    deny_root_usage      = aws_organizations_policy.deny_root_usage.id
    deny_regions         = aws_organizations_policy.deny_regions.id
    require_tags         = aws_organizations_policy.require_tags.id
    protect_lz_controls  = aws_organizations_policy.protect_lz_controls.id
  }
}
