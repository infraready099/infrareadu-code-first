variable "project_name" {
  description = "Name of the project."
  type        = string
}

variable "environment" {
  description = "Deployment environment."
  type        = string
  default     = "production"
}

variable "vpc_id" {
  description = "VPC ID to deploy the database into (from VPC module output)."
  type        = string
}

variable "private_subnet_ids" {
  description = "Private subnet IDs for the DB subnet group (from VPC module output)."
  type        = list(string)
}

variable "app_security_group_id" {
  description = "Security group ID of the application (ECS tasks) that needs DB access."
  type        = string
  default     = ""
}

variable "engine" {
  description = "Database engine: postgres or mysql."
  type        = string
  default     = "postgres"

  validation {
    condition     = contains(["postgres", "mysql"], var.engine)
    error_message = "engine must be postgres or mysql."
  }
}

variable "engine_version" {
  description = "Database engine version."
  type        = string
  default     = "16.3"
}

variable "instance_class" {
  description = "RDS instance type. Use db.t3.micro for dev, db.t3.small+ for production."
  type        = string
  default     = "db.t3.micro"
}

variable "allocated_storage_gb" {
  description = "Initial storage allocation in GB."
  type        = number
  default     = 20

  validation {
    condition     = var.allocated_storage_gb >= 20 && var.allocated_storage_gb <= 65536
    error_message = "allocated_storage_gb must be between 20 and 65536."
  }
}

variable "max_allocated_storage_gb" {
  description = "Maximum storage for autoscaling in GB. Set to 0 to disable autoscaling."
  type        = number
  default     = 100
}

variable "multi_az" {
  description = "Enable Multi-AZ for high availability. Recommended for production. Doubles cost."
  type        = bool
  default     = false
}

variable "backup_retention_days" {
  description = "Days to retain automated backups. 0 disables backups (not recommended)."
  type        = number
  default     = 7

  validation {
    condition     = var.backup_retention_days >= 0 && var.backup_retention_days <= 35
    error_message = "backup_retention_days must be between 0 and 35."
  }
}

variable "deletion_protection" {
  description = "Prevent accidental deletion of the database. STRONGLY recommended for production."
  type        = bool
  default     = true
}

variable "skip_final_snapshot" {
  description = "Skip final snapshot on deletion. Set to false for production."
  type        = bool
  default     = false
}

variable "db_name" {
  description = "Name of the initial database to create."
  type        = string
  default     = "app"
}

variable "db_username" {
  description = "Master username for the database."
  type        = string
  default     = "infraready"
}

variable "tags" {
  description = "Additional tags to apply to all resources."
  type        = map(string)
  default     = {}
}
