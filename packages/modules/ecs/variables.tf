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
  default     = "" # Not needed during destroy — IDs come from state
}

variable "public_subnet_ids" {
  description = "Public subnet IDs for the ALB (from VPC module output)."
  type        = list(string)
  default     = [] # Not needed during destroy — IDs come from state
}

variable "private_subnet_ids" {
  description = "Private subnet IDs for ECS tasks (from VPC module output)."
  type        = list(string)
  default     = [] # Not needed during destroy — IDs come from state
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

variable "alb_deletion_protection" {
  description = "Enable ALB deletion protection. Set false for dev/test environments so tofu destroy can remove the load balancer cleanly."
  type        = bool
  default     = true
}

variable "container_image" {
  description = "Docker image URL for the ECS task. Example: 123456789.dkr.ecr.us-east-1.amazonaws.com/myapp:v1.0 or public.ecr.aws/docker/library/nginx:latest. Can be from ECR, Docker Hub, or any registry."
  type        = string

  validation {
    condition     = can(regex("^[a-zA-Z0-9][a-zA-Z0-9._/:@-]*$", var.container_image))
    error_message = "container_image must be a valid Docker image reference (e.g., myrepo/myimage:tag or 123456789.dkr.ecr.us-east-1.amazonaws.com/myapp:v1.0)."
  }
}

variable "container_environment_variables" {
  description = "Map of environment variables to pass to the container. Example: { NODE_ENV = \"production\", LOG_LEVEL = \"info\" }"
  type        = map(string)
  default     = {}
}

variable "container_secrets" {
  description = "List of secrets to inject from Secrets Manager or Parameter Store. Each secret should have 'name' (env var name) and 'valueFrom' (ARN or path). Example: [{ name = \"DATABASE_URL\", valueFrom = \"arn:aws:secretsmanager:...\" }]"
  type = list(object({
    name      = string
    valueFrom = string
  }))
  default = []
}

variable "task_execution_role_arn" {
  description = "Optional ARN of a custom task execution role. If not provided, the module creates one. The execution role allows ECS to pull images, push logs, and access secrets."
  type        = string
  default     = ""
}

variable "task_role_arn" {
  description = "Optional ARN of a custom task role for the running application. If not provided, the module creates a basic role that allows CloudWatch logs. Use this to grant the app access to S3, DynamoDB, etc."
  type        = string
  default     = ""
}

variable "tags" {
  description = "Additional tags to apply to all resources."
  type        = map(string)
  default     = {}
}
