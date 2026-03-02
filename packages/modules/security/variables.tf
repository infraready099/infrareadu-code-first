variable "project_name" { type = string }
variable "environment" { type = string; default = "production" }

variable "alert_email" {
  description = "Email address to receive security alerts and billing alarms."
  type        = string
}

variable "billing_alarm_threshold_usd" {
  description = "USD amount to trigger a billing alarm. Default $100."
  type        = number
  default     = 100
}

variable "log_retention_days" {
  description = "CloudTrail log retention in days."
  type        = number
  default     = 365 # SOC2 requires 1 year
}

variable "enable_guardduty" {
  description = "Enable GuardDuty threat detection."
  type        = bool
  default     = true
}

variable "enable_security_hub" {
  description = "Enable Security Hub for compliance dashboard."
  type        = bool
  default     = true
}

variable "enable_config" {
  description = "Enable AWS Config for compliance monitoring."
  type        = bool
  default     = true
}

variable "tags" { type = map(string); default = {} }
