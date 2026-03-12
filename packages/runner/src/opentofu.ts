/**
 * OpenTofu executor — runs tofu init + plan + apply inside Lambda
 * OpenTofu binary is bundled in the Lambda container image
 */

import { execFile } from "child_process";
import { promisify } from "util";
import { writeFileSync, mkdirSync, cpSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { S3Client } from "@aws-sdk/client-s3";

const execFileAsync = promisify(execFile);

type LogLevel = "info" | "success" | "error" | "warn";

interface OpenTofuOptions {
  module: string;
  config: Record<string, unknown>;
  credentials: {
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken: string;
  };
  deploymentId: string;
  projectId: string;
  region: string;
  awsAccountId?: string;
  onLog: (level: LogLevel, line: string) => Promise<void>;
}

const OPENTOFU_BINARY = process.env.OPENTOFU_PATH ?? "/opt/opentofu/tofu";
const MODULES_PATH = process.env.MODULES_PATH ?? "/var/task/modules";

function buildWorkDir(
  module: string,
  config: Record<string, unknown>,
  credentials: OpenTofuOptions["credentials"],
  projectId: string,
  region: string,
  awsAccountId?: string
): { workDir: string; tfvarsPath: string; backendConfigPath: string; stateBucket: string; env: Record<string, string | undefined> } {
  const workDir = join(tmpdir(), `infraready-${module}-${Date.now()}`);
  mkdirSync(workDir, { recursive: true });

  const tfvarsPath = join(workDir, "terraform.tfvars.json");
  writeFileSync(tfvarsPath, JSON.stringify(config, null, 2));

  const backendConfigPath = join(workDir, "backend.hcl");
  const stateBucket = `infraready-state-${config.project_name}-${region}`;
  writeFileSync(backendConfigPath, `bucket  = "${stateBucket}"\nkey     = "${module}/terraform.tfstate"\nregion  = "${region}"\nencrypt = true\n`);

  const providerCacheDir = join(tmpdir(), `infraready-providers-${projectId}`);
  mkdirSync(providerCacheDir, { recursive: true });

  const moduleSource = join(MODULES_PATH, module);
  cpSync(moduleSource, workDir, { recursive: true });

  const env: Record<string, string | undefined> = {
    ...process.env,
    AWS_ACCESS_KEY_ID: credentials.accessKeyId,
    AWS_SECRET_ACCESS_KEY: credentials.secretAccessKey,
    AWS_SESSION_TOKEN: credentials.sessionToken,
    AWS_DEFAULT_REGION: region,
    TF_IN_AUTOMATION: "1",
    TF_INPUT: "0",
    TF_CLI_ARGS: "-no-color",
    TF_PLUGIN_CACHE_DIR: providerCacheDir,
    TF_PLUGIN_CACHE_MAY_BREAK_DEPENDENCY_LOCK_FILE: "1",
    ...(awsAccountId && { AWS_ACCOUNT_ID: awsAccountId }),
  };

  return { workDir, tfvarsPath, backendConfigPath, stateBucket, env };
}

export async function destroyOpenTofu(opts: OpenTofuOptions): Promise<void> {
  const { module, config, credentials, projectId, region, awsAccountId, onLog } = opts;

  const { workDir, tfvarsPath, backendConfigPath, stateBucket, env } = buildWorkDir(
    module, config, credentials, projectId, region, awsAccountId
  );

  await ensureStateBucket(stateBucket, region, credentials);

  await onLog("info", `[tofu] Initializing ${module} for destroy...`);
  await runTofu(["init", `-backend-config=${backendConfigPath}`, "-reconfigure"], workDir, env, onLog);

  await onLog("info", `[tofu] Destroying ${module}...`);
  await runTofu(["destroy", "-auto-approve", `-var-file=${tfvarsPath}`], workDir, env, onLog);
}

export async function execOpenTofu(opts: OpenTofuOptions): Promise<Record<string, unknown>> {
  const { module, config, credentials, projectId, region, awsAccountId, onLog } = opts;

  const { workDir, tfvarsPath, backendConfigPath, stateBucket, env } = buildWorkDir(
    module, config, credentials, projectId, region, awsAccountId
  );

  await ensureStateBucket(stateBucket, region, credentials);

  // tofu init
  await onLog("info", `[tofu] Initializing module ${module}...`);
  await runTofu(["init", `-backend-config=${backendConfigPath}`, "-reconfigure"], workDir, env, onLog);

  // Pre-flight import: pull any orphaned resources into state so apply doesn't fail with "already exists"
  await tryImportOrphans(module, config, workDir, env, onLog);

  // tofu plan
  await onLog("info", `[tofu] Planning ${module}...`);
  const planPath = join(workDir, "plan.out");
  await runTofu(["plan", `-var-file=${tfvarsPath}`, `-out=${planPath}`], workDir, env, onLog);

  // tofu apply
  await onLog("info", `[tofu] Applying ${module}...`);
  await runTofu(["apply", "-auto-approve", planPath], workDir, env, onLog);

  // tofu output — get the outputs as JSON
  const { stdout } = await execFileAsync(OPENTOFU_BINARY, ["output", "-json"], {
    cwd: workDir,
    env,
  });

  // Parse outputs — OpenTofu outputs are { key: { value: ..., type: ... } }
  const rawOutputs = JSON.parse(stdout) as Record<string, { value: unknown }>;
  return Object.fromEntries(
    Object.entries(rawOutputs).map(([k, v]) => [k, v.value])
  );
}

/**
 * Attempt to import resources that are known to be orphan-prone (created mid-apply, never in state).
 * Failures are silently ignored — if the resource doesn't exist in AWS, that's fine.
 * If it does exist and is imported, the subsequent plan/apply will reconcile it without error.
 */
async function tryImportOrphans(
  module: string,
  config: Record<string, unknown>,
  workDir: string,
  env: Record<string, string | undefined>,
  onLog: (level: LogLevel, line: string) => Promise<void>
): Promise<void> {
  const name = `${config.project_name}-${config.environment ?? "production"}`;
  const accountId = env.AWS_ACCOUNT_ID ?? "";

  // Map of module → [ [resource_address, resource_id], ... ]
  const imports: Record<string, [string, string][]> = {
    vpc: [
      ["aws_cloudwatch_log_group.flow_logs[0]", `/infraready/${name}/vpc-flow-logs`],
      ["aws_iam_role.flow_logs[0]",             `${name}-vpc-flow-logs-role`],
    ],
    ecs: [
      ["aws_cloudwatch_log_group.app",    `/infraready/${name}/app`],
      ["aws_iam_role.ecs_task",           `${name}-ecs-task-role`],
      ["aws_iam_role.ecs_execution",      `${name}-ecs-execution-role`],
      ["aws_s3_bucket.alb_logs",          `${name}-alb-logs-${accountId}`],
    ],
    rds: [
      ["aws_cloudwatch_log_group.rds",    `/infraready/${name}/rds`],
    ],
    kms: [
      // KMS keys can't be imported without ARN — skip
    ],
  };

  const toImport = imports[module] ?? [];
  for (const [address, id] of toImport) {
    if (!id || id.endsWith("-")) continue; // skip if ID couldn't be computed
    try {
      const tfvarsPath = join(workDir, "terraform.tfvars.json");
      await execFileAsync(OPENTOFU_BINARY, ["import", `-var-file=${tfvarsPath}`, address, id], { cwd: workDir, env });
      await onLog("info", `[tofu] Imported existing resource: ${address}`);
    } catch {
      // Resource doesn't exist in AWS or already in state — both are fine
    }
  }
}

async function runTofu(
  args: string[],
  cwd: string,
  env: Record<string, string | undefined>,
  onLog: (level: LogLevel, line: string) => Promise<void>
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = require("child_process").spawn(OPENTOFU_BINARY, args, {
      cwd,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    child.stdout.on("data", async (data: Buffer) => {
      const lines = data.toString().split("\n").filter(Boolean);
      for (const line of lines) {
        const level = line.includes("Error") ? "error"
          : line.includes("Warning") ? "warn"
          : line.startsWith("Apply complete") || line.includes("created") ? "success"
          : "info";
        await onLog(level, line);
      }
    });

    child.stderr.on("data", async (data: Buffer) => {
      const lines = data.toString().split("\n").filter(Boolean);
      for (const line of lines) {
        await onLog("error", line);
      }
    });

    child.on("close", (code: number) => {
      if (code === 0) resolve();
      else reject(new Error(`OpenTofu exited with code ${code}`));
    });
  });
}

async function ensureStateBucket(
  bucketName: string,
  region: string,
  credentials: { accessKeyId: string; secretAccessKey: string; sessionToken: string }
) {
  const s3 = new S3Client({
    region,
    credentials,
  });

  try {
    // Try to create the bucket (idempotent — fails silently if exists)
    const { CreateBucketCommand, BucketAlreadyOwnedByYou } = await import("@aws-sdk/client-s3");

    await s3.send(new CreateBucketCommand({
      Bucket: bucketName,
      ...(region !== "us-east-1" && {
        CreateBucketConfiguration: { LocationConstraint: region as "us-east-1" }
      }),
    }));

    // Enable versioning and encryption on the state bucket
    const { PutBucketVersioningCommand, PutBucketEncryptionCommand, PutPublicAccessBlockCommand } = await import("@aws-sdk/client-s3");

    await Promise.all([
      s3.send(new PutBucketVersioningCommand({
        Bucket: bucketName,
        VersioningConfiguration: { Status: "Enabled" },
      })),
      s3.send(new PutBucketEncryptionCommand({
        Bucket: bucketName,
        ServerSideEncryptionConfiguration: {
          Rules: [{ ApplyServerSideEncryptionByDefault: { SSEAlgorithm: "AES256" } }],
        },
      })),
      s3.send(new PutPublicAccessBlockCommand({
        Bucket: bucketName,
        PublicAccessBlockConfiguration: {
          BlockPublicAcls: true,
          BlockPublicPolicy: true,
          IgnorePublicAcls: true,
          RestrictPublicBuckets: true,
        },
      })),
    ]);
  } catch (err: unknown) {
    // BucketAlreadyOwnedByYou is fine — bucket exists and we own it
    if ((err as { name?: string }).name !== "BucketAlreadyOwnedByYou") {
      // Other errors might indicate permission issues
      console.warn("State bucket setup warning:", err);
    }
  }
}
