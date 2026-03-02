output "ssm_sessions_bucket_name" {
  description = "S3 bucket where SSM session logs are stored."
  value       = aws_s3_bucket.ssm_sessions.id
}

output "ssm_sessions_log_group" {
  description = "CloudWatch log group for SSM session activity."
  value       = aws_cloudwatch_log_group.ssm_sessions.name
}

output "session_preferences_document" {
  description = "SSM Session Manager preferences document name."
  value       = aws_ssm_document.session_preferences.name
}

output "patch_baseline_id" {
  description = "SSM patch baseline ID for Linux."
  value       = length(aws_ssm_patch_baseline.linux) > 0 ? aws_ssm_patch_baseline.linux[0].id : null
}

output "maintenance_window_id" {
  description = "SSM maintenance window ID."
  value       = length(aws_ssm_maintenance_window.patching) > 0 ? aws_ssm_maintenance_window.patching[0].id : null
}
