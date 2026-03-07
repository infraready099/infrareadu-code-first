variable "project_name" {
  description = "Name of the project (lowercase, hyphens only)."
  type        = string
}

variable "environment" {
  description = "Deployment environment (production, staging, development)."
  type        = string
  default     = "production"
}

variable "aws_region" {
  description = "AWS region."
  type        = string
  default     = "us-east-1"
}

variable "container_port" {
  description = "Port the container listens on."
  type        = number
  default     = 3000
}

variable "cpu" {
  description = "CPU allocation for each instance. Valid: '0.25 vCPU', '0.5 vCPU', '1 vCPU', '2 vCPU', '4 vCPU'."
  type        = string
  default     = "0.25 vCPU"
}

variable "memory" {
  description = "Memory allocation for each instance. Valid: '0.5 GB', '1 GB', '2 GB', '3 GB', '4 GB'."
  type        = string
  default     = "0.5 GB"
}

variable "min_concurrency" {
  description = "Minimum number of warm instances. 0 = scale to zero (cold starts). 1 = always warm (no cold starts, ~$5/mo)."
  type        = number
  default     = 1
}

variable "max_concurrency" {
  description = "Maximum number of instances."
  type        = number
  default     = 10
}

variable "auto_deploy" {
  description = "Automatically redeploy when a new image is pushed to ECR."
  type        = bool
  default     = true
}

variable "health_check_path" {
  description = "HTTP path for health checks."
  type        = string
  default     = "/health"
}

variable "environment_variables" {
  description = "Environment variables injected into the container (non-sensitive values)."
  type        = map(string)
  default     = {}
}

variable "secret_env_vars" {
  description = "Secrets Manager ARNs to inject as environment variables. Map of ENV_VAR_NAME => secret_arn."
  type        = map(string)
  default     = {}
}

variable "secret_arns" {
  description = "List of Secrets Manager ARNs the app is allowed to read. Auto-populated from secret_env_vars if empty."
  type        = list(string)
  default     = []
}

variable "log_retention_days" {
  description = "CloudWatch log retention in days."
  type        = number
  default     = 30
}

variable "tags" {
  description = "Additional tags to apply to all resources."
  type        = map(string)
  default     = {}
}
