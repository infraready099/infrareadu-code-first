# ─── LANDING ZONE ROOT VARIABLES ────────────────────────────────────────────

variable "org_name" {
  description = "Organization name slug — used as a prefix for all named resources (e.g. 'acme')"
  type        = string

  validation {
    condition     = can(regex("^[a-z0-9-]{2,20}$", var.org_name))
    error_message = "org_name must be 2-20 lowercase alphanumeric characters or hyphens."
  }
}

variable "management_account_id" {
  description = "AWS account ID of the management (root) account where Organizations is managed"
  type        = string

  validation {
    condition     = can(regex("^[0-9]{12}$", var.management_account_id))
    error_message = "management_account_id must be a 12-digit AWS account ID."
  }
}

variable "account_emails" {
  description = "Email addresses for each AWS account to be created by the Account Factory"
  type = object({
    security    = string
    log_archive = string
    network     = string
    prod        = string
    staging     = string
    dev         = string
  })
}

variable "allowed_regions" {
  description = "List of AWS regions permitted by SCP — all other regions are denied"
  type        = list(string)
  default     = ["us-east-1", "us-west-2"]
}

variable "log_retention_days" {
  description = "CloudTrail and Config log retention in days — 2555 = 7 years (HIPAA/SOC2 Type II compliant)"
  type        = number
  default     = 2555

  validation {
    condition     = var.log_retention_days >= 365
    error_message = "log_retention_days must be at least 365 days (1 year) for SOC2 compliance."
  }
}

variable "enable_centralized_egress" {
  description = "Deploy a centralized egress VPC with NAT Gateway in the network account. Adds ~$36/mo."
  type        = bool
  default     = false
}

variable "transit_gateway_spoke_vpc_attachments" {
  description = "Map of spoke VPC attachment IDs to accept into the Transit Gateway. Keyed by account name."
  type        = map(string)
  default     = {}
}

variable "sso_admin_email" {
  description = "Email address of the first SSO administrator user (used for initial group membership)"
  type        = string
  default     = ""
}

variable "monthly_budget_usd" {
  description = "Monthly AWS cost budget threshold in USD. SNS alerts fire at 80% and 100% of this amount."
  type        = number
  default     = 200
}

variable "budget_alert_email" {
  description = "Email address to receive budget threshold alerts. Recipient must confirm the SNS subscription email from AWS."
  type        = string
}

variable "tags" {
  description = "Tags applied to every resource created by the Landing Zone. Merged with module-specific tags."
  type        = map(string)
  default     = {}
}
