variable "org_name" {
  description = "Organization name slug"
  type        = string
}

variable "organization_id" {
  description = "AWS Organizations organization ID — used to scope the RAM principal association"
  type        = string
}

variable "enable_centralized_egress" {
  description = "Deploy a centralized egress VPC with NAT Gateway. Adds ~$36/mo per NAT gateway. Default: false."
  type        = bool
  default     = false
}

variable "spoke_vpc_attachments" {
  description = "Map of spoke name → TGW attachment ID to accept. Attachments are created by workload accounts and accepted here."
  type        = map(string)
  default     = {}
}

variable "tags" {
  description = "Tags to apply to all resources"
  type        = map(string)
  default     = {}
}
