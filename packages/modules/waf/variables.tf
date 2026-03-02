variable "project_name" {
  type = string
}

variable "environment" {
  type    = string
  default = "production"
}

variable "scope" {
  description = "REGIONAL (for ALB) or CLOUDFRONT (must use us-east-1 provider)."
  type        = string
  default     = "REGIONAL"
  validation {
    condition     = contains(["REGIONAL", "CLOUDFRONT"], var.scope)
    error_message = "scope must be REGIONAL or CLOUDFRONT."
  }
}

variable "alb_arn" {
  description = "ALB ARN to associate WAF with (REGIONAL scope only)."
  type        = string
  default     = ""
}

variable "allowed_countries" {
  description = "List of ISO country codes to allow. Empty = allow all countries."
  type        = list(string)
  default     = []
}

variable "rate_limit_per_5min" {
  description = "Max requests per IP per 5 minutes before rate limiting."
  type        = number
  default     = 2000
}

variable "block_sql_injection" {
  description = "Enable AWS Managed SQLi protection rule."
  type        = bool
  default     = true
}

variable "block_xss" {
  description = "Enable AWS Managed XSS protection rule."
  type        = bool
  default     = true
}

variable "block_known_bad_inputs" {
  description = "Enable AWS Managed Known Bad Inputs rule group."
  type        = bool
  default     = true
}

variable "log_retention_days" {
  type    = number
  default = 90
}

variable "tags" {
  type    = map(string)
  default = {}
}
