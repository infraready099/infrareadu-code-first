variable "org_name" {
  description = "Organization name slug — used in permission set descriptions and tags"
  type        = string
}

variable "tags" {
  description = "Tags to apply to all resources that support tagging"
  type        = map(string)
  default     = {}
}
