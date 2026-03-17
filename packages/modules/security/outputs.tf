output "cloudtrail_bucket_name" {
  description = "S3 bucket storing CloudTrail logs."
  value       = aws_s3_bucket.cloudtrail.id
}

output "cloudtrail_bucket_arn" {
  description = "ARN of the CloudTrail S3 bucket."
  value       = aws_s3_bucket.cloudtrail.arn
}

output "alerts_topic_arn" {
  description = "SNS topic ARN for security alerts."
  value       = aws_sns_topic.alerts.arn
}

output "security_kms_key_arn" {
  description = "CMK ARN used for SNS, CloudWatch Logs, and CloudTrail encryption."
  value       = aws_kms_key.security.arn
}

output "security_kms_key_id" {
  description = "CMK Key ID."
  value       = aws_kms_key.security.key_id
}

output "cloudtrail_log_group_name" {
  description = "CloudWatch Log Group name for CloudTrail events."
  value       = aws_cloudwatch_log_group.cloudtrail.name
}

output "guardduty_detector_id" {
  description = "GuardDuty detector ID."
  value       = length(aws_guardduty_detector.this) > 0 ? aws_guardduty_detector.this[0].id : null
}

output "github_deploy_role_arn" {
  description = "ARN of the GitHub Actions deploy role. Add as AWS_DEPLOY_ROLE_ARN in your GitHub repo secrets."
  value       = length(aws_iam_role.github_deploy) > 0 ? aws_iam_role.github_deploy[0].arn : null
}

output "github_oidc_provider_arn" {
  description = "ARN of the GitHub Actions OIDC provider (created or adopted)."
  value       = local.github_oidc_provider_arn
}
