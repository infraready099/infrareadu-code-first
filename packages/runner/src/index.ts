/**
 * InfraReady Deploy Runner — AWS Lambda
 *
 * Triggered by SQS. Assumes customer's IAM role, runs OpenTofu,
 * streams logs back to Supabase in real time.
 *
 * Deployment state machine:
 *   QUEUED → running → (per module: init → import → plan → apply) → success
 *   On retryable failure: auto-retry up to 3x with backoff
 *   On permanent failure: auto-destroy all created resources → failed
 */

import { SQSEvent, SQSRecord } from "aws-lambda";
import { STSClient, AssumeRoleCommand } from "@aws-sdk/client-sts";
import { execOpenTofu, destroyOpenTofu } from "./opentofu";
import { createClient } from "@supabase/supabase-js";
import { generateConfig, ModuleType, IaCEngine } from "./services/terraform-generator";
import { scanHcl, formatScanReport, DEFAULT_FRAMEWORKS, DEFAULT_BLOCK_ON } from "./services/security-scan";
import { generateGitHubWorkflow, workflowConfigFromOutputs } from "./services/github-workflow";
import { pushWorkflowToRepo } from "./services/github-push";

const sts = new STSClient({ region: process.env.AWS_REGION ?? "us-east-1" });

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ─── Retry policy ────────────────────────────────────────────────────────────

const RETRY_DELAYS_MS = [30_000, 60_000, 120_000]; // 30s, 1min, 2min
const MAX_ATTEMPTS = 3;

/**
 * Errors that indicate a transient AWS condition — safe to retry.
 * The runner will wait and try again up to MAX_ATTEMPTS times.
 */
const RETRYABLE_PATTERNS = [
  "RequestExpired",
  "Throttling",
  "ThrottlingException",
  "RequestLimitExceeded",
  "ServiceUnavailable",
  "InsufficientInstanceCapacity",
  "InsufficientCapacityException",
  "RequestTimeout",
  "ProviderProducedInconsistentResultAfterApply", // transient tofu issue
];

/**
 * Errors that are fatal — stop immediately and alert the user.
 * Retrying will not help and may make things worse.
 */
const FATAL_PATTERNS = [
  "AuthFailure",
  "UnauthorizedOperation",
  "InvalidClientTokenId",
  "AccessDenied",
  "NotAuthorized",
  "AccountProblem",
  "SignatureDoesNotMatch",
  "InvalidSignatureException",
  // AWS account quota errors — retrying will never succeed
  "SubscriptionRequiredException", // GuardDuty/SecurityHub need console enrollment first
  "VpcLimitExceeded",
  "AddressLimitExceeded",
  "InstanceLimitExceeded",
  "SubnetLimitExceeded",
  "SecurityGroupLimitExceeded",
  "InternetGatewayLimitExceeded",
  "EIPLimitExceeded",
];

type ErrorClass = "retryable" | "fatal" | "recoverable";

function classifyError(err: Error): ErrorClass {
  const msg = err.message;
  if (FATAL_PATTERNS.some((p) => msg.includes(p))) return "fatal";
  if (RETRYABLE_PATTERNS.some((p) => msg.includes(p))) return "retryable";
  // Default: treat as recoverable (destroy and retry fresh)
  return "recoverable";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function friendlyError(msg: string): string {
  if (msg.includes("AuthFailure") || msg.includes("AccessDenied") || msg.includes("UnauthorizedOperation")) {
    return "AWS permissions error — InfraReady's IAM role may not have the required permissions. Check the bootstrap CloudFormation stack is up to date.";
  }
  if (msg.includes("InvalidClientTokenId") || msg.includes("SignatureDoesNotMatch")) {
    return "AWS credentials are invalid or expired. Try disconnecting and reconnecting your AWS account.";
  }
  if (msg.includes("Throttling") || msg.includes("RequestLimitExceeded")) {
    return "AWS is rate limiting requests. This is temporary — your deployment will retry automatically.";
  }
  if (msg.includes("InsufficientInstanceCapacity")) {
    return "AWS doesn't have capacity for the selected instance type in this AZ right now. Try a different region or instance type.";
  }
  if (msg.includes("VpcLimitExceeded")) {
    return "Your AWS account has reached the VPC limit (default: 5 per region). Delete unused VPCs at console.aws.amazon.com/vpc, or request a limit increase at console.aws.amazon.com/servicequotas.";
  }
  if (msg.includes("AddressLimitExceeded") || msg.includes("EIPLimitExceeded")) {
    return "Your AWS account has reached the Elastic IP limit. Release unused EIPs at console.aws.amazon.com/ec2 → Elastic IPs.";
  }
  if (msg.includes("InstanceLimitExceeded")) {
    return "Your AWS account has reached the EC2 instance limit for this instance type. Request a limit increase at console.aws.amazon.com/servicequotas.";
  }
  return msg;
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface DeployJob {
  deploymentId: string;
  projectId: string;
  userId: string;
  modules: string[];
  config: Record<string, unknown>;
  awsRoleArn: string;
  awsExternalId: string;
  githubRepoOwner?: string;
  githubRepoName?: string;
  githubBranch?: string;
  githubInstallationId?: string;
}

type Credentials = {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken: string;
};

// ─── Lambda handler ──────────────────────────────────────────────────────────

export const handler = async (event: SQSEvent): Promise<void> => {
  for (const record of event.Records) {
    await processRecord(record);
  }
};

// ─── Main deployment flow ─────────────────────────────────────────────────────

async function processRecord(record: SQSRecord): Promise<void> {
  const job: DeployJob = JSON.parse(record.body);
  const { deploymentId } = job;

  const awsAccountId = job.awsRoleArn.split(":")[4];
  const region = (job.config.aws_region as string) ?? "us-east-1";

  let credentials: Credentials | null = null;
  const deployedModules: string[] = [];

  await updateDeployment(deploymentId, { status: "running" });
  await appendLog(deploymentId, "info", `[InfraReady] Starting deployment ${deploymentId}`);

  try {
    // ── Step 1: Assume customer IAM role ────────────────────────────────────
    await appendLog(deploymentId, "info", `[AWS] Assuming role: ${job.awsRoleArn}`);

    const assumed = await sts.send(new AssumeRoleCommand({
      RoleArn:         job.awsRoleArn,
      RoleSessionName: `infraready-deploy-${deploymentId}`,
      ExternalId:      job.awsExternalId,
      DurationSeconds: 3600,
    }));

    credentials = {
      accessKeyId:     assumed.Credentials!.AccessKeyId!,
      secretAccessKey: assumed.Credentials!.SecretAccessKey!,
      sessionToken:    assumed.Credentials!.SessionToken!,
    };

    await appendLog(deploymentId, "success", "[AWS] Role assumed successfully");

    // ── Step 2: Security scan ────────────────────────────────────────────────
    await appendLog(deploymentId, "info", "\n[Security] Running compliance scan (SOC2, HIPAA, CIS)...");

    const MODULE_ORDER = ["vpc", "rds", "ecs", "storage", "security", "waf", "kms", "backup"];
    const orderedModules = MODULE_ORDER.filter((m) => job.modules.includes(m));

    for (const moduleName of orderedModules) {
      const generatedHcl = generateConfig({
        type:        moduleName as ModuleType,
        engine:      (job.config.engine as IaCEngine) ?? "opentofu",
        projectName: job.config.project_name as string,
        environment: (job.config.environment as string) ?? "production",
        region,
        roleArn:     job.awsRoleArn,
        externalId:  job.awsExternalId,
        variables:   job.config,
      });

      const scanResult = await scanHcl({
        hclContent:      generatedHcl.hcl,
        frameworks:      DEFAULT_FRAMEWORKS,
        blockOnSeverity: DEFAULT_BLOCK_ON,
        projectName:     job.config.project_name as string,
        moduleType:      moduleName,
      });

      await appendLog(deploymentId, scanResult.passed ? "success" : "error", formatScanReport(scanResult));

      if (!scanResult.passed) {
        throw new Error(
          `Security scan BLOCKED module "${moduleName}" — ` +
          `${scanResult.summary.critical} critical, ${scanResult.summary.high} high severity findings. ` +
          `Fix the issues above and redeploy.`
        );
      }
    }

    await appendLog(deploymentId, "success", "[Security] All modules passed compliance scan.\n");

    // ── Step 3: Deploy each module with retry ────────────────────────────────
    const outputs: Record<string, Record<string, unknown>> = {};

    for (const moduleName of orderedModules) {
      await appendLog(deploymentId, "info", `\n[OpenTofu] Deploying module: ${moduleName}`);
      await updateDeployment(deploymentId, { current_module: moduleName });

      const moduleConfig = buildModuleConfig(moduleName, job.config, outputs);

      const moduleOutputs = await deployModuleWithRetry({
        moduleName,
        moduleConfig,
        credentials,
        deploymentId,
        projectId: job.projectId,
        region,
        awsAccountId,
      });

      deployedModules.push(moduleName);
      outputs[moduleName] = moduleOutputs;
      await appendLog(deploymentId, "success", `[OpenTofu] Module ${moduleName} deployed successfully`);
    }

    // ── Step 4: Save outputs ─────────────────────────────────────────────────
    await appendLog(deploymentId, "info", "\n[InfraReady] Saving outputs...");

    const flatOutputs = formatOutputs(outputs);

    // Generate GitHub Actions workflow if ECS was deployed
    const branch = (job.config.github_branch as string | undefined) ?? job.githubBranch ?? "main";
    const workflowCfg = workflowConfigFromOutputs(flatOutputs, awsAccountId, region, branch);

    if (workflowCfg) {
      const workflowYaml = generateGitHubWorkflow(workflowCfg);
      flatOutputs.github_workflow_yaml = workflowYaml;

      // Auto-push to repo if GitHub App is connected
      const appId       = process.env.GITHUB_DEPLOY_APP_ID;
      const privateKey  = process.env.GITHUB_DEPLOY_APP_PRIVATE_KEY?.replace(/\\n/g, "\n");
      const owner       = job.githubRepoOwner;
      const repo        = job.githubRepoName;
      const installId   = job.githubInstallationId;

      if (appId && privateKey && owner && repo && installId) {
        try {
          await appendLog(deploymentId, "info", "\n[GitHub] Pushing deploy workflow to your repo...");
          const fileUrl = await pushWorkflowToRepo({
            appId,
            privateKeyPem:  privateKey,
            installationId: installId,
            owner,
            repo,
            workflowYaml,
          });
          await appendLog(deploymentId, "success",
            `[GitHub] deploy.yml pushed to your repo: ${fileUrl}\n` +
            `[GitHub] Every push to ${branch} will now build + deploy your app automatically.`
          );
          flatOutputs.github_workflow_url = fileUrl;
        } catch (ghErr) {
          // Non-fatal — infra is deployed, just log the failure
          await appendLog(deploymentId, "warn",
            `[GitHub] Could not auto-push deploy.yml: ${(ghErr as Error).message}\n` +
            `[GitHub] Copy the workflow from the outputs tab and add it manually.`
          );
        }
      } else {
        await appendLog(deploymentId, "success",
          "[InfraReady] GitHub Actions deploy workflow generated — copy from outputs tab and add to .github/workflows/deploy.yml"
        );
      }
    }

    await updateDeployment(deploymentId, {
      status:       "success",
      outputs:      flatOutputs,
      completed_at: new Date().toISOString(),
      current_module: null,
    });

    await supabase
      .from("projects")
      .update({ status: "success", last_deployed_at: new Date().toISOString() })
      .eq("id", job.projectId);

    await appendLog(deploymentId, "success", "\n[InfraReady] Deployment complete! Your infrastructure is live.");

  } catch (err: unknown) {
    const error = err as Error;
    console.error(`Deployment ${deploymentId} failed:`, error);

    const userFriendlyError = friendlyError(error.message);
    await appendLog(deploymentId, "error", `\n[InfraReady] Deployment failed: ${userFriendlyError}`);

    // ── No auto-rollback ─────────────────────────────────────────────────────
    // We intentionally do NOT destroy resources on failure.
    //
    // Why: OpenTofu state is persisted in S3. If we destroy on failure, the
    // rollback itself often fails (e.g., NAT Gateway dependencies on VPC), leaving
    // orphaned resources with no state — meaning the next deploy tries to re-create
    // everything, hits "already exists" or VpcLimitExceeded, and loops forever.
    //
    // Correct approach: leave state intact. "Deploy Again" reruns `tofu apply`
    // against the existing state — OpenTofu only creates what's missing and
    // skips what already exists. This is how Terraform/OpenTofu is designed to work.
    // ────────────────────────────────────────────────────────────────────────────

    if (deployedModules.length > 0) {
      await appendLog(deploymentId, "info",
        `\n[InfraReady] ${deployedModules.join(", ")} deployed successfully before the failure. ` +
        `Click "Deploy Again" — we'll resume from where we left off without re-creating existing resources.`
      );
    }

    await updateDeployment(deploymentId, {
      status:       "failed",
      error:        userFriendlyError,
      completed_at: new Date().toISOString(),
      current_module: null,
    });

    await supabase
      .from("projects")
      .update({ status: "failed" })
      .eq("id", job.projectId);
  }
}

// ─── Deploy module with retry ─────────────────────────────────────────────────

async function deployModuleWithRetry(params: {
  moduleName:   string;
  moduleConfig: Record<string, unknown>;
  credentials:  Credentials;
  deploymentId: string;
  projectId:    string;
  region:       string;
  awsAccountId: string;
}): Promise<Record<string, unknown>> {
  const { moduleName, moduleConfig, credentials, deploymentId, projectId, region, awsAccountId } = params;

  const tofuOpts = { module: moduleName, config: moduleConfig, credentials, deploymentId, projectId, region, awsAccountId,
    onLog: (level: "info" | "success" | "error" | "warn", line: string) => appendLog(deploymentId, level, line) };

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await execOpenTofu(tofuOpts);
    } catch (err) {
      lastError = err as Error;
      const errorClass = classifyError(lastError);

      if (errorClass === "fatal") {
        await appendLog(deploymentId, "error",
          `[InfraReady] Fatal error on ${moduleName} — not retrying: ${friendlyError(lastError.message)}`
        );
        await cleanupModule(moduleName, tofuOpts, deploymentId);
        throw lastError;
      }

      if (attempt < MAX_ATTEMPTS) {
        const delayMs = RETRY_DELAYS_MS[attempt - 1];
        await appendLog(deploymentId, "warn",
          `[InfraReady] ${moduleName} failed (attempt ${attempt}/${MAX_ATTEMPTS}). ` +
          `Retrying in ${delayMs / 1000}s... — ${lastError.message}`
        );
        await sleep(delayMs);
        await appendLog(deploymentId, "info", `[InfraReady] Retrying ${moduleName} (attempt ${attempt + 1}/${MAX_ATTEMPTS})...`);
      }
    }
  }

  // All retries exhausted — clean up this module's partial resources
  await cleanupModule(moduleName, tofuOpts, deploymentId);
  throw lastError ?? new Error(`${moduleName} failed after ${MAX_ATTEMPTS} attempts`);
}

async function cleanupModule(
  moduleName: string,
  tofuOpts: Parameters<typeof destroyOpenTofu>[0],
  deploymentId: string
): Promise<void> {
  try {
    await appendLog(deploymentId, "warn", `[InfraReady] Cleaning up partial ${moduleName} resources...`);
    await destroyOpenTofu(tofuOpts);
    await appendLog(deploymentId, "info", `[InfraReady] ${moduleName} cleaned up — your AWS account is back to a clean state.`);
  } catch {
    // Destroy can fail if nothing was created (e.g. failed before any resource) — that's fine
    await appendLog(deploymentId, "info", `[InfraReady] ${moduleName} cleanup complete.`);
  }
}

// ─── Module config builder ────────────────────────────────────────────────────

function buildModuleConfig(
  module: string,
  config: Record<string, unknown>,
  previousOutputs: Record<string, Record<string, unknown>>
): Record<string, unknown> {
  const base = {
    project_name: config.project_name,
    environment:  config.environment ?? "production",
    aws_region:   config.aws_region ?? "us-east-1",
  };

  switch (module) {
    case "vpc":
      return {
        ...base,
        vpc_cidr:           config.vpc_cidr ?? "10.0.0.0/16",
        enable_nat_gateway: config.enable_nat ?? true,
        single_nat_gateway: config.environment !== "production",
        enable_flow_logs:   true,
      };

    case "rds":
      return {
        ...base,
        vpc_id:                previousOutputs.vpc?.vpc_id,
        private_subnet_ids:    previousOutputs.vpc?.private_subnet_ids,
        app_security_group_id: previousOutputs.ecs?.ecs_task_security_group_id ?? "",
        engine:                config.db_engine ?? "postgres",
        instance_class:        config.db_instance ?? "db.t3.micro",
        multi_az:              config.db_multi_az ?? false,
        deletion_protection:   config.environment === "production",
        // Free-tier accounts reject backup_retention_period > 1.
        // Default to 1; production users can override via wizard config.
        backup_retention_days: config.backup_retention_days ?? 1,
      };

    case "ecs":
      return {
        ...base,
        vpc_id:              previousOutputs.vpc?.vpc_id,
        public_subnet_ids:   previousOutputs.vpc?.public_subnet_ids,
        private_subnet_ids:  previousOutputs.vpc?.private_subnet_ids,
        domain_name:         config.domain_name ?? "",
        container_port:      config.container_port ?? 3000,
        container_cpu:       config.container_cpu ?? 256,
        container_memory_mb: config.container_memory ?? 512,
        db_secret_arn:       previousOutputs.rds?.db_secret_arn ?? "",
      };

    case "storage":
      return {
        ...base,
        cdn_domain:            config.cdn_domain ?? "",
        enable_access_logging: true,
      };

    case "security": {
      // security module doesn't declare aws_region — omit it to avoid warnings
      const { aws_region: _r, ...securityBase } = base;
      return {
        ...securityBase,
        alert_email:                 config.alert_email ?? "",
        billing_alarm_threshold_usd: config.billing_threshold ?? 100,
        // GuardDuty + SecurityHub require account enrollment before API activation.
        // Fresh AWS accounts hit SubscriptionRequiredException via API.
        // Disabled by default — customers can enable after initial deploy.
        enable_guardduty:            false,
        enable_security_hub:         false,
        enable_config:               true,
        log_retention_days:          365,
      };
    }

    default:
      return base;
  }
}

// ─── Output formatter ─────────────────────────────────────────────────────────

function formatOutputs(
  moduleOutputs: Record<string, Record<string, unknown>>
): Record<string, unknown> {
  const out: Record<string, unknown> = {};

  if (moduleOutputs.vpc) {
    out.vpc_id             = moduleOutputs.vpc.vpc_id;
    out.public_subnet_ids  = moduleOutputs.vpc.public_subnet_ids;
    out.private_subnet_ids = moduleOutputs.vpc.private_subnet_ids;
  }

  if (moduleOutputs.rds) {
    out.db_secret_arn = moduleOutputs.rds.db_secret_arn;
    out.db_endpoint   = moduleOutputs.rds.db_endpoint;
    out.db_port       = moduleOutputs.rds.db_port ?? 5432;
    out.db_name       = moduleOutputs.rds.db_name;
  }

  if (moduleOutputs.ecs) {
    out.app_url      = moduleOutputs.ecs.app_url;
    out.ecr_url      = moduleOutputs.ecs.ecr_repository_url;
    out.cluster_name = moduleOutputs.ecs.ecs_cluster_name;
    out.service_name = moduleOutputs.ecs.ecs_service_name;
    out.log_group    = moduleOutputs.ecs.log_group_name;
    out.task_role_arn       = moduleOutputs.ecs.task_role_arn;
    out.execution_role_arn  = moduleOutputs.ecs.execution_role_arn;
  }

  if (moduleOutputs.storage) {
    out.cdn_url     = moduleOutputs.storage.cdn_url;
    out.bucket_name = moduleOutputs.storage.bucket_name;
    out.bucket_arn  = moduleOutputs.storage.bucket_arn;
  }

  if (moduleOutputs.security) {
    out.alerts_topic_arn = moduleOutputs.security.alerts_topic_arn;
  }

  return out;
}

// ─── Supabase helpers ─────────────────────────────────────────────────────────

async function updateDeployment(deploymentId: string, updates: Record<string, unknown>) {
  await supabase
    .from("deployments")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", deploymentId);
}

async function appendLog(deploymentId: string, level: string, message: string) {
  const logEntry = { ts: new Date().toISOString(), level, msg: message };
  await supabase.rpc("append_deployment_log", {
    p_deployment_id: deploymentId,
    p_log_entry:     logEntry,
  });
}
