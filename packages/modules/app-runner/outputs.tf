output "service_url" {
  description = "App Runner HTTPS URL (no ALB needed — App Runner provides this automatically)."
  value       = "https://${aws_apprunner_service.app.service_url}"
}

output "service_arn" {
  description = "ARN of the App Runner service."
  value       = aws_apprunner_service.app.arn
}

output "service_id" {
  description = "ID of the App Runner service."
  value       = aws_apprunner_service.app.service_id
}

output "ecr_repository_url" {
  description = "ECR repository URL. Push your Docker image here to trigger a deploy."
  value       = aws_ecr_repository.app.repository_url
}

output "instance_role_arn" {
  description = "ARN of the App Runner instance role. Attach additional policies here for S3, DynamoDB, etc."
  value       = aws_iam_role.instance.arn
}

output "log_group_name" {
  description = "CloudWatch log group name for application logs."
  value       = aws_cloudwatch_log_group.app.name
}
