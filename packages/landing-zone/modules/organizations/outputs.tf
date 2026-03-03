output "organization_id" {
  description = "AWS Organizations organization ID (o-xxxxxxxxxx)"
  value       = aws_organizations_organization.this.id
}

output "organization_arn" {
  description = "AWS Organizations organization ARN"
  value       = aws_organizations_organization.this.arn
}

output "root_id" {
  description = "Organizations root ID — used when attaching SCPs at the org root level"
  value       = aws_organizations_organization.this.roots[0].id
}

output "master_account_id" {
  description = "Management account ID (the account that owns the organization)"
  value       = aws_organizations_organization.this.master_account_id
}

output "account_ids" {
  description = "Map of account name → account ID for all accounts managed by this module"
  value = {
    security    = aws_organizations_account.security.id
    log_archive = aws_organizations_account.log_archive.id
    network     = aws_organizations_account.network.id
    prod        = aws_organizations_account.prod.id
    staging     = aws_organizations_account.staging.id
    dev         = aws_organizations_account.dev.id
  }
}

output "ou_ids" {
  description = "Map of OU name → OU ID — consumed by the SCP module for policy attachments"
  value = {
    security       = aws_organizations_organizational_unit.security.id
    infrastructure = aws_organizations_organizational_unit.infrastructure.id
    workloads      = aws_organizations_organizational_unit.workloads.id
    sandbox        = aws_organizations_organizational_unit.sandbox.id
  }
}

output "account_arns" {
  description = "Map of account name → account ARN"
  value = {
    security    = aws_organizations_account.security.arn
    log_archive = aws_organizations_account.log_archive.arn
    network     = aws_organizations_account.network.arn
    prod        = aws_organizations_account.prod.arn
    staging     = aws_organizations_account.staging.arn
    dev         = aws_organizations_account.dev.arn
  }
}
