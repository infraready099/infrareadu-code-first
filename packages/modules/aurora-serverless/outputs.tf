output "cluster_endpoint" {
  description = "Writer endpoint for the Aurora cluster (use for reads and writes)."
  value       = aws_rds_cluster.this.endpoint
}

output "cluster_reader_endpoint" {
  description = "Read-only endpoint (load-balanced across all read replicas)."
  value       = aws_rds_cluster.this.reader_endpoint
}

output "cluster_arn" {
  description = "ARN of the Aurora cluster."
  value       = aws_rds_cluster.this.arn
}

output "cluster_id" {
  description = "Cluster identifier."
  value       = aws_rds_cluster.this.id
}

output "db_secret_arn" {
  description = "Secrets Manager ARN for DB credentials. Pass this to the ECS or App Runner module as db_secret_arn."
  value       = aws_secretsmanager_secret.db.arn
}

output "security_group_id" {
  description = "Aurora security group ID."
  value       = aws_security_group.aurora.id
}

output "kms_key_arn" {
  description = "KMS key ARN used for Aurora encryption."
  value       = aws_kms_key.aurora.arn
}
