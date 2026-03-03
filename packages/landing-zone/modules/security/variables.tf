variable "org_name" {
  description = "Organization name slug"
  type        = string
}

variable "management_account_id" {
  description = "AWS account ID of the management account — used for GuardDuty org admin delegation"
  type        = string
}

variable "security_account_id" {
  description = "AWS account ID of this security account — used for delegated admin designation"
  type        = string
}

variable "tags" {
  description = "Tags to apply to all resources"
  type        = map(string)
  default     = {}
}
