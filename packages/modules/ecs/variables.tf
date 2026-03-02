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

variable "public_subnet_ids" {
  description = "Public subnet IDs for the ALB (from VPC module output)."
  type        = list(string)
}

variable "private_subnet_ids" {
  description = "Private subnet IDs for ECS tasks (from VPC module output)."
  type        = list(string)
}

variable "domain_name" {
  description = "Custom domain name for the application (e.g. app.example.com). Leave empty to use ALB DNS."
  type        = string
  default     = ""
}

variable "container_port" {
  description = "Port the container listens on."
  type        = number
  default     = 3000
}

variable "container_cpu" {
  description = "CPU units for the container (1024 = 1 vCPU)."
  type        = number
  default     = 256
}

variable "container_memory_mb" {
  description = "Memory for the container in MB."
  type        = number
  default     = 512
}

variable "desired_count" {
  description = "Desired number of running tasks."
  type        = number
  default     = 1
}

variable "min_capacity" {
  description = "Minimum number of tasks for auto-scaling."
  type        = number
  default     = 1
}

variable "max_capacity" {
  description = "Maximum number of tasks for auto-scaling."
  type        = number
  default     = 10
}

variable "autoscale_cpu_target" {
  description = "Target CPU utilization percentage for auto-scaling."
  type        = number
  default     = 70
}

variable "db_secret_arn" {
  description = "ARN of the Secrets Manager secret containing DB credentials (from RDS module output). Optional."
  type        = string
  default     = ""
}

variable "health_check_path" {
  description = "Health check path for the ALB target group."
  type        = string
  default     = "/health"
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
