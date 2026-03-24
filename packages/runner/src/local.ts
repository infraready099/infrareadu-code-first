/**
 * Local runner — runs a deployment directly without Lambda/SQS.
 *
 * Usage:
 *   bun run local <deploymentId>
 *
 * Requires packages/runner/.env with:
 *   SUPABASE_URL=...
 *   SUPABASE_SERVICE_ROLE_KEY=...
 *
 * AWS credentials come from your local AWS CLI (~/.aws/credentials).
 * Make sure `aws sts get-caller-identity` works before running.
 */

import { config } from "dotenv";
import { resolve } from "path";
import { handler } from "./index";
import { createClient } from "@supabase/supabase-js";
import type { SQSEvent, Context } from "aws-lambda";

// Load .env from the runner package directory
config({ path: resolve(__dirname, "../.env") });

const deploymentId = process.argv[2];
if (!deploymentId) {
  console.error("Usage: bun run local <deploymentId>");
  process.exit(1);
}

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function run() {
  // Fetch deployment + project from Supabase
  const { data: deployment, error: depErr } = await supabase
    .from("deployments")
    .select("*")
    .eq("id", deploymentId)
    .single();

  if (depErr || !deployment) {
    console.error("Deployment not found:", depErr?.message);
    process.exit(1);
  }

  const { data: project, error: projErr } = await supabase
    .from("projects")
    .select("*")
    .eq("id", deployment.project_id)
    .single();

  if (projErr || !project) {
    console.error("Project not found:", projErr?.message);
    process.exit(1);
  }

  // Build the job payload (same shape as what the deploy API puts on SQS)
  let githubRepoOwner: string | undefined;
  let githubRepoName: string | undefined;
  if (project.repo_url) {
    try {
      const parts = new URL(project.repo_url).pathname.replace(/^\//, "").split("/");
      if (parts.length >= 2) {
        githubRepoOwner = parts[0];
        githubRepoName  = parts[1].replace(/\.git$/, "");
      }
    } catch { /* invalid URL */ }
  }

  const jobPayload = {
    action:               deployment.action ?? "deploy",
    deploymentId:         deployment.id,
    projectId:            project.id,
    userId:               deployment.user_id,
    modules:              deployment.modules,
    config: {
      ...deployment.config,
      project_name: project.name.toLowerCase().replace(/[^a-z0-9-]/g, "-"),
      aws_region:   project.aws_region ?? deployment.config?.aws_region ?? "us-east-1",
    },
    awsRoleArn:           project.aws_role_arn,
    awsExternalId:        project.aws_external_id,
    githubRepoOwner,
    githubRepoName,
    githubInstallationId: project.github_installation_id ?? undefined,
    ...(project.app_template_id ? {
      appTemplateId:  project.app_template_id,
      templateConfig: (project.template_config ?? {}) as Record<string, string>,
    } : {}),
  };

  console.log(`\n[local] Running ${jobPayload.action} for deployment ${deploymentId}`);
  console.log(`[local] Project: ${project.name} (${project.aws_region})`);
  console.log(`[local] Modules: ${jobPayload.modules.join(", ")}\n`);

  // Wrap in a fake SQS event
  const fakeEvent: SQSEvent = {
    Records: [{
      messageId:     deploymentId,
      receiptHandle: "local",
      body:          JSON.stringify(jobPayload),
      attributes: {
        ApproximateReceiveCount:          "1",
        SentTimestamp:                    Date.now().toString(),
        SenderId:                         "local",
        ApproximateFirstReceiveTimestamp: Date.now().toString(),
      },
      messageAttributes: {},
      md5OfBody:     "",
      eventSource:   "aws:sqs",
      eventSourceARN: "local",
      awsRegion:     "us-east-1",
    }],
  };

  // Fake Lambda context — 10 min timeout
  const fakeContext: Context = {
    callbackWaitsForEmptyEventLoop: false,
    functionName:    "infraready-runner-local",
    functionVersion: "$LATEST",
    invokedFunctionArn: "local",
    memoryLimitInMB: "1024",
    awsRequestId:    "local",
    logGroupName:    "/local/runner",
    logStreamName:   "local",
    getRemainingTimeInMillis: () => 600_000,
    done:     () => {},
    fail:     () => {},
    succeed:  () => {},
  };

  await handler(fakeEvent, fakeContext);
  console.log("\n[local] Done.");
}

run().catch((err) => {
  console.error("[local] Fatal:", err);
  process.exit(1);
});
