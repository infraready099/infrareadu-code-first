variable "org_name" {
  description = "Organization name slug — used as S3 bucket name prefix"
  type        = string
}

variable "management_account_id" {
  description = "AWS account ID of the management account — used in KMS key conditions"
  type        = string
}

variable "organization_id" {
  description = "AWS Organizations organization ID (o-xxxxxxxxxx) — used in S3 bucket policies"
  type        = string
}

variable "log_retention_days" {
  description = "Number of days to retain logs before expiration. Default 2555 = 7 years."
  type        = number
  default     = 2555
}

variable "tags" {
  description = "Tags to apply to all resources"
  type        = map(string)
  default     = {}
}
