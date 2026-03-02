output "vault_arn" {
  description = "ARN of the backup vault."
  value       = aws_backup_vault.this.arn
}

output "vault_name" {
  description = "Name of the backup vault."
  value       = aws_backup_vault.this.name
}

output "backup_plan_arn" {
  description = "ARN of the backup plan."
  value       = aws_backup_plan.this.arn
}

output "backup_role_arn" {
  description = "IAM role ARN used by AWS Backup."
  value       = aws_iam_role.backup.arn
}

output "reports_bucket_name" {
  description = "S3 bucket where compliance reports are stored."
  value       = aws_s3_bucket.backup_reports.id
}

output "framework_arn" {
  description = "ARN of the Backup Audit Manager compliance framework."
  value       = aws_backup_framework.this.arn
}
