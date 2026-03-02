output "macie_account_id" {
  description = "Macie account ID (same as AWS account ID)."
  value       = aws_macie2_account.this.id
}

output "findings_bucket_name" {
  description = "S3 bucket where Macie findings are exported."
  value       = aws_s3_bucket.macie_findings.id
}

output "findings_bucket_arn" {
  description = "ARN of the Macie findings S3 bucket."
  value       = aws_s3_bucket.macie_findings.arn
}

output "classification_job_id" {
  description = "ID of the PHI classification job."
  value       = aws_macie2_classification_job.phi_scan.id
}

output "phi_tagging_guide_parameter" {
  description = "SSM Parameter Store path containing the PHI tagging taxonomy."
  value       = aws_ssm_parameter.phi_tagging_guide.name
}
