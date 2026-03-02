# InfraReady Compliance Coverage

## What InfraReady Provides (Technical Controls)

| Framework | Coverage | Notes |
|-----------|----------|-------|
| SOC2 Type II | ~75% of technical controls | Remaining 25% are organizational (policies, training, HR) |
| HIPAA | ~70% of technical safeguards | BAA with AWS required separately |
| PCI DSS | ~50% | Requires additional network segmentation for cardholder data |
| ISO 27001 | ~60% | Technical controls covered; organizational controls need ISMS |

## SOC2 Controls Map

### CC6 — Logical and Physical Access Controls

| Control | Implementation | Module |
|---------|---------------|--------|
| CC6.1 — Logical access controls | KMS encryption, IAM least-privilege, S3 block public access | RDS, Storage, Security |
| CC6.2 — Authentication | IAM password policy, MFA enforcement alerts, Secrets Manager | Security |
| CC6.3 — Access provisioning | Cross-account IAM roles with ExternalId, minimal permissions | (CloudFormation bootstrap) |
| CC6.6 — Network boundaries | WAF (SQLi, XSS, rate limiting, IP reputation), Security Groups | WAF, VPC |
| CC6.7 — Transmission controls | HTTPS/TLS 1.3 on ALB, VPC endpoints for private AWS API calls, S3 HTTPS-only policy | ECS, VPC Endpoints, Storage |

### CC7 — System Operations

| Control | Implementation | Module |
|---------|---------------|--------|
| CC7.1 — Threat detection | GuardDuty (malware, crypto mining, credential compromise, port scanning) | Security |
| CC7.2 — Monitoring | CloudTrail all-region + log validation, VPC flow logs, CloudWatch alarms | Security, VPC |
| CC7.3 — Incident response | Root account alerts, billing alarms, WAF block rate alarms, SNS notifications | Security, WAF |

### A1 — Availability

| Control | Implementation | Module |
|---------|---------------|--------|
| A1.1 — Availability monitoring | CloudWatch alarms, ECS health checks, ALB health checks | ECS, Security |
| A1.2 — Environmental protections | `prevent_destroy = true`, deletion protection on RDS and ALB | RDS, ECS |
| A1.3 — Recovery | Automated RDS backups (7 days), S3 versioning, Multi-AZ option | RDS, Storage |

## HIPAA Safeguards Map

### Administrative Safeguards (§164.308)
- Security incident monitoring: GuardDuty (§164.308(a)(6))
- Audit controls: CloudTrail (§164.308(a)(1))
- **NOT PROVIDED**: Policies, training, workforce procedures — organizational controls

### Physical Safeguards (§164.310)
- Data backup: Automated RDS backups, S3 versioning (§164.310(d))
- **NOTE**: AWS handles physical datacenter security under shared responsibility

### Technical Safeguards (§164.312)
- Access control: IAM roles, Secrets Manager (§164.312(a)(1))
- Audit controls: CloudTrail, CloudWatch (§164.312(b))
- Integrity controls: S3 versioning, CloudTrail log validation (§164.312(c))
- Transmission security: TLS 1.3, VPC endpoints, HTTPS-only (§164.312(e))
- Encryption at rest: KMS CMK on RDS, S3 SSE (§164.312(a)(2)(iv))

## What InfraReady Does NOT Cover

These are outside scope for a technical infrastructure tool:

1. **BAA (Business Associate Agreement)** — Sign with AWS directly at aws.amazon.com/compliance/baa
2. **Security policies and procedures** — Organizational documents
3. **Employee training** — People controls
4. **Penetration testing** — Hire a pen tester; we give you the infrastructure
5. **SOC2 audit** — Hire an auditor (we recommend Vanta, Drata, or Secureframe to automate)
6. **Incident response plan** — Written policy your team follows

## Recommended Tools to Pair with InfraReady

| Tool | Purpose | Cost |
|------|---------|------|
| [Vanta](https://vanta.com) | SOC2 automation, evidence collection | $15k+/yr |
| [Drata](https://drata.com) | SOC2/ISO27001 automation | $10k+/yr |
| [Secureframe](https://secureframe.com) | SOC2/HIPAA automation | $8k+/yr |
| [AWS Security Hub](https://aws.amazon.com/security-hub/) | AWS-native compliance dashboard | ~$0.001/check |
| [Prowler](https://prowler.com) | Open source AWS security scanner | Free |
| [Trivy](https://trivy.dev) | Container/IaC vulnerability scanner | Free |

## Honest Caveats

1. **These modules are new** — they implement best practices but have not been through a real SOC2 audit
2. **Every environment is different** — a SOC2 auditor will review YOUR specific configuration
3. **Compliance is ongoing** — not a one-time checkbox; requires continuous monitoring
4. **We cover infrastructure** — application-level security (OWASP) is your responsibility
