output "alb_dns_name" {
  description = "DNS name of the Application Load Balancer."
  value       = aws_lb.app.dns_name
}

output "alb_arn" {
  description = "ARN of the Application Load Balancer."
  value       = aws_lb.app.arn
}

output "ecr_repository_url" {
  description = "ECR repository URL. Push your Docker image here."
  value       = aws_ecr_repository.app.repository_url
}

output "ecs_cluster_name" {
  description = "ECS cluster name."
  value       = aws_ecs_cluster.this.name
}

output "ecs_service_name" {
  description = "ECS service name."
  value       = aws_ecs_service.app.name
}

output "ecs_task_security_group_id" {
  description = "Security group ID of ECS tasks (provide this to RDS module as app_security_group_id)."
  value       = aws_security_group.ecs_tasks.id
}

output "task_execution_role_arn" {
  description = "ARN of the ECS task execution role."
  value       = aws_iam_role.task_execution.arn
}

output "app_url" {
  description = "Application URL (HTTPS)."
  value       = "https://${aws_lb.app.dns_name}"
}

output "log_group_name" {
  description = "CloudWatch log group name for application logs."
  value       = aws_cloudwatch_log_group.app.name
}
