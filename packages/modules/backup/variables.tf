variable "project_name" { type = string }
variable "environment"  { type = string; default = "production" }

variable "kms_key_arn" {
  description = "KMS CMK ARN for backup vault encryption. Use output from the kms module."
  type        = string
}

variable "backup_vault_name" {
  description = "Name override for the backup vault. Defaults to project-environment-vault."
  type        = string
  default     = ""
}

variable "enable_hipaa_retention" {
  description = "If true, enables 7-year yearly retention tier required by HIPAA."
  type        = bool
  default     = false
}

variable "enable_cross_region_copy" {
  description = "Copy backups to a secondary AWS region for disaster recovery."
  type        = bool
  default     = false
}

variable "secondary_region" {
  description = "AWS region to copy backups to. Required if enable_cross_region_copy = true."
  type        = string
  default     = "us-west-2"
}

variable "secondary_kms_key_arn" {
  description = "KMS key ARN in the secondary region for cross-region backup copies."
  type        = string
  default     = ""
}

variable "rds_arns" {
  description = "List of RDS instance ARNs to include in backup plan."
  type        = list(string)
  default     = []
}

variable "ecs_efs_arns" {
  description = "List of EFS file system ARNs to include in backup plan."
  type        = list(string)
  default     = []
}

variable "alert_topic_arn" {
  description = "SNS topic ARN to send backup job failure alerts."
  type        = string
  default     = ""
}

variable "tags" { type = map(string); default = {} }
