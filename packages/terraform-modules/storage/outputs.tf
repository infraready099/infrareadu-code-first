output "bucket_name" {
  description = "S3 bucket name."
  value       = aws_s3_bucket.app.id
}

output "bucket_arn" {
  description = "S3 bucket ARN."
  value       = aws_s3_bucket.app.arn
}

output "cdn_domain" {
  description = "CloudFront distribution domain name."
  value       = aws_cloudfront_distribution.app.domain_name
}

output "cdn_url" {
  description = "Full HTTPS URL of the CloudFront distribution."
  value       = "https://${aws_cloudfront_distribution.app.domain_name}"
}

output "cloudfront_distribution_id" {
  description = "CloudFront distribution ID (needed to invalidate cache)."
  value       = aws_cloudfront_distribution.app.id
}
