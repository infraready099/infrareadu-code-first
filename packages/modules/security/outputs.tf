output "cloudtrail_bucket_name" {
  description = "S3 bucket storing CloudTrail logs."
  value       = aws_s3_bucket.cloudtrail.id
}

output "alerts_topic_arn" {
  description = "SNS topic ARN for security alerts."
  value       = aws_sns_topic.alerts.arn
}

output "guardduty_detector_id" {
  description = "GuardDuty detector ID."
  value       = var.enable_guardduty ? aws_guardduty_detector.this[0].id : null
}

output "cloudtrail_log_group" {
  description = "CloudWatch log group for CloudTrail."
  value       = aws_cloudwatch_log_group.cloudtrail.name
}
