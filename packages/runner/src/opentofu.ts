/**
 * OpenTofu executor — runs tofu init + plan + apply inside Lambda
 * OpenTofu binary is bundled in the Lambda container image
 */

import { execFile } from "child_process";
import { promisify } from "util";
import { writeFileSync, mkdirSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";

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
  onLog: (level: LogLevel, line: string) => Promise<void>;
}

const OPENTOFU_BINARY = process.env.OPENTOFU_PATH ?? "/opt/opentofu/tofu";
const MODULES_PATH = process.env.MODULES_PATH ?? "/var/task/modules";

export async function execOpenTofu(opts: OpenTofuOptions): Promise<Record<string, unknown>> {
  const { module, config, credentials, projectId, region, onLog } = opts;

  // Create isolated working directory
  const workDir = join(tmpdir(), `infraready-${module}-${Date.now()}`);
  mkdirSync(workDir, { recursive: true });

  // Write terraform.tfvars.json with module config
  const tfvarsPath = join(workDir, "terraform.tfvars.json");
  writeFileSync(tfvarsPath, JSON.stringify(config, null, 2));

  // Write backend config — state in customer's own S3 bucket
  const backendConfigPath = join(workDir, "backend.tf");
  const stateBucket = `infraready-state-${config.project_name}-${region}`;
  writeFileSync(backendConfigPath, `
terraform {
  backend "s3" {
    bucket  = "${stateBucket}"
    key     = "${module}/terraform.tfstate"
    region  = "${region}"
    encrypt = true
  }
}
`);

  // Environment with customer's temporary credentials
  const env = {
    ...process.env,
    AWS_ACCESS_KEY_ID: credentials.accessKeyId,
    AWS_SECRET_ACCESS_KEY: credentials.secretAccessKey,
    AWS_SESSION_TOKEN: credentials.sessionToken,
    AWS_DEFAULT_REGION: region,
    TF_IN_AUTOMATION: "1",
    TF_INPUT: "0",
    TF_CLI_ARGS: "-no-color",
  };

  const moduleSource = join(MODULES_PATH, module);

  // Ensure state bucket exists in customer's account
  await ensureStateBucket(stateBucket, region, credentials);

  // tofu init
  await onLog("info", `[tofu] Initializing module ${module}...`);
  await runTofu(["init", "-backend-config", backendConfigPath, "-reconfigure", moduleSource], workDir, env, onLog);

  // tofu plan
  await onLog("info", `[tofu] Planning ${module}...`);
  const planPath = join(workDir, "plan.out");
  await runTofu(["plan", "-var-file", tfvarsPath, "-out", planPath, moduleSource], workDir, env, onLog);

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
