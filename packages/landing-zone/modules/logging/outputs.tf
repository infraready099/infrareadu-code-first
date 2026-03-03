output "cloudtrail_bucket_arn" {
  description = "S3 bucket ARN for org-wide CloudTrail logs"
  value       = aws_s3_bucket.cloudtrail.arn
}

output "cloudtrail_bucket_name" {
  description = "S3 bucket name for org-wide CloudTrail logs"
  value       = aws_s3_bucket.cloudtrail.id
}

output "config_bucket_arn" {
  description = "S3 bucket ARN for org-wide AWS Config delivery"
  value       = aws_s3_bucket.config.arn
}

output "config_bucket_name" {
  description = "S3 bucket name for org-wide AWS Config delivery"
  value       = aws_s3_bucket.config.id
}

output "org_cloudtrail_arn" {
  description = "Organization CloudTrail ARN"
  value       = aws_cloudtrail.org.arn
}

output "org_cloudtrail_name" {
  description = "Organization CloudTrail name"
  value       = aws_cloudtrail.org.name
}

output "log_kms_key_arn" {
  description = "KMS key ARN used to encrypt log buckets and CloudTrail"
  value       = aws_kms_key.logs.arn
}

output "cloudtrail_log_group_arn" {
  description = "CloudWatch Log Group ARN for CloudTrail real-time log delivery"
  value       = aws_cloudwatch_log_group.cloudtrail.arn
}
