output "codebuild_project_name" {
  description = "Name of the CodeBuild project."
  value       = aws_codebuild_project.mobile.name
}

output "codebuild_project_arn" {
  description = "ARN of the CodeBuild project."
  value       = aws_codebuild_project.mobile.arn
}

output "artifacts_bucket_name" {
  description = "S3 bucket name where build artifacts (APK/AAB/IPA) are stored."
  value       = aws_s3_bucket.artifacts.bucket
}

output "artifacts_bucket_arn" {
  description = "S3 bucket ARN for the artifacts bucket."
  value       = aws_s3_bucket.artifacts.arn
}

output "apple_cert_secret_arn" {
  description = "ARN of the Secrets Manager secret for the Apple distribution certificate (.p12). Upload your cert here after deploy."
  value       = aws_secretsmanager_secret.apple_certificate.arn
}

output "apple_cert_password_secret_arn" {
  description = "ARN of the Secrets Manager secret for the Apple certificate password."
  value       = aws_secretsmanager_secret.apple_cert_password.arn
}

output "android_keystore_secret_arn" {
  description = "ARN of the Secrets Manager secret for the Android release keystore (.jks). Upload your keystore here after deploy."
  value       = aws_secretsmanager_secret.android_keystore.arn
}

output "android_keystore_password_secret_arn" {
  description = "ARN of the Secrets Manager secret for the Android keystore password."
  value       = aws_secretsmanager_secret.android_keystore_password.arn
}

output "codebuild_role_arn" {
  description = "ARN of the IAM role used by CodeBuild. Useful for granting additional permissions."
  value       = aws_iam_role.codebuild.arn
}

output "build_webhook_url" {
  description = "GitHub webhook payload URL. CodeBuild registers this with GitHub automatically; surfaced here for debugging."
  value       = aws_codebuild_webhook.github_push.payload_url
}

output "build_webhook_secret" {
  description = "GitHub webhook secret. Used by GitHub to sign webhook payloads sent to CodeBuild."
  value       = aws_codebuild_webhook.github_push.secret
  sensitive   = true
}

output "log_group_name" {
  description = "CloudWatch log group name for CodeBuild build logs."
  value       = aws_cloudwatch_log_group.codebuild.name
}
