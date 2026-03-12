variable "org_name" {
  description = "Organization name slug — used as a prefix for named resources"
  type        = string
}

variable "account_emails" {
  description = "Email addresses for each AWS account. Each email must be globally unique across all AWS accounts."
  type = object({
    security    = string
    log_archive = string
    network     = string
    prod        = string
    staging     = string
    dev         = string
  })
}

variable "monthly_budget_usd" {
  description = "Monthly AWS cost budget threshold in USD. Alerts fire at 80% and 100%."
  type        = number
  default     = 200
}

variable "budget_alert_email" {
  description = "Email address to receive budget threshold notifications. Must confirm the SNS subscription."
  type        = string
}

variable "tags" {
  description = "Tags to apply to all resources"
  type        = map(string)
  default     = {}
}
