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

variable "tags" {
  description = "Tags to apply to all resources"
  type        = map(string)
  default     = {}
}
