import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import { z } from "zod";

const testDeploySchema = z.object({
  projectId: z.string().uuid(),
});

const sqs = new SQSClient({ region: process.env.AWS_REGION ?? "us-east-1" });

const adminClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

/**
 * POST /api/test-deploy
 *
 * One-click "deploy then auto-destroy" for testing.
 * Creates a deploy job and a destroy job in the same SQS FIFO group.
 * Because FIFO queues process one message at a time per MessageGroupId,
 * the destroy job only runs after the deploy job is fully processed.
 *
 * Returns { deployDeploymentId, destroyDeploymentId } so the caller
 * can redirect to the deploy log while the full cycle runs in the background.
 */
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  let userId: string | undefined;

  if (bearerToken) {
    const { data: { user }, error } = await adminClient.auth.getUser(bearerToken);
    if (error) console.error("[test-deploy] Bearer validation failed:", error.message);
    userId = user?.id;
  }

  if (!userId) {
    const serverClient = await createServerClient();
    const { data: { user } } = await serverClient.auth.getUser();
    userId = user?.id;
  }

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = testDeploySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { projectId } = parsed.data;

  // Fetch project + verify ownership
  const { data: project, error: projectError } = await adminClient
    .from("projects")
    .select("id, name, aws_role_arn, aws_external_id, aws_region, aws_account_id, user_id, status")
    .eq("id", projectId)
    .eq("user_id", userId)
    .single();

  if (projectError) {
    console.error(`[test-deploy] DB error: projectId=${projectId} userId=${userId}`, projectError.message);
  }

  if (!project) {
    return NextResponse.json(
      { error: `Project not found (uid=${userId?.slice(0, 8)}, proj=${projectId.slice(0, 8)}). Try signing out and back in.` },
      { status: 404 }
    );
  }

  if (!project.aws_role_arn) {
    return NextResponse.json(
      { error: "AWS account not connected. Cannot run a test deploy without AWS credentials." },
      { status: 400 }
    );
  }

  // Block if already in an active operation
  if (["deploying", "running", "destroying", "queued"].includes(project.status)) {
    return NextResponse.json(
      { error: `Project is currently ${project.status}. Wait for it to finish before running a test deploy.` },
      { status: 409 }
    );
  }

  // Derive modules + config from the last deploy (same logic as destroy route)
  const { data: lastDeployment } = await adminClient
    .from("deployments")
    .select("modules, config")
    .eq("project_id", projectId)
    .eq("action", "deploy")
    .in("status", ["success", "failed", "running", "queued"])
    .not("modules", "eq", "[]")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const modules: string[] = lastDeployment?.modules ?? [];
  const config: Record<string, unknown> = (lastDeployment?.config as Record<string, unknown>) ?? {};

  if (modules.length === 0) {
    return NextResponse.json(
      { error: "No previous deployment found to re-run. Deploy manually first so test-deploy knows which modules to use." },
      { status: 400 }
    );
  }

  const resolvedConfig = {
    ...config,
    aws_region:   project.aws_region ?? (config.aws_region as string) ?? "us-east-1",
    project_name: project.name.toLowerCase().replace(/[^a-z0-9-]/g, "-"),
  };

  const commonJobBase = {
    projectId,
    userId,
    modules,
    config:        resolvedConfig,
    awsRoleArn:    project.aws_role_arn,
    awsExternalId: project.aws_external_id,
  };

  // ── Create deploy deployment record ────────────────────────────────────────
  const { data: deployDeployment, error: deployDbErr } = await adminClient
    .from("deployments")
    .insert({
      project_id: projectId,
      user_id:    userId,
      modules,
      config:     resolvedConfig,
      status:     "queued",
      logs:       [],
      action:     "deploy",
    })
    .select()
    .single();

  if (deployDbErr || !deployDeployment) {
    console.error("[test-deploy] Failed to create deploy record:", deployDbErr);
    return NextResponse.json({ error: "Failed to create deploy record" }, { status: 500 });
  }

  // ── Create destroy deployment record ───────────────────────────────────────
  // Created immediately so the FIFO message can reference it.
  // Status stays "queued" until the runner picks it up (after deploy finishes).
  const { data: destroyDeployment, error: destroyDbErr } = await adminClient
    .from("deployments")
    .insert({
      project_id: projectId,
      user_id:    userId,
      modules,
      config:     resolvedConfig,
      status:     "queued",
      logs:       [],
      action:     "destroy",
    })
    .select()
    .single();

  if (destroyDbErr || !destroyDeployment) {
    // Roll back the deploy record so nothing is left in a stuck state
    await adminClient.from("deployments").delete().eq("id", deployDeployment.id);
    console.error("[test-deploy] Failed to create destroy record:", destroyDbErr);
    return NextResponse.json({ error: "Failed to create destroy record" }, { status: 500 });
  }

  if (!process.env.DEPLOY_QUEUE_URL) {
    // Dev fallback — records created but runner not notified
    console.warn("[test-deploy] DEPLOY_QUEUE_URL not set — records created but runner not notified.");
    await adminClient.from("projects").update({ status: "deploying" }).eq("id", projectId);
    return NextResponse.json({ deployDeploymentId: deployDeployment.id, destroyDeploymentId: destroyDeployment.id }, { status: 202 });
  }

  // ── Enqueue deploy job ──────────────────────────────────────────────────────
  try {
    await sqs.send(new SendMessageCommand({
      QueueUrl:               process.env.DEPLOY_QUEUE_URL,
      MessageBody:            JSON.stringify({ ...commonJobBase, action: "deploy", deploymentId: deployDeployment.id }),
      MessageGroupId:         projectId,
      MessageDeduplicationId: deployDeployment.id,
    }));
  } catch (sqsErr) {
    console.error("[test-deploy] SQS send failed for deploy job — rolling back:", sqsErr);
    await adminClient.from("deployments").delete().eq("id", deployDeployment.id);
    await adminClient.from("deployments").delete().eq("id", destroyDeployment.id);
    return NextResponse.json({ error: "Failed to queue deploy job — please try again." }, { status: 503 });
  }

  // ── Enqueue destroy job ─────────────────────────────────────────────────────
  // Same MessageGroupId ensures this runs AFTER the deploy message is consumed.
  try {
    await sqs.send(new SendMessageCommand({
      QueueUrl:               process.env.DEPLOY_QUEUE_URL,
      MessageBody:            JSON.stringify({ ...commonJobBase, action: "destroy", deploymentId: destroyDeployment.id }),
      MessageGroupId:         projectId,
      MessageDeduplicationId: destroyDeployment.id,
    }));
  } catch (sqsErr) {
    // Deploy is already queued — can't un-send it. Mark destroy record as failed so
    // it doesn't stay stuck at "queued" in the UI. User will need to destroy manually.
    console.error("[test-deploy] SQS send failed for destroy job — deploy will run but auto-destroy won't:", sqsErr);
    await adminClient.from("deployments").update({
      status: "failed",
      error:  "Auto-destroy could not be queued — deploy will still run. Destroy manually when ready.",
    }).eq("id", destroyDeployment.id);
  }

  // Update project to deploying
  await adminClient
    .from("projects")
    .update({ status: "deploying" })
    .eq("id", projectId);

  return NextResponse.json(
    { deployDeploymentId: deployDeployment.id, destroyDeploymentId: destroyDeployment.id },
    { status: 202 }
  );
}
