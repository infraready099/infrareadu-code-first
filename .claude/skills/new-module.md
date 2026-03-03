# Skill: New OpenTofu Module

Create a new InfraReady OpenTofu module with all required files.

## Required Files for Every Module
1. `main.tf` — resources
2. `variables.tf` — inputs with descriptions and types
3. `outputs.tf` — outputs
4. `versions.tf` — provider requirements

## Standard Structure

### versions.tf (always identical)
```hcl
terraform {
  required_version = ">= 1.8.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.80"
    }
  }
}
```

### variables.tf pattern (NO semicolons — HCL doesn't support them)
```hcl
variable "project_name" {
  description = "Project name prefix for all resources"
  type        = string
}

variable "environment" {
  description = "Environment name (production, staging, development)"
  type        = string
  default     = "production"
}

variable "tags" {
  description = "Additional tags to merge onto all resources"
  type        = map(string)
  default     = {}
}
```

### locals pattern (always include name + common_tags)
```hcl
locals {
  name = "${var.project_name}-${var.environment}"

  common_tags = merge(var.tags, {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "infraready"
    Module      = "<module-name>"
  })
}
```

## Compliance Requirements
Every module MUST include these or reference them from other modules:
- Encryption: `sse_algorithm = "aws:kms"` + `kms_master_key_id = var.kms_key_arn`
- No public access: `block_public_acls = true` on S3 buckets
- TLS-only: S3 bucket policy with `DenyNonTLS` statement
- Tags: `tags = local.common_tags` on every resource

## HCL Syntax Rules (avoid CI failures)
- NO semicolons: `{ type = string; default = "x" }` → INVALID
- NO inline nested blocks: `kubernetes { audit_logs { enable = true } }` → INVALID
- Multi-line all blocks with 2+ arguments
- `redacted_fields` in WAF: one `single_header` per block

## Checkov Skips (add to .checkov.yaml if needed)
- CKV_AWS_338 — S3 MFA delete (manual setup required)
- CKV2_AWS_62 — S3 event notifications (use CloudTrail instead)
- CKV2_AWS_5 — SG attached (cannot verify at module level)
