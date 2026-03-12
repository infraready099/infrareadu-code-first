# packages/modules — OpenTofu Modules

## Modules (all CI-passing)
vpc, rds, ecs, storage, security, waf, vpc-endpoints, kms, backup, inspector-ssm, macie

## Every Module Must Have
- `main.tf`, `variables.tf`, `outputs.tf`, `versions.tf`
- `versions.tf`: `version = "~> 5.80"` for hashicorp/aws

## HCL Rules (CI will fail if violated)
- NO semicolons — multi-line only
- NO inline nested blocks
- WAF `redacted_fields`: one `single_header` per block
- `start_window` not `start_window_minutes` in aws_backup_plan
- New module → update `.github/workflows/compliance.yml` matrix immediately

## Validate Before Pushing
```bash
for d in packages/modules/*/; do tofu init -backend=false -chdir=$d && tofu validate -chdir=$d; done
```
