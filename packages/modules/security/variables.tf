variable "project_name" {
  type = string
}

variable "environment" {
  type    = string
  default = "production"
}

variable "alert_email" {
  description = "Email address to receive security alerts and billing alarms. Leave empty to skip SNS email subscriptions."
  type        = string
  default     = ""
}

variable "billing_alarm_threshold_usd" {
  description = "USD amount to trigger a billing alarm."
  type        = number
  default     = 100
}

variable "log_retention_days" {
  description = "CloudTrail log retention in days. For HIPAA set enable_hipaa=true to auto-set 2555 (7 years)."
  type        = number
  default     = 365
}

variable "enable_hipaa" {
  description = "Enable HIPAA mode: 7-year log retention, CMK everywhere, PHI tagging."
  type        = bool
  default     = false
}

variable "enable_guardduty" {
  description = "Enable GuardDuty threat detection."
  type        = bool
  default     = true
}

variable "enable_security_hub" {
  description = "Enable Security Hub with CIS and AFSBP standards."
  type        = bool
  default     = true
}

variable "enable_config" {
  description = "Enable AWS Config for compliance monitoring."
  type        = bool
  default     = true
}

variable "enable_soc2_conformance_pack" {
  description = "Deploy the SOC2 AWS Config Conformance Pack (~18 managed rules)."
  type        = bool
  default     = true
}

variable "enable_nist_standard" {
  description = "Enable NIST SP 800-53 Rev 5 standard in Security Hub."
  type        = bool
  default     = false
}

variable "tags" {
  type    = map(string)
  default = {}
}
