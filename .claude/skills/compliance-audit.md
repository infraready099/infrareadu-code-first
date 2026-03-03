# Skill: Compliance Audit

Run a quick compliance check across all InfraReady modules.

## Quick Grep Audit
```bash
# SOC2 Controls
echo "=== SOC2 Controls ==="
grep -r "aws_cloudtrail" packages/modules/ --include="*.tf" -l
grep -r "aws_guardduty_detector" packages/modules/ --include="*.tf" -l
grep -r "aws_securityhub_account" packages/modules/ --include="*.tf" -l
grep -r "aws_wafv2_web_acl" packages/modules/ --include="*.tf" -l
grep -r "aws_vpc_endpoint" packages/modules/ --include="*.tf" -l
grep -r "aws_backup_vault" packages/modules/ --include="*.tf" -l
grep -r "aws_kms_key" packages/modules/ --include="*.tf" -l
grep -r "aws_flow_log" packages/modules/ --include="*.tf" -l
grep -r "aws_macie2_account" packages/modules/ --include="*.tf" -l
grep -r "aws_inspector2_enabler" packages/modules/ --include="*.tf" -l

# HIPAA Controls
echo "=== HIPAA Controls ==="
grep -r "pgaudit" packages/modules/ --include="*.tf" -l
grep -r "enable_key_rotation.*true" packages/modules/ --include="*.tf" -l
grep -r "aws_backup_vault_lock" packages/modules/ --include="*.tf" -l
grep -r "storage_encrypted.*true" packages/modules/ --include="*.tf" -l
```

## Module Compliance Matrix
| Module | SOC2 | HIPAA | PCI |
|--------|------|-------|-----|
| vpc | CC6.1 flow logs, CC6.7 routing | §164.312(a)(1) | Network segmentation |
| rds | CC6.1 encrypted, no public | §164.312(b) pgaudit | PCI 3.4 encryption |
| security | CC7.1 GuardDuty, CC7.2 CloudTrail | §164.308(a)(6) | PCI 10 logging |
| kms | CC6.1 CMKs | §164.312(a)(2)(iv) | PCI 3.4 |
| backup | A1.2 vault lock | §164.310(d) 7yr | PCI 9.5 |
| macie | CC6.1 data classification | §164.308(a)(1) | PCI 3.1 |
| waf | CC6.6 boundary | §164.312(e)(1) | PCI 6.6 |
| inspector-ssm | CC7.1 scanning | §164.308(a)(8) | PCI 6.1 |

## When to Run
- Before creating a PR with new modules
- After any changes to security/main.tf
- Before customer demo or SOC2 audit
