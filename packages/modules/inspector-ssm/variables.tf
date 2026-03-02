variable "project_name" { type = string }
variable "environment"  { type = string; default = "production" }

variable "kms_key_arn" {
  description = "KMS CMK ARN for SSM Parameter Store encryption."
  type        = string
}

variable "cloudwatch_log_key_arn" {
  description = "KMS CMK ARN for CloudWatch Logs encryption."
  type        = string
}

variable "enable_inspector" {
  description = "Enable AWS Inspector v2 for vulnerability scanning."
  type        = bool
  default     = true
}

variable "enable_ssm_patch_manager" {
  description = "Enable SSM Patch Manager for automated OS patching."
  type        = bool
  default     = true
}

variable "patch_schedule" {
  description = "Cron schedule for SSM Patch Manager maintenance window."
  type        = string
  default     = "cron(0 2 ? * SUN *)" # 2 AM UTC every Sunday
}

variable "alert_topic_arn" {
  description = "SNS topic ARN for Inspector HIGH/CRITICAL vulnerability alerts."
  type        = string
  default     = ""
}

variable "ec2_instance_ids" {
  description = "EC2 instance IDs to include in patch manager targets. Leave empty for tag-based targeting."
  type        = list(string)
  default     = []
}

variable "tags" { type = map(string); default = {} }
