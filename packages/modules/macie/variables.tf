variable "project_name" { type = string }
variable "environment"  { type = string; default = "production" }

variable "kms_key_arn" {
  description = "KMS CMK ARN for Macie findings export encryption."
  type        = string
}

variable "s3_bucket_arns" {
  description = "ARNs of S3 buckets to scan for PHI/PII. If empty, scans all buckets."
  type        = list(string)
  default     = []
}

variable "alert_topic_arn" {
  description = "SNS topic ARN to send Macie HIGH/CRITICAL finding alerts."
  type        = string
  default     = ""
}

variable "finding_publishing_frequency" {
  description = "How often Macie publishes findings. FIFTEEN_MINUTES, ONE_HOUR, or SIX_HOURS."
  type        = string
  default     = "ONE_HOUR"

  validation {
    condition     = contains(["FIFTEEN_MINUTES", "ONE_HOUR", "SIX_HOURS"], var.finding_publishing_frequency)
    error_message = "Must be FIFTEEN_MINUTES, ONE_HOUR, or SIX_HOURS."
  }
}

variable "tags" { type = map(string); default = {} }
