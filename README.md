# InfraReady.io

**Your AI-built app, deployed to your own AWS in 20 minutes. No DevOps. No Kubernetes.**

InfraReady is a one-click infrastructure deployment platform for solo founders, vibe coders,
and early-stage startups. Connect your GitHub repo and AWS account — InfraReady deploys
your entire production infrastructure automatically using OpenTofu.

**You own 100% of your infrastructure. We never touch your data.**

---

## The Problem

Every solo founder who builds with AI (Cursor, Claude, Bolt) hits the same wall:

> *"My app works on localhost. How do I get it to production on AWS?"*

- AWS has 200+ services. Which ones do you actually need?
- Terraform/OpenTofu modules exist — but configuring them takes weeks
- DevOps engineers cost $150K+/year — you don't have one
- Railway/Render are easy, but you lose control and pay 10x more at scale

## The Solution

InfraReady gives you battle-tested, SOC2-ready AWS infrastructure in 3 steps:

1. **Connect your GitHub repo** — paste your repo URL
2. **Connect your AWS account** — one CloudFormation click (60 seconds)
3. **Choose your modules** — VPC, Database, App Server, Storage, Security — **Deploy**

Your infra is live in your own AWS account. Your data never touches our servers.
InfraReady's role can be revoked in 10 seconds.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│  Your Browser                                                       │
│  infraready.io → Setup Wizard → Choose modules → Deploy button      │
└──────────────────────────────┬──────────────────────────────────────┘
                               │ HTTPS
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│  InfraReady (our AWS account)                                       │
│                                                                     │
│  Next.js App (Vercel)  →  API Routes  →  SQS FIFO Queue            │
│                                               │                     │
│                                               ▼                     │
│                                    Lambda Runner (Container)        │
│                                    ├── OpenTofu binary bundled      │
│                                    ├── All 11 modules bundled       │
│                                    └── Streams logs → Supabase      │
└──────────────────────────────┬──────────────────────────────────────┘
                               │ STS AssumeRole (cross-account)
                               │ ExternalId: your-unique-secret
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│  YOUR AWS Account                                                   │
│                                                                     │
│  InfraReadyRole (created by CloudFormation, revocable any time)     │
│       │                                                             │
│       ├── VPC (10.0.0.0/16, 2 AZs, NAT Gateway, Flow Logs)        │
│       ├── RDS PostgreSQL (encrypted, Secrets Manager, backups)      │
│       ├── ECS Fargate (ALB, auto-scaling, ECR, CloudWatch)         │
│       ├── S3 + CloudFront (HTTPS, HSTS, lifecycle rules)            │
│       ├── Security Baseline (GuardDuty, SecurityHub, CloudTrail)    │
│       └── Terraform state → your S3 bucket (we can't read it)      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Module Catalog

### Starter / Pro Tier (Single Account)

| Module | What it creates | SOC2 | HIPAA | Est. cost/mo |
|--------|----------------|------|-------|-------------|
| **vpc** | VPC, subnets, NAT, Flow Logs | ✅ | ✅ | ~$32 |
| **rds** | PostgreSQL 15, encrypted, Secrets Mgr | ✅ | ✅ | ~$13+ |
| **ecs** | ECS Fargate, ALB, ECR, auto-scaling | ✅ | ✅ | ~$20+ |
| **storage** | S3 + CloudFront, HTTPS, lifecycle | ✅ | ✅ | ~$1+ |
| **security** | GuardDuty, SecurityHub, CloudTrail, Config | ✅ | ✅ | ~$35 |
| **waf** | WAF Web ACL, rate limiting, managed rules | ✅ | ✅ | ~$5 |
| **kms** | Customer-managed KMS key, auto-rotation | ✅ | ✅ | ~$1 |
| **backup** | AWS Backup vault, daily snapshots | ✅ | ✅ | ~$5 |
| **vpc-endpoints** | Private S3/ECR/SSM access (no NAT) | ✅ | ✅ | ~$7 |
| **inspector-ssm** | Vulnerability scanning, patch mgmt | ✅ | ✅ | ~$2 |
| **macie** | S3 PII/PHI data discovery | ✅ | ✅ | ~$1 |

### Enterprise Tier (Multi-Account Landing Zone)

For Series A+ startups needing AWS Organizations, centralized security, and full compliance:

| Component | What it creates |
|-----------|----------------|
| **organizations** | AWS Organizations, OUs, account factory |
| **scp** | Service Control Policies (deny root, restrict regions) |
| **security** | Centralized GuardDuty, SecurityHub, Config aggregation |
| **logging** | Org CloudTrail, Log Archive account (7-year retention) |
| **networking** | Transit Gateway, shared VPC, centralized egress |
| **identity** | IAM Identity Center (SSO), permission sets |

See [`packages/landing-zone/`](packages/landing-zone/) for details.

---

## Security Model

### How cross-account access works

1. Customer runs a **CloudFormation template** (one click, 60 seconds)
2. CloudFormation creates `InfraReadyRole` in their account
3. The role's **trust policy** only allows InfraReady's AWS account ID + a unique ExternalId
4. InfraReady calls `sts:AssumeRole` with the ExternalId to deploy
5. All actions are logged in **CloudTrail** in the customer's account
6. **Revoke access any time:** delete `InfraReadyRole` → InfraReady is immediately locked out

### What InfraReady can and cannot do

| Can do | Cannot do |
|--------|-----------|
| Create/modify resources defined in modules | Access customer code or data |
| Read CloudFormation stack outputs | Read S3 bucket contents |
| Write Terraform state to customer's S3 | Exfiltrate credentials |
| Tag all resources with `ManagedBy=infraready` | Act outside the defined IAM policy |

### Terraform state

State lives in **your S3 bucket** (`infraready-state-{project}-{region}`).
InfraReady creates this bucket in your account but cannot read the state files —
state access requires the same cross-account role, which you control.

---

## Pricing

| Tier | Price | Environments | Modules | Support |
|------|-------|-------------|---------|---------|
| **Starter** | $29/mo | 1 | All 11 | Email |
| **Pro** | $99/mo | Unlimited | All 11 + Landing Zone | Priority |
| **Enterprise** | Custom | Unlimited | Custom + white-glove | Dedicated |

*These prices are for InfraReady's service fee. AWS charges are separate and billed directly to your account.*

---

## Quick Start (for developers)

### 1. Deploy InfraReady's own infrastructure

```bash
# Clone the repo
git clone https://github.com/infraready099/infrareadu-code-first
cd infrareadu-code-first

# Deploy the runner (Lambda + SQS + ECR)
cd infra/runner
tofu init
tofu apply \
  -var="supabase_url=https://xxx.supabase.co" \
  -var="supabase_service_role_key=eyJ..."
```

### 2. Build and push the runner image

```bash
cd packages/runner && npm run build
ECR_URL=$(cd infra/runner && tofu output -raw ecr_repository_url)
aws ecr get-login-password | docker login --username AWS --password-stdin $ECR_URL
docker build -f packages/runner/Dockerfile -t infraready-runner .
docker push $ECR_URL:latest
```

### 3. Deploy the web app

```bash
# Set environment variables in Vercel:
# NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY
# SUPABASE_SERVICE_ROLE_KEY, DEPLOY_QUEUE_URL, AWS_DEPLOY_ROLE_ARN

cd apps/web && npm install && npm run dev
```

---

## Repo Structure

```
infrareadu-code-first/
├── apps/
│   └── web/                    # Next.js 15 frontend (Vercel)
│       ├── app/(dashboard)/    # Protected pages: projects, wizard, logs
│       └── app/api/            # API routes: deploy, aws/connect
│
├── packages/
│   ├── modules/                # OpenTofu modules (PRIMARY — 11 modules)
│   ├── terraform-modules/      # Terraform >= 1.5 versions (5 core modules)
│   ├── landing-zone/           # Enterprise: AWS Organizations + multi-account
│   └── runner/                 # Lambda deployment runner
│       └── src/
│           ├── index.ts        # SQS handler
│           ├── opentofu.ts     # OpenTofu executor
│           └── services/
│               ├── terraform-generator.ts  # HCL generator
│               └── security-scan.ts        # Checkov compliance scanner
│
├── infra/
│   ├── runner/                 # InfraReady's own Lambda infra (OpenTofu)
│   └── cloudformation/         # bootstrap-role.yaml (customers run this once)
│
├── supabase/
│   └── migrations/             # Database schema
│
└── .github/
    └── workflows/
        ├── compliance.yml      # CI: validate + tflint + checkov all 11 modules
        └── runner-build.yml    # CI: build + push runner Docker image on push
```

---

## Compliance

All InfraReady modules are designed to meet:

- **SOC 2 Type II** — CC6.1 (flow logs), CC6.6 (encryption), CC7.2 (GuardDuty)
- **HIPAA** — §164.312(a)(2)(iv) encryption, §164.312(b) audit controls
- **CIS AWS Foundations Benchmark v1.4** — all Level 1 + Level 2 controls
- **NIST 800-53** — applicable controls for cloud deployments

Every deployment is scanned with Checkov before applying. CRITICAL and HIGH findings
block deployment until remediated.

---

## vs. Alternatives

| | InfraReady | Railway/Render | Porter | Stacktape | Spacelift |
|--|-----------|---------------|--------|-----------|-----------|
| You own the infra | ✅ | ❌ | ✅ | ✅ | ✅ |
| SOC2-ready defaults | ✅ | ❌ | ❌ | ❌ | ✅ |
| OpenTofu native | ✅ | ❌ | ❌ | ❌ | ❌ |
| No Kubernetes required | ✅ | ✅ | ❌ | ✅ | ✅ |
| Standard IaC (no lock-in) | ✅ | ❌ | ❌ | ❌ | ✅ |
| Solo founder pricing | ✅ | ✅ | ❌ | ❌ | ❌ |
| Enterprise Landing Zone | ✅ | ❌ | ❌ | ❌ | ✅ |

---

## For Enterprise: AWS Landing Zone

Growing companies (Series A+, SOC2 Type II, >50 employees) need more than single-account infra.
InfraReady's Landing Zone tier sets up a proper multi-account AWS Organizations structure:

```
Root (Management Account)
├── Security OU
│   ├── security-account     ← GuardDuty master, SecurityHub, Config aggregator
│   └── log-archive          ← 7-year CloudTrail retention, Config logs
├── Infrastructure OU
│   └── network-account      ← Transit Gateway, centralized egress
├── Workloads OU
│   ├── prod-account
│   ├── staging-account
│   └── dev-account
└── Sandbox OU
```

This provides blast radius containment, centralized security visibility, and compliance
posture that satisfies enterprise procurement. See [`packages/landing-zone/`](packages/landing-zone/).

---

## Contributing

InfraReady's module catalog is open source. Contributions welcome:

1. Fork the repo
2. Add your module to `packages/modules/your-module/`
3. Ensure it passes `tofu validate` + `tflint` + `checkov`
4. Open a PR — CI will verify everything

Module requirements:
- Must pass all CI checks (see `.github/workflows/compliance.yml`)
- Must have `main.tf`, `variables.tf`, `outputs.tf`, `versions.tf`
- All resources must have `tags = local.common_tags`
- All sensitive values must use Secrets Manager, never plain variables

---

## License

MIT — use these modules however you want. InfraReady's SaaS service is commercial.

---

*Built with OpenTofu, Next.js, Supabase, and AWS Lambda.*
*Deployed to infraready.io*
