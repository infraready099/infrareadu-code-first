import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import { createHmac, timingSafeEqual } from "crypto";

/**
 * POST /api/github/webhook
 *
 * Receives push events from GitHub and triggers a deployment.
 *
 * Security:
 *   - Signature verified with HMAC-SHA256 using GITHUB_WEBHOOK_SECRET
 *   - Uses timingSafeEqual to prevent timing attacks on the comparison
 *   - Service-role Supabase client (bypasses RLS) — only used server-side
 *
 * Required env vars:
 *   GITHUB_WEBHOOK_SECRET    — secret set in the GitHub App webhook config
 *   SUPABASE_URL             — Supabase project URL (server-side, not NEXT_PUBLIC_)
 *   SUPABASE_SERVICE_ROLE_KEY — service role key for server-side writes
 *   DEPLOY_QUEUE_URL         — SQS FIFO queue URL for deployment jobs
 */

// Use service role — this route is not user-authenticated, it's GitHub-authenticated.
// Service role bypasses RLS, which is correct here since no user session exists.
const supabase = createClient(
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const sqs = new SQSClient({ region: process.env.AWS_REGION ?? "us-east-1" });

// ─── Signature verification ───────────────────────────────────────────────────

function verifyWebhookSignature(
  rawBody: Buffer,
  signatureHeader: string | null,
  secret: string
): boolean {
  if (!signatureHeader) return false;

  // GitHub sends: "sha256=<hex-digest>"
  const prefix = "sha256=";
  if (!signatureHeader.startsWith(prefix)) return false;

  const receivedHex = signatureHeader.slice(prefix.length);
  const expectedHex = createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");

  // Both buffers must be the same length for timingSafeEqual
  try {
    return timingSafeEqual(
      Buffer.from(receivedHex, "hex"),
      Buffer.from(expectedHex, "hex")
    );
  } catch {
    // Buffer length mismatch — invalid hex or tampered header
    return false;
  }
}

// ─── Local types ──────────────────────────────────────────────────────────────

/**
 * Shape of the project row we select in the webhook handler.
 * Explicit interface avoids depending on generated Supabase types that may not
 * yet include the github_* columns added by the 20260310 migration.
 */
interface ProjectRow {
  id: string;
  user_id: string;
  name: string;
  aws_role_arn: string | null;
  aws_external_id: string;
  aws_region: string | null;
  aws_account_id: string | null;
  github_branch: string | null;
  github_repo_owner: string | null;
  github_repo_name: string | null;
  status: string;
}

// ─── Payload types ────────────────────────────────────────────────────────────

interface GitHubPushPayload {
  ref: string;                      // e.g. "refs/heads/main"
  installation?: { id: number };
  repository: {
    name: string;                   // repo name
    owner: { login: string };       // owner login
    full_name: string;
    default_branch: string;
  };
  head_commit?: { id: string; message: string } | null;
  sender: { login: string };
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  // Read raw body bytes — must happen before any JSON parsing so the HMAC
  // is computed over the exact bytes GitHub sent.
  const rawBody = Buffer.from(await req.arrayBuffer());

  // ── 1. Verify webhook signature ───────────────────────────────────────────
  const webhookSecret = process.env.GITHUB_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.error("[github/webhook] GITHUB_WEBHOOK_SECRET is not set — rejecting all webhooks");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 503 });
  }

  const signatureHeader = req.headers.get("x-hub-signature-256");
  const isValid = verifyWebhookSignature(rawBody, signatureHeader, webhookSecret);

  if (!isValid) {
    console.warn("[github/webhook] Signature verification failed — ignoring request");
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  // ── 2. Parse event ─────────────────────────────────────────────────────────
  const eventType = req.headers.get("x-github-event");
  const deliveryId = req.headers.get("x-github-delivery") ?? "unknown";

  // Acknowledge non-push events immediately — we only act on push
  if (eventType !== "push") {
    return NextResponse.json({ received: true, action: "ignored", event: eventType });
  }

  let payload: GitHubPushPayload;
  try {
    payload = JSON.parse(rawBody.toString("utf8")) as GitHubPushPayload;
  } catch (err) {
    console.error("[github/webhook] Failed to parse payload:", err);
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const installationId = String(payload.installation?.id ?? "");
  const repoOwner      = payload.repository.owner.login;
  const repoName       = payload.repository.name;
  const pushedRef      = payload.ref; // e.g. "refs/heads/main"

  console.info(
    `[github/webhook] delivery=${deliveryId} event=push ` +
    `installation=${installationId} repo=${repoOwner}/${repoName} ref=${pushedRef}`
  );

  // ── 3. Find the project linked to this installation ────────────────────────
  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select(
      "id, user_id, name, aws_role_arn, aws_external_id, aws_region, aws_account_id, " +
      "github_branch, github_repo_owner, github_repo_name, status"
    )
    .eq("github_installation_id", installationId)
    .eq("github_repo_owner", repoOwner)
    .eq("github_repo_name", repoName)
    .single() as unknown as { data: ProjectRow | null; error: unknown };

  if (projectError || !project) {
    // Could be a repo the app is installed on but not linked to any InfraReady project yet.
    // This is expected — GitHub sends events for all repos the app can access.
    console.info(
      `[github/webhook] No project found for installation=${installationId} ` +
      `repo=${repoOwner}/${repoName} — skipping`
    );
    return NextResponse.json({ received: true, action: "no_project" });
  }

  // ── 4. Check branch filter ─────────────────────────────────────────────────
  const deployBranch = project.github_branch ?? "main";
  const expectedRef  = `refs/heads/${deployBranch}`;

  if (pushedRef !== expectedRef) {
    console.info(
      `[github/webhook] Push to ${pushedRef} — project watches ${expectedRef}, skipping`
    );
    return NextResponse.json({ received: true, action: "branch_mismatch" });
  }

  // ── 5. Guard: skip if already deploying ───────────────────────────────────
  if (project.status === "deploying") {
    console.info(
      `[github/webhook] Project ${project.id} is already deploying — skipping duplicate trigger`
    );
    return NextResponse.json({ received: true, action: "already_deploying" });
  }

  // ── 6. Require AWS to be connected ────────────────────────────────────────
  if (!project.aws_role_arn) {
    console.warn(
      `[github/webhook] Project ${project.id} has no AWS role — cannot auto-deploy`
    );
    return NextResponse.json({ received: true, action: "aws_not_connected" });
  }

  // ── 7. Create deployment record ───────────────────────────────────────────
  const region  = project.aws_region ?? "us-east-1";
  const modules = ["vpc", "rds", "ecs", "storage", "security"];

  const { data: deployment, error: deployError } = await supabase
    .from("deployments")
    .insert({
      project_id: project.id,
      user_id:    project.user_id,
      modules,
      config: {
        aws_region:   region,
        environment:  "production",
        trigger:      "github_push",
        github_ref:   pushedRef,
        github_commit: payload.head_commit?.id ?? null,
        commit_message: payload.head_commit?.message ?? null,
      },
      status: "queued",
      logs:   [],
    })
    .select()
    .single();

  if (deployError || !deployment) {
    console.error("[github/webhook] Failed to create deployment record:", deployError);
    return NextResponse.json({ error: "Failed to create deployment" }, { status: 500 });
  }

  // ── 8. Queue the job ───────────────────────────────────────────────────────
  const jobPayload = {
    deploymentId:   deployment.id,
    projectId:      project.id,
    userId:         project.user_id,
    modules,
    config: {
      aws_region:    region,
      environment:   "production",
      project_name:  project.name.toLowerCase().replace(/[^a-z0-9-]/g, "-"),
      // Pass GitHub repo info so the runner can generate the CI workflow file
      github_repo_owner: repoOwner,
      github_repo_name:  repoName,
      github_branch:     deployBranch,
    },
    awsRoleArn:    project.aws_role_arn,
    awsExternalId: project.aws_external_id,
  };

  if (process.env.DEPLOY_QUEUE_URL) {
    await sqs.send(new SendMessageCommand({
      QueueUrl:               process.env.DEPLOY_QUEUE_URL,
      MessageBody:            JSON.stringify(jobPayload),
      MessageGroupId:         project.id,
      MessageDeduplicationId: deployment.id,
    }));
  } else {
    console.warn("[github/webhook] DEPLOY_QUEUE_URL not set — deployment record created but runner not notified");
  }

  // ── 9. Update project status ───────────────────────────────────────────────
  await supabase
    .from("projects")
    .update({ status: "deploying" })
    .eq("id", project.id);

  console.info(
    `[github/webhook] Queued deployment ${deployment.id} for project ${project.id} ` +
    `triggered by push to ${pushedRef} (commit ${payload.head_commit?.id?.slice(0, 7) ?? "unknown"})`
  );

  return NextResponse.json({
    received:     true,
    action:       "deployment_queued",
    deploymentId: deployment.id,
  });
}
