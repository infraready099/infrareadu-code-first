variable "project_name" { type = string }
variable "environment"  { type = string; default = "production" }

variable "enable_hipaa" {
  description = "HIPAA mode: stricter key policies, PHI tagging on all keys."
  type        = bool
  default     = false
}

variable "deletion_window_in_days" {
  description = "Number of days before KMS key is permanently deleted after scheduling deletion. Min 7, Max 30."
  type        = number
  default     = 30

  validation {
    condition     = var.deletion_window_in_days >= 7 && var.deletion_window_in_days <= 30
    error_message = "deletion_window_in_days must be between 7 and 30."
  }
}

variable "tags" { type = map(string); default = {} }
