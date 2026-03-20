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

import { SQSEvent, SQSRecord, Context } from "aws-lambda";
import { STSClient, AssumeRoleCommand } from "@aws-sdk/client-sts";
import {
  ElasticLoadBalancingV2Client,
  DescribeLoadBalancersCommand,
  ModifyLoadBalancerAttributesCommand,
} from "@aws-sdk/client-elastic-load-balancing-v2";
import {
  ECSClient,
  ListServicesCommand,
  UpdateServiceCommand,
  ListTasksCommand,
  StopTaskCommand,
} from "@aws-sdk/client-ecs";
import { execOpenTofu, destroyOpenTofu } from "./opentofu";
import { createClient } from "@supabase/supabase-js";
import { generateConfig, ModuleType, IaCEngine } from "./services/terraform-generator";
import { scanHcl, formatScanReport, DEFAULT_FRAMEWORKS, DEFAULT_BLOCK_ON } from "./services/security-scan";
import {
  generateGitHubWorkflow, workflowConfigFromOutputs,
  generateStaticWorkflow, staticWorkflowConfigFromOutputs,
} from "./services/github-workflow";
import { pushRepoFile, getInstallationToken } from "./services/github-push";
import { getHandlerById } from "./app-types";
import { getTemplate } from "./app-templates";

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
  action?: "deploy" | "destroy";
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
  /**
   * When set, deploy a pre-defined app template instead of a repo.
   * The template ID must match a key in the app-templates registry.
   */
  appTemplateId?: string;
  /**
   * User-provided values for the template's env vars.
   * Keys match TemplateEnvVar.key. Values are plaintext — the runner
   * routes secret vars to Secrets Manager before injecting into ECS.
   */
  templateConfig?: Record<string, string>;
}

type Credentials = {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken: string;
};

// ─── Lambda handler ──────────────────────────────────────────────────────────

export const handler = async (event: SQSEvent, context: Context): Promise<void> => {
  for (const record of event.Records) {
    await processRecordSafe(record, context.getRemainingTimeInMillis());
  }
};

/**
 * Wraps processRecord with a Lambda-aware timeout guard.
 * If the deployment is still running when Lambda is 60s from timing out,
 * we mark it "failed" so it doesn't stay stuck at "Deploying" forever.
 *
 * Usage: replace processRecord(record) with processRecordWithTimeout(record, context)
 * when AWS Lambda context (context.getRemainingTimeInMillis) is available.
 */
async function processRecordSafe(record: SQSRecord, remainingMs: number): Promise<void> {
  const job: DeployJob = JSON.parse(record.body);
  const { deploymentId, projectId } = job;

  // Set a safety timer 60s before Lambda would timeout
  const safetyMs = Math.max(remainingMs - 60_000, 0);
  let timedOut = false;

  const timeoutHandle = setTimeout(async () => {
    timedOut = true;
    console.error(`[timeout-guard] Deployment ${deploymentId} approaching Lambda timeout — marking failed`);
    try {
      await appendLog(deploymentId, "error",
        "\n[InfraReady] Deployment exceeded the 15-minute time limit. " +
        "This usually means NAT Gateway creation is taking longer than expected. " +
        "Click \"Deploy Again\" — InfraReady will resume from where it left off."
      );
      await updateDeployment(deploymentId, {
        status:       "failed",
        error:        "Deployment timed out after 14 minutes. Click Deploy Again to resume.",
        completed_at: new Date().toISOString(),
        current_module: null,
      });
      await supabase.from("projects").update({ status: "failed" }).eq("id", projectId);
    } catch (e) {
      console.error("[timeout-guard] Failed to update status:", e);
    }
  }, safetyMs);

  try {
    await processRecord(record);
  } finally {
    clearTimeout(timeoutHandle);
  }
}

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
      DurationSeconds: 3600, // AWS hard-caps role chaining at 1 hour regardless of MaxSessionDuration
    }));

    credentials = {
      accessKeyId:     assumed.Credentials!.AccessKeyId!,
      secretAccessKey: assumed.Credentials!.SecretAccessKey!,
      sessionToken:    assumed.Credentials!.SessionToken!,
    };

    await appendLog(deploymentId, "success", "[AWS] Role assumed successfully");

    // ── Destroy branch ───────────────────────────────────────────────────────
    if (job.action === "destroy") {
      await destroyAll({ job, credentials, deploymentId });
      return;
    }

    // ── Template branch: resolve modules and inject config from registry ─────
    if (job.appTemplateId) {
      await deployTemplate({
        job,
        credentials,
        deploymentId,
        deployedModules,
        awsAccountId,
        region,
      });
      return; // template path is self-contained — skip rest of standard flow
    }

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

      const moduleConfig = buildModuleConfig(moduleName, job.config, outputs, {
        githubRepoOwner: job.githubRepoOwner,
        githubRepoName:  job.githubRepoName,
      });

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

    // ── Step 4b: Generate GitHub Actions workflow (ECS or Static) ────────────
    const branch           = (job.config.github_branch as string | undefined) ?? job.githubBranch ?? "main";
    const deploymentTarget = (job.config.deployment_target as string | undefined) ?? "ecs";

    let workflowYaml: string | undefined;

    if (deploymentTarget === "static") {
      const staticCfg = staticWorkflowConfigFromOutputs(
        flatOutputs, region, branch,
        job.config.build_command as string | undefined,
        job.config.output_directory as string | undefined,
      );
      if (staticCfg) {
        workflowYaml = generateStaticWorkflow(staticCfg);
        flatOutputs.github_workflow_yaml = workflowYaml;
      }
    } else {
      // ECS deployment
      const workflowCfg = workflowConfigFromOutputs(flatOutputs, awsAccountId, region, branch);
      if (workflowCfg) {
        workflowYaml = generateGitHubWorkflow(workflowCfg);
        flatOutputs.github_workflow_yaml = workflowYaml;
      }
    }

    // Auto-push to repo if GitHub App is connected
    const appId      = process.env.GITHUB_DEPLOY_APP_ID;
    const privateKey = process.env.GITHUB_DEPLOY_APP_PRIVATE_KEY?.replace(/\\n/g, "\n");
    const owner      = job.githubRepoOwner;
    const repo       = job.githubRepoName;
    const installId  = job.githubInstallationId;

    if (workflowYaml && appId && privateKey && owner && repo && installId) {
      try {
        await appendLog(deploymentId, "info", "\n[GitHub] Pushing deploy workflow to your repo...");

        // Get one token — reuse it for all file pushes
        const ghToken = await getInstallationToken(appId, privateKey, installId);

        const workflowUrl = await pushRepoFile({
          token:         ghToken,
          owner,
          repo,
          filePath:      ".github/workflows/deploy.yml",
          content:       workflowYaml,
          commitMessage: "chore: add/update InfraReady deploy workflow",
        });
        flatOutputs.github_workflow_url = workflowUrl;
        await appendLog(deploymentId, "success",
          `[GitHub] deploy.yml pushed: ${workflowUrl}\n` +
          `[GitHub] Every push to ${branch} will now build + deploy your app automatically.`
        );

        // For ECS deployments: also push a generated Dockerfile if the repo has none
        if (deploymentTarget === "ecs") {
          const appTypeId = job.config.app_type as string | undefined;
          const handler   = appTypeId ? getHandlerById(appTypeId) : undefined;
          if (handler?.generateDockerfile) {
            try {
              const dockerfileContent = handler.generateDockerfile();
              // Only push if Dockerfile doesn't already exist
              const dockerfileUrl = await pushRepoFile({
                token:         ghToken,
                owner,
                repo,
                filePath:      "Dockerfile",
                content:       dockerfileContent,
                commitMessage: `chore: add InfraReady-generated Dockerfile for ${handler.label}`,
              });
              flatOutputs.github_dockerfile_url = dockerfileUrl;
              await appendLog(deploymentId, "success",
                `[GitHub] Dockerfile pushed: ${dockerfileUrl}`
              );
            } catch {
              // Dockerfile likely already exists — not an error
            }
          }
        }

      } catch (ghErr) {
        // Non-fatal — infra is deployed, just warn
        await appendLog(deploymentId, "warn",
          `[GitHub] Could not auto-push deploy.yml: ${(ghErr as Error).message}\n` +
          `[GitHub] Copy the workflow from the outputs tab and add it manually.`
        );
      }
    } else if (workflowYaml) {
      await appendLog(deploymentId, "success",
        "[InfraReady] GitHub Actions deploy workflow generated — copy from outputs tab and add to .github/workflows/deploy.yml"
      );
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

// ─── Pre-destroy ECS cleanup ──────────────────────────────────────────────────
// Before tofu destroy runs on the ECS module, we must:
// 1. Disable ALB deletion protection (aws_lb has enable_deletion_protection=true by default)
// 2. Stop all ECS tasks so their ENIs are released before subnet deletion
// Without this, tofu destroy hangs indefinitely on subnet/IGW because attached ENIs block deletion.

async function preDestroyEcs(params: {
  projectName: string;
  environment: string;
  region: string;
  credentials: Credentials;
  deploymentId: string;
}): Promise<void> {
  const { projectName, environment, region, credentials, deploymentId } = params;
  // Matches local.name in ecs/main.tf: "${var.project_name}-${var.environment}"
  const localName = `${projectName}-${environment}`;
  const clientConfig = {
    region,
    credentials: {
      accessKeyId:     credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      sessionToken:    credentials.sessionToken,
    },
  };
  const elbv2 = new ElasticLoadBalancingV2Client(clientConfig);
  const ecs   = new ECSClient(clientConfig);

  // 1. Disable deletion protection on all ALBs for this project
  // ALB name = "${local.name}-alb" = "${projectName}-${environment}-alb"
  try {
    const lbs = await elbv2.send(new DescribeLoadBalancersCommand({}));
    const projectAlbs = (lbs.LoadBalancers ?? []).filter((lb) =>
      lb.LoadBalancerName?.startsWith(localName)
    );
    for (const lb of projectAlbs) {
      if (!lb.LoadBalancerArn) continue;
      await elbv2.send(new ModifyLoadBalancerAttributesCommand({
        LoadBalancerArn: lb.LoadBalancerArn,
        Attributes: [{ Key: "deletion_protection.enabled", Value: "false" }],
      }));
      await appendLog(deploymentId, "info", `[InfraReady] ALB deletion protection disabled: ${lb.LoadBalancerName}`);
    }
  } catch (err) {
    await appendLog(deploymentId, "warn", `[InfraReady] ALB cleanup warning (non-fatal): ${(err as Error).message}`);
  }

  // 2. Scale ECS service to 0 and stop all running tasks so ENIs are released
  // Cluster name = "${local.name}-cluster" = "${projectName}-${environment}-cluster"
  try {
    const clusterName = `${localName}-cluster`;
    const servicesRes = await ecs.send(new ListServicesCommand({ cluster: clusterName }));
    for (const serviceArn of servicesRes.serviceArns ?? []) {
      await ecs.send(new UpdateServiceCommand({
        cluster:      clusterName,
        service:      serviceArn,
        desiredCount: 0,
      }));
    }
    // Stop any still-running tasks
    const tasksRes = await ecs.send(new ListTasksCommand({ cluster: clusterName }));
    for (const taskArn of tasksRes.taskArns ?? []) {
      await ecs.send(new StopTaskCommand({ cluster: clusterName, task: taskArn, reason: "InfraReady destroy" }));
    }
    await appendLog(deploymentId, "info", `[InfraReady] ECS tasks stopped — waiting 15s for ENIs to release`);
    await new Promise((r) => setTimeout(r, 15_000));
  } catch (err) {
    await appendLog(deploymentId, "warn", `[InfraReady] ECS drain warning (non-fatal): ${(err as Error).message}`);
  }
}

// ─── Destroy all modules ─────────────────────────────────────────────────────

async function destroyAll(params: {
  job: DeployJob;
  credentials: Credentials;
  deploymentId: string;
}): Promise<void> {
  const { job, credentials, deploymentId } = params;
  const region = (job.config.aws_region as string) ?? "us-east-1";
  const awsAccountId = job.awsRoleArn.split(":")[4];

  // Destroy in reverse order so dependencies are removed cleanly
  const MODULE_DESTROY_ORDER = ["waf", "macie", "inspector-ssm", "backup", "kms", "security", "storage", "ecs", "rds", "vpc-endpoints", "vpc"];
  const toDestroy = MODULE_DESTROY_ORDER.filter((m) => job.modules.includes(m));

  if (toDestroy.length === 0) {
    await appendLog(deploymentId, "warn", "[InfraReady] No modules found to destroy — nothing to do.");
    await updateDeployment(deploymentId, { status: "destroyed", completed_at: new Date().toISOString() });
    await supabase.from("projects").update({ status: "destroyed" }).eq("id", job.projectId);
    return;
  }

  // W2: set status to "destroying" immediately so the UI reflects the in-progress state
  await updateDeployment(deploymentId, { status: "destroying" });

  await appendLog(deploymentId, "info",
    `[InfraReady] Destroying modules in order: ${toDestroy.join(" → ")}`
  );

  for (const moduleName of toDestroy) {
    await appendLog(deploymentId, "info", `\n[OpenTofu] Destroying module: ${moduleName}`);
    await updateDeployment(deploymentId, { current_module: moduleName });

    // Pre-destroy ECS cleanup: disable ALB deletion protection + drain tasks
    // This must happen before tofu destroy or subnet/IGW deletion will hang indefinitely
    if (moduleName === "ecs") {
      const projectName = (job.config.project_name as string) ?? job.projectId.slice(0, 8);
      const environment = (job.config.environment as string) ?? "production";
      await preDestroyEcs({ projectName, environment, region, credentials, deploymentId });
    }

    const moduleConfig = buildModuleConfig(moduleName, job.config, {}, {});

    try {
      await destroyOpenTofu({
        module: moduleName,
        config: moduleConfig,
        credentials,
        deploymentId,
        projectId: job.projectId,
        region,
        awsAccountId,
        onLog: (level, line) => appendLog(deploymentId, level, line),
      });
      await appendLog(deploymentId, "success", `[OpenTofu] Module ${moduleName} destroyed`);
    } catch (err) {
      // Log and continue — best-effort destroy, don't stop on one module failing
      await appendLog(deploymentId, "warn",
        `[InfraReady] ${moduleName} destroy failed (may already be gone): ${(err as Error).message}`
      );
    }
  }

  await updateDeployment(deploymentId, {
    status: "destroyed",
    completed_at: new Date().toISOString(),
    current_module: null,
  });

  await supabase
    .from("projects")
    .update({ status: "destroyed", last_deployed_at: new Date().toISOString() })
    .eq("id", job.projectId);

  await appendLog(deploymentId, "success",
    "\n[InfraReady] All resources destroyed. Your AWS account is clean."
  );
}

// ─── Template deployment ──────────────────────────────────────────────────────

/**
 * Deploys a pre-defined app template.
 *
 * Differences from the standard repo-deploy path:
 * - Modules are determined by the template (vpc + ecs + security, ±rds, ±storage)
 * - Docker image comes from template.dockerImage — no ECR push needed
 * - Secret env vars are routed to Secrets Manager, not plaintext task env
 * - No GitHub workflow is generated (no repo)
 */
async function deployTemplate(params: {
  job: DeployJob;
  credentials: Credentials;
  deploymentId: string;
  deployedModules: string[];
  awsAccountId: string;
  region: string;
}): Promise<void> {
  const { job, credentials, deploymentId, deployedModules, awsAccountId, region } = params;

  // ── Resolve template ───────────────────────────────────────────────────────
  const template = getTemplate(job.appTemplateId!);
  if (!template) {
    const err = `Unknown app template "${job.appTemplateId}". Check the template ID is correct.`;
    await appendLog(deploymentId, "error", `[Template] ${err}`);
    throw new Error(err);
  }

  await appendLog(deploymentId, "info",
    `\n[Template] Deploying ${template.name} from ${template.dockerImage}`
  );
  await appendLog(deploymentId, "info",
    `[Template] Estimated AWS cost: ~$${template.estimatedMonthlyCost}/mo` +
    (template.saasAlternative
      ? ` (vs ${template.saasAlternative} at $${template.saasAlternativeCost}/mo)`
      : "")
  );

  // ── Determine modules ──────────────────────────────────────────────────────
  // Always: vpc, ecs, security.
  // Conditional: rds (if template needs a database), storage (if template needs S3).
  const templateModules: string[] = ["vpc"];
  if (template.requiresDatabase) templateModules.push("rds");
  templateModules.push("ecs");
  if (template.requiresStorage) templateModules.push("storage");
  templateModules.push("security");

  await appendLog(deploymentId, "info",
    `[Template] Modules to deploy: ${templateModules.join(" → ")}`
  );

  // ── Separate secret vs plaintext env vars ─────────────────────────────────
  const providedConfig = job.templateConfig ?? {};
  const secretEnvVars: Record<string, string> = {};
  const plainEnvVars: Record<string, string>  = {};

  for (const envDef of template.envVars) {
    const value = providedConfig[envDef.key] ?? envDef.defaultValue;
    if (value === undefined) continue;
    if (envDef.secret) {
      secretEnvVars[envDef.key] = value;
    } else {
      plainEnvVars[envDef.key] = value;
    }
  }

  // ── Build merged job config for this template ──────────────────────────────
  // We extend job.config so buildModuleConfig can read standard keys (project_name, etc.)
  const templateJobConfig: Record<string, unknown> = {
    ...job.config,
    // ECS module picks these up in buildModuleConfig
    container_port:      template.port,
    container_cpu:       template.cpu,
    container_memory:    template.memory,
    // Signal to the ECS module that this is a template deploy (pre-built image)
    template_docker_image: template.dockerImage,
    // Plain env vars merged for ECS task environment
    template_env_vars:     plainEnvVars,
    // Secret env var keys (values stored in Secrets Manager separately)
    template_secret_keys:  Object.keys(secretEnvVars),
    // deployment_target is always ecs for templates — no static site support
    deployment_target:     "ecs",
    // WordPress needs MySQL — override db_engine
    ...(template.id === "wordpress" ? { db_engine: "mysql" } : {}),
  };

  // ── Security scan ──────────────────────────────────────────────────────────
  await appendLog(deploymentId, "info", "\n[Security] Running compliance scan (SOC2, HIPAA, CIS)...");

  for (const moduleName of templateModules) {
    const generatedHcl = generateConfig({
      type:        moduleName as ModuleType,
      engine:      (templateJobConfig.engine as IaCEngine) ?? "opentofu",
      projectName: templateJobConfig.project_name as string,
      environment: (templateJobConfig.environment as string) ?? "production",
      region,
      roleArn:     job.awsRoleArn,
      externalId:  job.awsExternalId,
      variables:   templateJobConfig,
    });

    const scanResult = await scanHcl({
      hclContent:      generatedHcl.hcl,
      frameworks:      DEFAULT_FRAMEWORKS,
      blockOnSeverity: DEFAULT_BLOCK_ON,
      projectName:     templateJobConfig.project_name as string,
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

  // ── Deploy each module ─────────────────────────────────────────────────────
  const outputs: Record<string, Record<string, unknown>> = {};

  for (const moduleName of templateModules) {
    await appendLog(deploymentId, "info", `\n[OpenTofu] Deploying module: ${moduleName}`);
    await updateDeployment(deploymentId, { current_module: moduleName });

    const moduleConfig = buildModuleConfig(moduleName, templateJobConfig, outputs, {
      githubRepoOwner: undefined, // templates have no repo
      githubRepoName:  undefined,
    });

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

  // ── Save outputs ───────────────────────────────────────────────────────────
  await appendLog(deploymentId, "info", "\n[InfraReady] Saving outputs...");

  const flatOutputs = formatOutputs(outputs);

  // Surface the app URL prominently for templates
  if (flatOutputs.app_url) {
    await appendLog(deploymentId, "success",
      `\n[Template] ${template.name} is live at: ${flatOutputs.app_url}\n` +
      `[Template] It may take 2-3 minutes for the container to start up.`
    );
  }

  // No GitHub workflow for templates — log a note instead
  await appendLog(deploymentId, "info",
    `[Template] This is a managed Docker deployment. InfraReady will pull the latest ` +
    `${template.dockerImage} image when you click "Redeploy".`
  );

  await updateDeployment(deploymentId, {
    status:         "success",
    outputs:        flatOutputs,
    completed_at:   new Date().toISOString(),
    current_module: null,
  });

  await supabase
    .from("projects")
    .update({ status: "success", last_deployed_at: new Date().toISOString() })
    .eq("id", job.projectId);

  await appendLog(deploymentId, "success",
    `\n[InfraReady] ${template.name} deployment complete! Your infrastructure is live.`
  );
}

// ─── Deploy module with retry ─────────────────────────────────────────────────

// Errors that indicate an AWS singleton resource already exists in the account.
// These are NOT transient — retrying the same config will always fail.
// Fix: detect the resource and skip creation on the next attempt.
const OIDC_EXISTS_PATTERN      = "EntityAlreadyExists";
const CONFIG_RECORDER_PATTERN  = "MaxNumberOfConfigurationRecordersExceededException";

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

  // Accumulate skip-flags as we discover existing singleton resources
  let config = { ...moduleConfig };

  const tofuOpts = () => ({
    module: moduleName, config, credentials, deploymentId, projectId, region, awsAccountId,
    onLog: (level: "info" | "success" | "error" | "warn", line: string) => appendLog(deploymentId, level, line),
  });

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await execOpenTofu(tofuOpts());
    } catch (err) {
      lastError = err as Error;
      const msg = lastError.message;

      // ── Singleton-resource conflicts ─────────────────────────────────────
      // These can never succeed by retrying the same config — instead, tell
      // the module to adopt the existing resource rather than create a new one.
      if (moduleName === "security") {
        let patched = false;
        if (msg.includes(OIDC_EXISTS_PATTERN) && config.create_github_oidc_provider !== false) {
          config = { ...config, create_github_oidc_provider: false };
          await appendLog(deploymentId, "info",
            "[InfraReady] GitHub Actions OIDC provider already exists in this AWS account — adopting existing provider."
          );
          patched = true;
        }
        if (msg.includes(CONFIG_RECORDER_PATTERN) && config.create_config_recorder !== false) {
          config = { ...config, create_config_recorder: false };
          await appendLog(deploymentId, "info",
            "[InfraReady] AWS Config recorder already exists in this account — skipping recorder creation."
          );
          patched = true;
        }
        if (patched && attempt < MAX_ATTEMPTS) {
          await appendLog(deploymentId, "info", `[InfraReady] Retrying security with updated config...`);
          continue;
        }
      }

      const errorClass = classifyError(lastError);

      if (errorClass === "fatal") {
        await appendLog(deploymentId, "error",
          `[InfraReady] Fatal error on ${moduleName} — not retrying: ${friendlyError(lastError.message)}`
        );
        // W4: skip cleanup on pure auth failures — no resources were created, and
        // calling destroy would just produce another misleading permission error.
        const isAuthError = lastError.message.includes("AuthFailure") ||
          lastError.message.includes("AccessDenied") ||
          lastError.message.includes("InvalidClientTokenId");
        if (!isAuthError) {
          await cleanupModule(moduleName, tofuOpts(), deploymentId);
        }
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
  await cleanupModule(moduleName, tofuOpts(), deploymentId);
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
  previousOutputs: Record<string, Record<string, unknown>>,
  ctx?: { githubRepoOwner?: string; githubRepoName?: string }
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
        // Default to single NAT gateway for all envs — saves 5+ minutes on deploy and ~$90/mo.
        // Users who need multi-AZ NAT HA can enable via wizard (single_nat=false in config).
        single_nat_gateway: config.single_nat !== false,
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

      const githubRepoSlug = (ctx?.githubRepoOwner && ctx?.githubRepoName)
        ? `${ctx.githubRepoOwner}/${ctx.githubRepoName}` : undefined;
      const deploymentTarget = (config.deployment_target as string | undefined) ?? "ecs";

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
        // GitHub Actions OIDC deploy role — enabled when GitHub App is connected
        enable_github_deploy_role:   !!githubRepoSlug,
        ...(githubRepoSlug ? {
          github_repo_slug:            githubRepoSlug,
          deployment_target:           deploymentTarget,
          ecr_repository_arn:          previousOutputs.ecs?.ecr_repository_arn ?? "",
          s3_bucket_arn:               previousOutputs.storage?.bucket_arn ?? "",
          cloudfront_distribution_arn: previousOutputs.storage?.cloudfront_distribution_arn ?? "",
        } : {}),
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
    out.app_url             = moduleOutputs.ecs.app_url;
    out.ecr_url             = moduleOutputs.ecs.ecr_repository_url;
    out.ecr_repository_arn  = moduleOutputs.ecs.ecr_repository_arn;
    out.cluster_name        = moduleOutputs.ecs.ecs_cluster_name;
    out.service_name        = moduleOutputs.ecs.ecs_service_name;
    out.log_group           = moduleOutputs.ecs.log_group_name;
    out.task_role_arn       = moduleOutputs.ecs.task_role_arn;
    out.execution_role_arn  = moduleOutputs.ecs.execution_role_arn;
  }

  if (moduleOutputs.storage) {
    out.cdn_url                    = moduleOutputs.storage.cdn_url;
    out.bucket_name                = moduleOutputs.storage.bucket_name;
    out.bucket_arn                 = moduleOutputs.storage.bucket_arn;
    out.cloudfront_distribution_id = moduleOutputs.storage.cloudfront_distribution_id;
    out.cloudfront_distribution_arn = moduleOutputs.storage.cloudfront_distribution_arn;
  }

  if (moduleOutputs.security) {
    out.alerts_topic_arn         = moduleOutputs.security.alerts_topic_arn;
    out.github_deploy_role_arn   = moduleOutputs.security.github_deploy_role_arn;
    out.github_oidc_provider_arn = moduleOutputs.security.github_oidc_provider_arn;
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
