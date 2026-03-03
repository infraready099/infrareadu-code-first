output "sqs_queue_url" {
  description = "Deploy queue URL — set as DEPLOY_QUEUE_URL in the Next.js app."
  value       = aws_sqs_queue.deploy.url
}

output "sqs_queue_arn" {
  description = "Deploy queue ARN."
  value       = aws_sqs_queue.deploy.arn
}

output "sqs_dlq_url" {
  description = "Dead-letter queue URL for inspecting failed deployment jobs."
  value       = aws_sqs_queue.deploy_dlq.url
}

output "ecr_repository_url" {
  description = "ECR repository URL. Use this to tag and push the runner image."
  value       = aws_ecr_repository.runner.repository_url
}

output "lambda_function_name" {
  description = "Lambda function name."
  value       = aws_lambda_function.runner.function_name
}

output "lambda_function_arn" {
  description = "Lambda function ARN."
  value       = aws_lambda_function.runner.arn
}

output "lambda_role_arn" {
  description = "IAM role ARN the Lambda executes as."
  value       = aws_iam_role.lambda.arn
}
