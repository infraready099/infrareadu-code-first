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
import {
  EC2Client,
  DescribeVpcsCommand,
  DescribeAddressesCommand,
  DescribeSubnetsCommand,
  DescribeInternetGatewaysCommand,
  DescribeFlowLogsCommand,
} from "@aws-sdk/client-ec2";
import { ElasticLoadBalancingV2Client, DescribeTargetGroupsCommand } from "@aws-sdk/client-elastic-load-balancing-v2";
import {
  SecretsManagerClient,
  DescribeSecretCommand,
  DeleteSecretCommand,
} from "@aws-sdk/client-secrets-manager";

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
  // Include account ID so each customer gets their own state bucket (S3 names are globally unique)
  const accountSegment = awsAccountId ?? String(config.project_name);
  const stateBucket = `infraready-state-${accountSegment}-${region}`;
  // Use projectId (UUID) as the state key — NOT project_name.
  // project_name is mutable and non-unique: if a project is deleted and recreated
  // with the same name, it would otherwise share state with the old project, causing
  // orphaned resource conflicts and confusing "different project information" errors.
  writeFileSync(backendConfigPath, `bucket  = "${stateBucket}"\nkey     = "${projectId}/${module}/terraform.tfstate"\nregion  = "${region}"\nencrypt = true\n`);

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
  await runTofu(["plan", "-compact-warnings", `-var-file=${tfvarsPath}`, `-out=${planPath}`], workDir, env, onLog);

  // tofu apply
  await onLog("info", `[tofu] Applying ${module}...`);
  await runTofu(["apply", "-compact-warnings", "-auto-approve", planPath], workDir, env, onLog);

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
  const region = env.AWS_DEFAULT_REGION ?? (config.region as string) ?? "us-east-1";

  // For the VPC module: look up the VPC by Name tag so we can import it even if state was lost.
  // This prevents VpcLimitExceeded on retries — existing VPC is reconciled rather than recreated.
  if (module === "vpc") {
    try {
      const ec2 = new EC2Client({
        region,
        credentials: {
          accessKeyId: env.AWS_ACCESS_KEY_ID!,
          secretAccessKey: env.AWS_SECRET_ACCESS_KEY!,
          sessionToken: env.AWS_SESSION_TOKEN,
        },
      });
      const result = await ec2.send(new DescribeVpcsCommand({
        Filters: [{ Name: "tag:Name", Values: [`${name}-vpc`] }],
      }));
      const vpcId = result.Vpcs?.[0]?.VpcId;
      if (vpcId) {
        const tfvarsPath = join(workDir, "terraform.tfvars.json");

        // VPC
        try {
          await execFileAsync(OPENTOFU_BINARY, ["import", `-var-file=${tfvarsPath}`, "aws_vpc.this", vpcId], { cwd: workDir, env });
          await onLog("info", `[tofu] Imported existing VPC ${vpcId} into state`);
        } catch { /* already in state */ }

        // Subnets — look up by VPC ID, then match by CIDR to terraform address
        try {
          const subnetResult = await ec2.send(new DescribeSubnetsCommand({
            Filters: [{ Name: "vpc-id", Values: [vpcId] }],
          }));
          const subnets = subnetResult.Subnets ?? [];

          const publicCidrs  = ["10.0.0.0/20", "10.0.16.0/20"];
          const privateCidrs = ["10.0.128.0/20", "10.0.144.0/20"];

          for (let i = 0; i < publicCidrs.length; i++) {
            const subnet = subnets.find((s) => s.CidrBlock === publicCidrs[i]);
            if (!subnet?.SubnetId) continue;
            try {
              await execFileAsync(OPENTOFU_BINARY, ["import", `-var-file=${tfvarsPath}`, `aws_subnet.public[${i}]`, subnet.SubnetId], { cwd: workDir, env });
              await onLog("info", `[tofu] Imported existing subnet ${subnet.SubnetId} as public[${i}]`);
            } catch { /* already in state */ }
          }
          for (let i = 0; i < privateCidrs.length; i++) {
            const subnet = subnets.find((s) => s.CidrBlock === privateCidrs[i]);
            if (!subnet?.SubnetId) continue;
            try {
              await execFileAsync(OPENTOFU_BINARY, ["import", `-var-file=${tfvarsPath}`, `aws_subnet.private[${i}]`, subnet.SubnetId], { cwd: workDir, env });
              await onLog("info", `[tofu] Imported existing subnet ${subnet.SubnetId} as private[${i}]`);
            } catch { /* already in state */ }
          }
        } catch { /* subnet lookup failed — proceed */ }

        // Internet Gateway
        try {
          const igwResult = await ec2.send(new DescribeInternetGatewaysCommand({
            Filters: [{ Name: "attachment.vpc-id", Values: [vpcId] }],
          }));
          const igwId = igwResult.InternetGateways?.[0]?.InternetGatewayId;
          if (igwId) {
            try {
              await execFileAsync(OPENTOFU_BINARY, ["import", `-var-file=${tfvarsPath}`, "aws_internet_gateway.this", igwId], { cwd: workDir, env });
              await onLog("info", `[tofu] Imported existing IGW ${igwId} into state`);
            } catch { /* already in state */ }
          }
        } catch { /* IGW lookup failed — proceed */ }

        // Flow Log
        try {
          const flResult = await ec2.send(new DescribeFlowLogsCommand({
            Filter: [{ Name: "resource-id", Values: [vpcId] }],
          }));
          const flowLogId = flResult.FlowLogs?.[0]?.FlowLogId;
          if (flowLogId) {
            try {
              await execFileAsync(OPENTOFU_BINARY, ["import", `-var-file=${tfvarsPath}`, "aws_flow_log.this[0]", flowLogId], { cwd: workDir, env });
              await onLog("info", `[tofu] Imported existing flow log ${flowLogId} into state`);
            } catch { /* already in state */ }
          }
        } catch { /* flow log lookup failed — proceed */ }
      }

      // Import existing EIPs for NAT gateways (tagged with the project name)
      const eipResult = await ec2.send(new DescribeAddressesCommand({
        Filters: [{ Name: "tag:Project", Values: [String(config.project_name)] }],
      }));
      const eips = eipResult.Addresses ?? [];
      for (let i = 0; i < eips.length; i++) {
        const allocationId = eips[i].AllocationId;
        if (!allocationId) continue;
        const tfvarsPath = join(workDir, "terraform.tfvars.json");
        try {
          await execFileAsync(OPENTOFU_BINARY, ["import", `-var-file=${tfvarsPath}`, `aws_eip.nat[${i}]`, allocationId], { cwd: workDir, env });
          await onLog("info", `[tofu] Imported existing EIP ${allocationId} as nat[${i}]`);
        } catch { /* already in state */ }
      }
    } catch {
      // EC2 lookup failed (permissions, network) — proceed without import
    }
  }

  // For the RDS module: if the Secrets Manager secret is pending deletion,
  // force-delete it so the apply can recreate it cleanly.
  // This happens on retries when a previous attempt created and then failed to delete the secret.
  if (module === "rds") {
    try {
      const secretName = `infraready/${name}/rds-credentials`;
      const sm = new SecretsManagerClient({
        region,
        credentials: {
          accessKeyId: env.AWS_ACCESS_KEY_ID!,
          secretAccessKey: env.AWS_SECRET_ACCESS_KEY!,
          sessionToken: env.AWS_SESSION_TOKEN,
        },
      });
      const desc = await sm.send(new DescribeSecretCommand({ SecretId: secretName }));
      if (desc.DeletedDate) {
        // Secret is pending deletion — force-delete it so tofu can recreate it
        await sm.send(new DeleteSecretCommand({
          SecretId: secretName,
          ForceDeleteWithoutRecovery: true,
        }));
        await onLog("info", `[tofu] Force-deleted pending-deletion secret: ${secretName}`);
      }
    } catch {
      // Secret doesn't exist or already gone — fine
    }
  }

  // Look up ELB Target Group ARN by name so we can import it
  let tgArn = "";
  if (module === "ecs") {
    try {
      const elb = new ElasticLoadBalancingV2Client({
        region,
        credentials: {
          accessKeyId: env.AWS_ACCESS_KEY_ID!,
          secretAccessKey: env.AWS_SECRET_ACCESS_KEY!,
          sessionToken: env.AWS_SESSION_TOKEN,
        },
      });
      const tgResult = await elb.send(new DescribeTargetGroupsCommand({ Names: [`${name}-tg`] }));
      tgArn = tgResult.TargetGroups?.[0]?.TargetGroupArn ?? "";
    } catch {
      // TG doesn't exist yet — fine
    }
  }

  // Map of module → [ [resource_address, resource_id], ... ]
  const imports: Record<string, [string, string][]> = {
    vpc: [
      ["aws_cloudwatch_log_group.flow_logs[0]", `/infraready/${name}/vpc-flow-logs`],
      ["aws_iam_role.flow_logs[0]",             `${name}-vpc-flow-logs-role`],
    ],
    ecs: [
      ["aws_cloudwatch_log_group.app",    `/infraready/${name}/ecs`],
      ["aws_iam_role.ecs_task",           `${name}-ecs-task-role`],
      ["aws_iam_role.ecs_execution",      `${name}-ecs-execution-role`],
      ["aws_s3_bucket.alb_logs",          `${name}-alb-logs-${accountId}`],
      ...(tgArn ? [["aws_lb_target_group.app", tgArn] as [string, string]] : []),
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

    const errorLines: string[] = [];

    child.stdout.on("data", async (data: Buffer) => {
      const lines = data.toString().split("\n").filter(Boolean);
      for (const line of lines) {
        const level = line.includes("Error") ? "error"
          : line.includes("Warning") ? "warn"
          : line.startsWith("Apply complete") || line.includes("created") ? "success"
          : "info";
        if (level === "error") errorLines.push(line);
        await onLog(level, line);
      }
    });

    child.stderr.on("data", async (data: Buffer) => {
      const lines = data.toString().split("\n").filter(Boolean);
      for (const line of lines) {
        errorLines.push(line);
        await onLog("error", line);
      }
    });

    child.on("close", (code: number) => {
      if (code === 0) resolve();
      else {
        // Include the last error lines in the message so callers can classify the error
        const detail = errorLines.slice(-10).join(" ").trim();
        const msg = detail
          ? `OpenTofu exited with code ${code}: ${detail}`
          : `OpenTofu exited with code ${code}`;
        reject(new Error(msg));
      }
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
        CreateBucketConfiguration: { LocationConstraint: region as import("@aws-sdk/client-s3").BucketLocationConstraint }
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
