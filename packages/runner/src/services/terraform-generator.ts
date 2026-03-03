/**
 * Terraform / OpenTofu HCL Generator
 *
 * Takes user inputs from the setup wizard and generates a complete, valid
 * HCL configuration for any InfraReady module. Used for:
 *  - "Preview Terraform" in the UI before deploying
 *  - "Download as .tf" for users who want to run manually
 *  - Input to the security scanner before deployment
 *
 * Supports both OpenTofu (primary) and Terraform (>=1.5) engines.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export type ModuleType = "vpc" | "rds" | "ecs" | "storage" | "security" | "waf" | "kms" | "backup";
export type IaCEngine  = "opentofu" | "terraform";

export interface ModuleConfig {
  type:        ModuleType;
  engine:      IaCEngine;
  projectName: string;   // slug — lowercase, hyphens only
  environment: string;   // "production" | "staging" | "development"
  region:      string;   // e.g. "us-east-1"
  roleArn:     string;   // cross-account IAM role ARN
  externalId:  string;   // OIDC external ID for trust condition
  variables:   Record<string, unknown>; // module-specific variables from wizard
}

export interface GeneratedConfig {
  hcl:           string; // Complete HCL — paste into main.tf
  backendConfig: string; // backend.tf content
  planSummary:   string; // Human-readable list of resources to be created
  estimatedMonthlyCost: string; // Rough USD/month estimate
  engine:        IaCEngine;
  stateBucket:   string; // S3 bucket name for state
}

// ─── Entry point ─────────────────────────────────────────────────────────────

export function generateConfig(config: ModuleConfig): GeneratedConfig {
  validateConfig(config);

  const stateBucket = `infraready-state-${config.projectName}-${config.region}`;

  const hcl = [
    generateVersionsBlock(config),
    generateProviderBlock(config),
    generateModuleBlock(config),
  ].join("\n\n");

  const backendConfig = generateBackendBlock(config, stateBucket);

  return {
    hcl,
    backendConfig,
    planSummary:          getPlanSummary(config),
    estimatedMonthlyCost: estimateMonthlyCost(config),
    engine:               config.engine,
    stateBucket,
  };
}

// ─── Validation ──────────────────────────────────────────────────────────────

function validateConfig(config: ModuleConfig): void {
  if (!config.projectName.match(/^[a-z0-9-]+$/)) {
    throw new Error(`projectName must be lowercase alphanumeric with hyphens. Got: "${config.projectName}"`);
  }
  if (!config.roleArn.startsWith("arn:aws:iam::")) {
    throw new Error(`roleArn must be a valid IAM Role ARN. Got: "${config.roleArn}"`);
  }
  if (!config.externalId || config.externalId.length < 8) {
    throw new Error("externalId must be at least 8 characters.");
  }
  if (!SUPPORTED_MODULES.includes(config.type)) {
    throw new Error(`Unsupported module type: "${config.type}". Supported: ${SUPPORTED_MODULES.join(", ")}`);
  }
}

const SUPPORTED_MODULES: ModuleType[] = ["vpc", "rds", "ecs", "storage", "security", "waf", "kms", "backup"];

// ─── versions block ───────────────────────────────────────────────────────────

function generateVersionsBlock(config: ModuleConfig): string {
  if (config.engine === "opentofu") {
    return `terraform {
  required_version = ">= 1.6.0"

  required_providers {
    aws = {
      source  = "registry.opentofu.org/hashicorp/aws"
      version = "~> 5.80"
    }
    random = {
      source  = "registry.opentofu.org/hashicorp/random"
      version = "~> 3.6"
    }
  }
}`;
  }

  // Terraform >=1.5
  return `terraform {
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
}`;
}

// ─── provider block ───────────────────────────────────────────────────────────

function generateProviderBlock(config: ModuleConfig): string {
  return `provider "aws" {
  region = "${config.region}"

  # InfraReady assumes this cross-account role to deploy into your AWS account.
  # The role was created by the bootstrap CloudFormation template.
  assume_role {
    role_arn     = "${config.roleArn}"
    session_name = "infraready-${config.projectName}-${config.type}"
    external_id  = "${config.externalId}"
  }

  default_tags {
    tags = {
      Project     = "${config.projectName}"
      Environment = "${config.environment}"
      ManagedBy   = "infraready"
      Module      = "${config.type}"
    }
  }
}`;
}

// ─── backend block ────────────────────────────────────────────────────────────

function generateBackendBlock(config: ModuleConfig, stateBucket: string): string {
  if (config.engine === "opentofu") {
    // OpenTofu 1.10+ supports native S3 locking (no DynamoDB needed)
    return `terraform {
  backend "s3" {
    bucket       = "${stateBucket}"
    key          = "${config.type}/terraform.tfstate"
    region       = "${config.region}"
    encrypt      = true
    use_lockfile = true   # OpenTofu native S3 locking — no DynamoDB required
  }
}`;
  }

  // Terraform requires DynamoDB for state locking
  return `terraform {
  backend "s3" {
    bucket         = "${stateBucket}"
    key            = "${config.type}/terraform.tfstate"
    region         = "${config.region}"
    encrypt        = true
    dynamodb_table = "${stateBucket}-lock"   # Terraform requires DynamoDB for locking
  }
}`;
}

// ─── module block ─────────────────────────────────────────────────────────────

function generateModuleBlock(config: ModuleConfig): string {
  const vars = buildModuleVariables(config);
  const varLines = Object.entries(vars)
    .map(([k, v]) => `  ${k.padEnd(28)} = ${formatHclValue(v)}`)
    .join("\n");

  return `module "${config.type}" {
  source = "github.com/infraready099/infrareadu-code-first//packages/modules/${config.type}?ref=main"
  # Alternatively, use a pinned version tag: ?ref=v1.2.0

${varLines}
}`;
}

// ─── variable builders ────────────────────────────────────────────────────────

function buildModuleVariables(config: ModuleConfig): Record<string, unknown> {
  const base = {
    project_name: config.projectName,
    environment:  config.environment,
    aws_region:   config.region,
  };

  switch (config.type) {
    case "vpc":
      return {
        ...base,
        vpc_cidr:           config.variables.vpc_cidr        ?? "10.0.0.0/16",
        enable_nat_gateway: config.variables.enable_nat      ?? true,
        single_nat_gateway: config.variables.single_nat      ?? true, // cost-optimized default
        enable_flow_logs:   config.variables.enable_flow_logs ?? true,
      };

    case "rds":
      return {
        ...base,
        vpc_id:              config.variables.vpc_id              ?? "",
        subnet_ids:          config.variables.private_subnet_ids  ?? [],
        app_security_group_id: config.variables.app_sg_id         ?? "",
        instance_class:      config.variables.instance_class      ?? "db.t3.micro",
        db_name:             config.variables.db_name             ?? config.projectName.replace(/-/g, "_"),
        multi_az:            config.variables.multi_az            ?? false,
        backup_retention:    config.variables.backup_retention     ?? 7,
        deletion_protection: config.environment === "production",
      };

    case "ecs":
      return {
        ...base,
        vpc_id:           config.variables.vpc_id            ?? "",
        public_subnet_ids:  config.variables.public_subnet_ids  ?? [],
        private_subnet_ids: config.variables.private_subnet_ids ?? [],
        container_image:  config.variables.container_image    ?? "nginx:latest",
        container_port:   config.variables.container_port     ?? 8080,
        cpu:              config.variables.cpu               ?? 256,
        memory:           config.variables.memory            ?? 512,
        desired_count:    config.variables.desired_count     ?? 1,
        enable_autoscaling: config.variables.enable_autoscaling ?? true,
        health_check_path:  config.variables.health_check_path  ?? "/health",
      };

    case "storage":
      return {
        ...base,
        domain_name:         config.variables.domain_name          ?? null,
        enable_versioning:   config.variables.enable_versioning     ?? true,
        enable_cloudfront:   config.variables.enable_cloudfront     ?? true,
        price_class:         config.variables.price_class           ?? "PriceClass_100", // US/EU only (cheapest)
        enable_cors:         config.variables.enable_cors           ?? false,
      };

    case "security":
      return {
        ...base,
        enable_guardduty:         config.variables.enable_guardduty          ?? true,
        enable_securityhub:       config.variables.enable_securityhub        ?? true,
        enable_config:            config.variables.enable_config              ?? true,
        enable_cloudtrail:        config.variables.enable_cloudtrail          ?? true,
        alert_email:              config.variables.alert_email                ?? "",
        cloudtrail_retention_days: config.variables.cloudtrail_retention_days ?? 2555, // 7 years
      };

    case "waf":
      return {
        ...base,
        alb_arn:       config.variables.alb_arn   ?? "",
        enable_rate_limit: config.variables.enable_rate_limit ?? true,
        rate_limit:    config.variables.rate_limit ?? 1000,
      };

    case "kms":
      return {
        ...base,
        enable_key_rotation: config.variables.enable_key_rotation ?? true,
        deletion_window:     config.variables.deletion_window      ?? 30,
      };

    case "backup":
      return {
        ...base,
        vault_name:         config.variables.vault_name ?? `${config.projectName}-backup`,
        backup_schedule:    config.variables.backup_schedule ?? "cron(0 2 * * ? *)", // 2am UTC daily
        retention_days:     config.variables.retention_days ?? 30,
        resource_arns:      config.variables.resource_arns ?? [],
      };

    default:
      return { ...base, ...config.variables };
  }
}

// ─── Plan summary ─────────────────────────────────────────────────────────────

const PLAN_SUMMARIES: Record<ModuleType, (config: ModuleConfig) => string[]> = {
  vpc: (c) => [
    `VPC (${(c.variables.vpc_cidr as string) ?? "10.0.0.0/16"}) in ${c.region}`,
    "2 public subnets + 2 private subnets",
    "Internet Gateway",
    c.variables.enable_nat !== false ? "NAT Gateway (single AZ — cost optimized)" : "No NAT Gateway",
    "VPC Flow Logs → CloudWatch (SOC2 requirement)",
    "Default security group — all traffic denied",
  ],
  rds: (c) => [
    `RDS PostgreSQL 15 (${(c.variables.instance_class as string) ?? "db.t3.micro"})`,
    "Encrypted at rest (KMS)",
    `Automated backups — ${(c.variables.backup_retention as number) ?? 7} days retention`,
    c.environment === "production" ? "Deletion protection ENABLED" : "Deletion protection disabled",
    "DB password → AWS Secrets Manager",
    c.variables.multi_az ? "Multi-AZ enabled" : "Single-AZ (upgrade for HA)",
  ],
  ecs: (c) => [
    `ECS Fargate cluster with ${(c.variables.desired_count as number) ?? 1} task(s)`,
    `CPU: ${(c.variables.cpu as number) ?? 256}, Memory: ${(c.variables.memory as number) ?? 512} MB`,
    "Application Load Balancer + Target Group",
    "ECR repository for Docker images",
    "CloudWatch log group (30-day retention)",
    c.variables.enable_autoscaling !== false ? "Auto-scaling (CPU-based)" : "No auto-scaling",
  ],
  storage: (c) => [
    "S3 bucket — private, versioned, AES-256 encrypted",
    "Lifecycle: transition to S3-IA after 30 days",
    c.variables.enable_cloudfront !== false ? "CloudFront distribution (HTTPS only)" : "No CloudFront",
    c.variables.domain_name ? `Custom domain: ${c.variables.domain_name}` : "CloudFront default domain",
    "Security headers: HSTS, X-Frame-Options, CSP",
  ],
  security: () => [
    "GuardDuty — threat detection",
    "SecurityHub — centralized findings (CIS + AWS Foundational)",
    "CloudTrail — API audit log (multi-region, 7-year retention)",
    "AWS Config — resource inventory + compliance",
    "IAM password policy (CIS compliant)",
    "SNS alert topic for security events",
  ],
  waf: () => [
    "WAF Web ACL attached to ALB",
    "AWS Managed Rules: Core, Known Bad Inputs, SQL Injection",
    "Rate limiting (1000 req/5min per IP)",
  ],
  kms: () => [
    "KMS Customer Managed Key (CMK)",
    "Automatic key rotation enabled",
    "Key policies — least privilege",
  ],
  backup: (c) => [
    "AWS Backup vault",
    `Backup schedule: daily at 2am UTC`,
    `Retention: ${(c.variables.retention_days as number) ?? 30} days`,
    "Point-in-time recovery",
  ],
};

function getPlanSummary(config: ModuleConfig): string {
  const items = PLAN_SUMMARIES[config.type]?.(config) ?? ["Resources as configured"];
  return items.map(i => `• ${i}`).join("\n");
}

// ─── Cost estimates ───────────────────────────────────────────────────────────

// Rough USD/month estimates for default configs — not guaranteed
const COST_ESTIMATES: Record<ModuleType, (config: ModuleConfig) => string> = {
  vpc: (c) => {
    const nat = c.variables.enable_nat !== false ? "$32/mo (NAT Gateway ~$32/mo + data transfer)" : "$0 (no NAT Gateway)";
    return `~${nat}\nVPC itself is free.`;
  },
  rds: (c) => {
    const cls = (c.variables.instance_class as string) ?? "db.t3.micro";
    const costs: Record<string, string> = {
      "db.t3.micro": "~$13/mo",
      "db.t3.small": "~$26/mo",
      "db.t3.medium": "~$52/mo",
      "db.r6g.large": "~$167/mo",
    };
    return `${costs[cls] ?? "varies"} + storage (~$0.115/GB-month)`;
  },
  ecs: (c) => {
    const cpu    = (c.variables.cpu as number)    ?? 256;
    const memory = (c.variables.memory as number) ?? 512;
    const count  = (c.variables.desired_count as number) ?? 1;
    // Fargate pricing: $0.04048/vCPU/hr, $0.004445/GB/hr
    const cpuCost    = (cpu / 1024) * 0.04048 * 730 * count;
    const memoryCost = (memory / 1024) * 0.004445 * 730 * count;
    const alb        = 16; // ALB base ~$16/mo
    const total      = Math.round(cpuCost + memoryCost + alb);
    return `~$${total}/mo (${count} task × ${cpu}vCPU + ${memory}MB + ALB)`;
  },
  storage: (c) => {
    const cf = c.variables.enable_cloudfront !== false ? "$1/mo (CloudFront first 1TB free then $0.0085/GB)" : "$0";
    return `S3 storage: $0.023/GB-month\nCloudFront: ${cf}`;
  },
  security: () => `~$35/mo (GuardDuty ~$1-4/mo, SecurityHub ~$0.001/check, Config ~$0.003/item)`,
  waf:      () => `~$5/mo (WAF WebACL $1/mo + $0.60/million requests)`,
  kms:      () => `~$1/mo ($1/key/month + $0.03/10K API calls)`,
  backup:   () => `~$5/mo ($0.05/GB-month backup storage)`,
};

function estimateMonthlyCost(config: ModuleConfig): string {
  return COST_ESTIMATES[config.type]?.(config) ?? "Contact us for estimate";
}

// ─── HCL formatting helpers ───────────────────────────────────────────────────

function formatHclValue(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "boolean")  return value.toString();
  if (typeof value === "number")   return value.toString();
  if (typeof value === "string")   return `"${value.replace(/"/g, '\\"')}"`;
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    const items = value.map(v => `    ${formatHclValue(v)}`).join(",\n");
    return `[\n${items}\n  ]`;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .map(([k, v]) => `    ${k} = ${formatHclValue(v)}`)
      .join("\n");
    return `{\n${entries}\n  }`;
  }
  return String(value);
}

// ─── Convenience: generate full downloadable .zip contents ────────────────────

export function generateDownloadableFiles(config: ModuleConfig): Map<string, string> {
  const generated = generateConfig(config);
  const files = new Map<string, string>();

  files.set("main.tf",    generated.hcl);
  files.set("backend.tf", generated.backendConfig);
  files.set("README.md",  generateReadme(config, generated));

  return files;
}

function generateReadme(config: ModuleConfig, generated: GeneratedConfig): string {
  return `# ${config.projectName} — ${config.type} module

Generated by InfraReady on ${new Date().toISOString().split("T")[0]}.
Engine: ${config.engine} | Region: ${config.region} | Environment: ${config.environment}

## What this creates

${generated.planSummary}

## Estimated cost

${generated.estimatedMonthlyCost}

## How to apply

\`\`\`bash
# Initialize (downloads providers and sets up S3 backend)
${config.engine === "opentofu" ? "tofu" : "terraform"} init

# Preview changes
${config.engine === "opentofu" ? "tofu" : "terraform"} plan

# Apply (creates real AWS resources)
${config.engine === "opentofu" ? "tofu" : "terraform"} apply
\`\`\`

## State

Terraform state is stored in your own S3 bucket:
  s3://${generated.stateBucket}/${config.type}/terraform.tfstate

InfraReady cannot access your state. It lives entirely in your AWS account.

## Remove InfraReady access

To revoke InfraReady's access to your account at any time:
1. Delete the \`InfraReadyRole\` IAM role in your AWS account
2. The cross-account trust is immediately broken — InfraReady can no longer assume the role
`;
}
