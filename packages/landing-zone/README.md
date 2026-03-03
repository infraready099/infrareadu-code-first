# InfraReady Landing Zone

A production-grade AWS multi-account Landing Zone built with OpenTofu. This is InfraReady's Enterprise tier product for organizations that have outgrown a single AWS account.

---

## Who Needs This

**You need a Landing Zone when:**
- Your team has more than 20-30 engineers sharing a single AWS account
- You are pursuing SOC2 Type II certification (auditors expect account separation)
- You are at Series A and above and face enterprise procurement security reviews
- You handle regulated data (HIPAA, PCI DSS, FedRAMP) that requires environment isolation
- You need to give contractors or external auditors access without exposing production
- Your AWS bill exceeds $5,000/month and you want per-team cost allocation

**You do NOT need this if:**
- You are pre-Series A with fewer than 15 engineers
- You have a single product environment (Starter or Pro tier is right for you)
- Your compliance requirement is SOC2 Type I — a well-configured single account is sufficient

**InfraReady tier mapping:**

| Tier | Target | Architecture | What you get |
|------|--------|-------------|--------------|
| Starter ($29/mo) | Solo founders, < 5 engineers | Single account, 5 modules | VPC, RDS, ECS, S3, Security baseline |
| Pro ($99/mo) | Seed-stage startups, < 15 engineers | Single account, multi-environment | All Starter modules + WAF, KMS, Backup |
| Enterprise (custom) | Series A+, 20+ engineers | Multi-account Landing Zone | This module |

---

## Architecture

The Landing Zone creates this account structure inside your AWS Organization:

```
Root (Management Account — billing, Organizations, SSO)
├── Security OU
│   ├── security-account     GuardDuty master, Security Hub, Config aggregator
│   └── log-archive          CloudTrail logs, Config logs — immutable S3
├── Infrastructure OU
│   └── network-account      Transit Gateway, centralized egress NAT
├── Workloads OU
│   ├── prod-account
│   ├── staging-account
│   └── dev-account
└── Sandbox OU
    └── (developer sandbox accounts — less restrictive SCPs)
```

**Why separate accounts instead of separate VPCs?**

An IAM mistake in a single-account setup can expose prod to dev. With separate accounts, the AWS IAM boundary is a hard wall — even if a developer's credentials are compromised, they cannot access production resources because the account itself denies it via SCPs. This is the security model that AWS, Hashicorp, Netflix, and every cloud-native enterprise uses.

---

## Modules

### `modules/organizations`
Creates and configures the AWS Organization:
- Enables ALL_FEATURES (required for SCPs)
- Enables service access for CloudTrail, Config, GuardDuty, Security Hub, SSO, RAM
- Creates 4 OUs: Security, Infrastructure, Workloads, Sandbox
- Creates 6 sub-accounts via Account Factory (security, log-archive, network, prod, staging, dev)

### `modules/scp`
Service Control Policies — guardrails that apply even to account root users:
1. **deny-root-usage** — blocks root account activity in all member accounts (CIS 1.1)
2. **deny-regions** — restricts all APIs to approved regions only (limits breach blast radius)
3. **require-tags** — denies resource creation without Project/Environment/ManagedBy tags
4. **protect-lz-controls** — prevents deletion of CloudTrail, GuardDuty, Config recorder

### `modules/security`
Centralized security services in the security account:
- GuardDuty with org-wide auto-enrollment, malware protection, Kubernetes audit log analysis
- Security Hub with CIS v1.4, AWS FSBP, and PCI DSS standards
- AWS Config organization aggregator — single pane for compliance across all accounts
- EventBridge rules routing HIGH/CRITICAL findings to SNS

### `modules/logging`
Immutable log archive in the log-archive account:
- S3 bucket for CloudTrail logs — KMS encrypted, versioned, 7-year lifecycle, public access blocked
- S3 bucket for Config delivery — same controls
- Organization CloudTrail — multi-region, org-wide, S3 data events, Lambda invocations
- AWS Config recorder and delivery channel

### `modules/networking`
Transit Gateway hub in the network account:
- Transit Gateway with DNS support, VPN ECMP, auto-accept shared attachments
- Separate route tables for spoke accounts and egress traffic
- RAM resource share — share TGW with entire org (workload accounts attach directly)
- Optional centralized egress VPC with NAT Gateway (one public IP for all outbound traffic)

### `modules/identity`
IAM Identity Center (SSO) in the management account:
- 4 permission sets: AdministratorAccess (4h session), ReadOnlyAccess, DeveloperAccess, SecurityAudit
- DeveloperAccess uses PowerUserAccess + explicit deny of IAM mutations and security tool deletion
- 3 Identity Store groups: platform-admins, developers, security-auditors

---

## Deploy Sequence

**Prerequisites:**
1. A management AWS account with Organizations NOT yet enabled (or already enabled in ALL_FEATURES mode)
2. An IAM role in the management account with permissions to create Organizations, accounts, SCPs
3. OpenTofu >= 1.6.0 installed
4. The InfraReady bootstrap CloudFormation stack deployed in the management account

**Step 1 — Configure your tfvars**

Create `terraform.tfvars`:

```hcl
org_name              = "acme"
management_account_id = "123456789012"

account_emails = {
  security    = "aws-security@acme.com"
  log_archive = "aws-log-archive@acme.com"
  network     = "aws-network@acme.com"
  prod        = "aws-prod@acme.com"
  staging     = "aws-staging@acme.com"
  dev         = "aws-dev@acme.com"
}

allowed_regions    = ["us-east-1", "us-west-2"]
log_retention_days = 2555

enable_centralized_egress = false  # Set true when ready — adds ~$36/mo

tags = {
  Organization = "acme"
  ManagedBy    = "infraready"
}
```

**Step 2 — Initialize and plan**

```bash
cd packages/landing-zone
tofu init
tofu plan -out=lz.plan
```

Review the plan carefully. Account creation is irreversible without manual AWS support involvement.

**Step 3 — Apply**

```bash
tofu apply lz.plan
```

Account creation takes 3-5 minutes per account. With 6 accounts, expect 20-30 minutes for first apply.

**Step 4 — Configure SSO**

After apply completes:
1. Open the AWS IAM Identity Center console in the management account
2. Add your IdP (Okta, Azure AD, Google Workspace) or create users manually
3. Assign groups to accounts using `aws_ssoadmin_account_assignment` resources (in your workload Terraform)

**Step 5 — Connect workload VPCs to Transit Gateway**

In each workload account:
1. Run InfraReady's VPC module — it outputs a TGW attachment ID
2. Pass those attachment IDs back as `transit_gateway_spoke_vpc_attachments`
3. Re-run `tofu apply` to accept attachments and configure routing

---

## Teardown

**WARNING: Deleting an AWS Organization account is irreversible without AWS Support intervention. Do not run `tofu destroy` without reading this section.**

Safe teardown sequence:
1. Move all workload accounts out of the org (or close them via the billing console)
2. Disable service integrations (GuardDuty, Security Hub, Config) from the management account console
3. Empty the S3 log archive buckets (required before Terraform can delete them)
4. Run `tofu destroy` — it will fail on accounts with `close_on_deletion = false`
5. Manually close accounts via the AWS console or set `close_on_deletion = true` before destroy

---

## Cost Estimate

| Service | Cost | Notes |
|---------|------|-------|
| AWS Organizations | Free | No charge for the org itself |
| Account creation | Free | No per-account charge |
| IAM Identity Center (SSO) | Free | No charge regardless of user count |
| CloudTrail (org trail) | ~$2/month per 100k events | First copy of management events is free |
| S3 log storage | ~$5-20/month | Depends on API call volume; lifecycle tiers to Deep Archive |
| GuardDuty | ~$1-5/month/account | Based on CloudTrail event volume |
| Security Hub | ~$0.001/finding | Usually < $5/month for small orgs |
| Config | ~$0.003/resource/month | ~$10-30/month for typical org |
| Transit Gateway | $0.05/hr/attachment + $0.02/GB | 5 attachments = ~$180/mo baseline |
| Centralized NAT (optional) | ~$32/mo | One NAT EIP + processing |

**Typical Landing Zone cost for a 6-account org: $300-500/month.**

This is comparable to one engineer-month of AWS DevOps consultant time. The Landing Zone pays for itself in the first security audit it helps you pass.

---

## vs. AWS Control Tower

| | InfraReady Landing Zone | AWS Control Tower |
|--|------------------------|-------------------|
| Setup time | 30 minutes | 2-4 hours |
| Customization | Full HCL control | Limited via CfCT |
| Guardrails | 4 custom SCPs | 20+ pre-built guardrails |
| Account vending | Terraform Account Factory | AWS Service Catalog |
| State management | Your S3 bucket (BYOC) | AWS-managed |
| Drift detection | `tofu plan` | AWS Config |
| Cost | Included in Enterprise tier | Free (AWS service) |
| Best for | Teams who want IaC-first control | Teams who want AWS-managed defaults |

**Recommendation:** Use InfraReady Landing Zone if your team wants full IaC control and auditable state. Use AWS Control Tower if you want AWS to manage the guardrails and you don't need to customize them.

---

## Security Notes

- All S3 buckets block public access and enforce TLS
- All CloudTrail and Config data is encrypted with customer-managed KMS keys (CMKs)
- CMKs rotate annually (AWS KMS automatic rotation)
- Log archive buckets have explicit deny on delete operations (belt-and-suspenders with SCPs)
- GuardDuty malware protection scans EBS volumes on suspicious findings
- DeveloperAccess permission set uses explicit deny for IAM mutations — prevents privilege escalation
- SecurityAudit permission set is read-only — safe for external auditors
- root account usage is denied in all member accounts via SCP

---

## Files

```
packages/landing-zone/
├── main.tf           Root orchestration — provider aliases + module calls
├── variables.tf      Root variables
├── outputs.tf        Root outputs (account IDs, TGW ID, SSO ARNs)
├── versions.tf       OpenTofu >= 1.6, AWS provider ~> 5.80
└── modules/
    ├── organizations/    AWS Org + OUs + Account Factory
    ├── scp/              4 Service Control Policies
    ├── security/         GuardDuty + Security Hub + Config aggregator
    ├── logging/          CloudTrail + S3 log archive + Config delivery
    ├── networking/       Transit Gateway + RAM share + egress VPC
    └── identity/         IAM Identity Center permission sets + groups
```
