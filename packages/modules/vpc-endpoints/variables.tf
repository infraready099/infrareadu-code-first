variable "project_name" { type = string }
variable "environment"  { type = string; default = "production" }

variable "vpc_id"   { type = string; description = "VPC ID from VPC module output." }
variable "vpc_cidr" { type = string; description = "VPC CIDR block from VPC module output." }

variable "private_subnet_ids" {
  type        = list(string)
  description = "Private subnet IDs for interface endpoint ENIs."
}

variable "private_route_table_ids" {
  type        = list(string)
  description = "Private route table IDs for gateway endpoints."
}

variable "enable_dynamodb_endpoint" {
  type    = bool
  default = false
}

variable "enable_xray_endpoint" {
  type    = bool
  default = false
}

variable "tags" { type = map(string); default = {} }
