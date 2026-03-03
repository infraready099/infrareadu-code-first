output "guardduty_detector_id" {
  description = "GuardDuty detector ID in the security account"
  value       = aws_guardduty_detector.this.id
}

output "guardduty_detector_arn" {
  description = "GuardDuty detector ARN"
  value       = aws_guardduty_detector.this.arn
}

output "security_hub_arn" {
  description = "Security Hub account subscription ARN"
  value       = aws_securityhub_account.this.id
}

output "config_aggregator_arn" {
  description = "AWS Config organization aggregator ARN"
  value       = aws_config_configuration_aggregator.org.arn
}

output "config_aggregator_name" {
  description = "AWS Config organization aggregator name"
  value       = aws_config_configuration_aggregator.org.name
}

output "security_alerts_sns_arn" {
  description = "SNS topic ARN for security alert notifications"
  value       = aws_sns_topic.security_alerts.arn
}
