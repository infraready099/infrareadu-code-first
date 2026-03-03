variable "org_name" {
  description = "Organization name slug — used as prefix for SCP names"
  type        = string
}

variable "allowed_regions" {
  description = "List of AWS regions to permit. All other regions will be denied by SCP."
  type        = list(string)
  default     = ["us-east-1", "us-west-2"]
}

variable "ou_ids" {
  description = "Map of OU name → OU ID, as produced by the organizations module"
  type        = map(string)
}

variable "root_id" {
  description = "Organizations root ID — used for SCPs that must apply to the entire org"
  type        = string
}

variable "tags" {
  description = "Tags to apply to all SCP resources"
  type        = map(string)
  default     = {}
}
