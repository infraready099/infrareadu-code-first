variable "aws_region" {
  description = "AWS region where InfraReady's own infrastructure is deployed."
  type        = string
  default     = "us-east-1"
}

variable "ecr_image_uri" {
  description = <<-EOT
    Full ECR image URI for the runner container, e.g.
    123456789012.dkr.ecr.us-east-1.amazonaws.com/infraready-runner:abc1234
    Leave empty on first apply — the ECR repo will be created, then you build
    and push the image, then re-apply with this variable set.
  EOT
  type        = string
  default     = ""
}

variable "supabase_url" {
  description = "Supabase project URL (e.g. https://xyzabc.supabase.co). Passed to Lambda as env var."
  type        = string
  sensitive   = true
}

variable "supabase_service_role_key" {
  description = "Supabase service role JWT. Passed to Lambda as env var. Grants full DB write access — treat as a secret."
  type        = string
  sensitive   = true
}

variable "tags" {
  description = "Additional tags to apply to all resources."
  type        = map(string)
  default     = {}
}
