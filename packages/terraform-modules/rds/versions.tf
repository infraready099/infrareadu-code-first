# Terraform-compatible module (>= 1.5.0)
# For OpenTofu users, use packages/modules/rds instead — it supports native S3 locking.
terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.80"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }
}
