output "db_instance_id" {
  description = "RDS instance identifier."
  value       = aws_db_instance.this.identifier
}

output "db_endpoint" {
  description = "RDS instance endpoint (host:port)."
  value       = aws_db_instance.this.endpoint
  sensitive   = true
}

output "db_address" {
  description = "RDS instance hostname."
  value       = aws_db_instance.this.address
  sensitive   = true
}

output "db_port" {
  description = "Database port."
  value       = local.port
}

output "db_name" {
  description = "Database name."
  value       = aws_db_instance.this.db_name
}

output "db_secret_arn" {
  description = "ARN of the Secrets Manager secret containing DB credentials and connection URL."
  value       = aws_secretsmanager_secret.db.arn
}

output "db_security_group_id" {
  description = "Security group ID of the RDS instance."
  value       = aws_security_group.rds.id
}

output "db_kms_key_arn" {
  description = "ARN of the KMS key used for RDS encryption."
  value       = aws_kms_key.rds.arn
}
