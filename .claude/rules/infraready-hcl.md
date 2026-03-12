---
paths:
  - "packages/modules/**/*.tf"
  - "packages/terraform-modules/**/*.tf"
  - "packages/landing-zone/**/*.tf"
  - "infra/**/*.tf"
---

# InfraReady HCL / OpenTofu Rules

- Use `tofu` binary, NEVER `terraform`
- NO semicolons in HCL blocks — always multi-line
- NO inline nested blocks
- Every module MUST have `versions.tf` with `version = "~> 5.80"` for hashicorp/aws
- WAF `redacted_fields`: one `single_header` per block only
- `start_window` (not `start_window_minutes`) in aws_backup_plan
- When adding a new module: update CI matrix in `.github/workflows/compliance.yml` immediately
- Before pushing CI fix: validate ALL modules locally first
