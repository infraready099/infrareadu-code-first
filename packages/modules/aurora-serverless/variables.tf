variable "project_name" {
  description = "Name of the project."
  type        = string
}

variable "environment" {
  description = "Deployment environment."
  type        = string
  default     = "production"
}

variable "aws_region" {
  description = "AWS region."
  type        = string
  default     = "us-east-1"
}

variable "vpc_id" {
  description = "VPC ID (from VPC module output)."
  type        = string
}

variable "private_subnet_ids" {
  description = "Private subnet IDs — must be in at least 2 AZs for Aurora."
  type        = list(string)
}

variable "app_security_group_id" {
  description = "Security group ID of the application layer (ECS tasks, App Runner). Leave empty to skip SG ingress rule."
  type        = string
  default     = ""
}

variable "engine" {
  description = "Aurora engine. Use 'aurora-postgresql' (recommended) or 'aurora-mysql'."
  type        = string
  default     = "aurora-postgresql"

  validation {
    condition     = contains(["aurora-postgresql", "aurora-mysql"], var.engine)
    error_message = "engine must be 'aurora-postgresql' or 'aurora-mysql'."
  }
}

variable "engine_version" {
  description = "Aurora engine version."
  type        = string
  default     = "16.4"
}

variable "min_capacity" {
  description = "Minimum ACUs (Aurora Capacity Units). 0.5 ACU ≈ ~$43/mo. Lower = slower cold start scale-up."
  type        = number
  default     = 0.5
}

variable "max_capacity" {
  description = "Maximum ACUs. 1 ACU ≈ 2 GiB RAM. Scale up automatically under load."
  type        = number
  default     = 4
}

variable "db_name" {
  description = "Initial database name."
  type        = string
}

variable "db_username" {
  description = "Master database username."
  type        = string
  default     = "appuser"
}

variable "backup_retention_days" {
  description = "Number of days to retain automated backups."
  type        = number
  default     = 7
}

variable "deletion_protection" {
  description = "Prevent accidental cluster deletion. Should always be true in production."
  type        = bool
  default     = true
}

variable "skip_final_snapshot" {
  description = "Skip final snapshot when deleting. Set true only for dev environments."
  type        = bool
  default     = false
}

variable "enable_reader" {
  description = "Create an Aurora read replica instance for read-heavy workloads."
  type        = bool
  default     = false
}

variable "log_retention_days" {
  description = "CloudWatch log retention in days."
  type        = number
  default     = 30
}

variable "tags" {
  description = "Additional tags."
  type        = map(string)
  default     = {}
}
