# InfraReady — Terraform Modules

Standard HashiCorp **Terraform** versions of InfraReady's module catalog.
These require `terraform >= 1.5.0` and use DynamoDB for state locking.

> **OpenTofu users:** Use [`packages/modules/`](../modules/) instead.
> OpenTofu 1.10+ supports native S3 locking — no DynamoDB table needed.

---

## Module Catalog

| Module | What it creates | Est. cost/mo |
|--------|----------------|-------------|
| `vpc` | VPC, subnets, NAT gateway, flow logs | ~$32 (NAT) |
| `rds` | RDS PostgreSQL 15, encrypted, Secrets Manager | ~$13+ |
| `ecs` | ECS Fargate, ALB, ECR, auto-scaling | ~$20+ |
| `storage` | S3 + CloudFront, HTTPS, lifecycle rules | ~$1+ |
| `security` | GuardDuty, SecurityHub, CloudTrail, Config | ~$35 |

## Usage

```hcl
terraform {
  required_version = ">= 1.5.0"

  backend "s3" {
    bucket         = "my-project-tfstate"
    key            = "vpc/terraform.tfstate"
    region         = "us-east-1"
    encrypt        = true
    dynamodb_table = "my-project-tfstate-lock"  # Required for Terraform
  }
}

module "vpc" {
  source = "github.com/infraready099/infrareadu-code-first//packages/terraform-modules/vpc?ref=main"

  project_name       = "my-startup"
  environment        = "production"
  aws_region         = "us-east-1"
  vpc_cidr           = "10.0.0.0/16"
  enable_nat_gateway = true
  single_nat_gateway = true   # Cost-optimized: one NAT for all AZs
}
```

## State locking with Terraform

Terraform requires DynamoDB for state locking. Create it once:

```bash
aws dynamodb create-table \
  --table-name my-project-tfstate-lock \
  --attribute-definitions AttributeName=LockID,AttributeType=S \
  --key-schema AttributeName=LockID,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --region us-east-1
```

> **OpenTofu alternative:** Use `packages/modules/` with `use_lockfile = true` in
> the S3 backend — native locking, no DynamoDB needed, zero extra cost.

## OpenTofu vs Terraform — which should I use?

| | OpenTofu | Terraform |
|--|---------|-----------|
| License | MPL 2.0 (truly open) | BSL 1.1 (usage restrictions) |
| State locking | Native S3 (no DynamoDB) | Requires DynamoDB |
| Registry | registry.opentofu.org | registry.terraform.io |
| Compatibility | Drop-in compatible | Same HCL syntax |
| InfraReady default | ✅ Yes | Supported |

**Recommendation:** Use OpenTofu (`packages/modules/`). Same HCL, better license,
cheaper state locking. We maintain both for customers with existing Terraform workflows.
