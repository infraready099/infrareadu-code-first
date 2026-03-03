output "sso_instance_arn" {
  description = "IAM Identity Center instance ARN — required for account assignments"
  value       = local.sso_instance_arn
}

output "identity_store_id" {
  description = "Identity Store ID — required for user and group operations"
  value       = local.identity_store_id
}

output "permission_set_arns" {
  description = "Map of permission set name → ARN — used for account assignments"
  value = {
    administrator  = aws_ssoadmin_permission_set.administrator.arn
    read_only      = aws_ssoadmin_permission_set.read_only.arn
    developer      = aws_ssoadmin_permission_set.developer.arn
    security_audit = aws_ssoadmin_permission_set.security_audit.arn
  }
}

output "group_ids" {
  description = "Map of group name → Identity Store group ID — used for account assignments"
  value = {
    platform_admins   = aws_identitystore_group.platform_admins.group_id
    developers        = aws_identitystore_group.developers.group_id
    security_auditors = aws_identitystore_group.security_auditors.group_id
  }
}

output "group_display_names" {
  description = "Map of group name → display name as shown in the Identity Center console"
  value = {
    platform_admins   = aws_identitystore_group.platform_admins.display_name
    developers        = aws_identitystore_group.developers.display_name
    security_auditors = aws_identitystore_group.security_auditors.display_name
  }
}
