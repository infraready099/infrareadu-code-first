variable "project_name" {
  type = string
}

variable "environment" {
  type    = string
  default = "production"
}

variable "cdn_domain" {
  description = "Custom domain for CloudFront (e.g. cdn.example.com). Leave empty for default CloudFront domain."
  type        = string
  default     = ""
}

variable "default_root_object" {
  description = "Default root object served by CloudFront."
  type        = string
  default     = "index.html"
}

variable "enable_access_logging" {
  description = "Enable S3 access logging. Required for SOC2."
  type        = bool
  default     = true
}

variable "tags" {
  type    = map(string)
  default = {}
}
