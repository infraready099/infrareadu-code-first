import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import { z } from "zod";

const destroySchema = z.object({
  projectId: z.string().uuid(),
});

const sqs = new SQSClient({ region: process.env.AWS_REGION ?? "us-east-1" });

// Service-role client — bypasses RLS, used for server-side operations.
// We validate the user's identity separately via their auth token.
const adminClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function POST(req: NextRequest) {
  // Resolve the calling user's identity.
  // Try Authorization: Bearer header first (sent explicitly by wizard),
  // then fall back to cookie-based session.
  const authHeader = req.headers.get("authorization");
  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  let userId: string | undefined;

  if (bearerToken) {
    // Validate token against Supabase servers — no local trust
    const { data: { user }, error: authError } = await adminClient.auth.getUser(bearerToken);
    if (authError) console.error("[destroy] Bearer token validation failed:", authError.message);
    userId = user?.id;
  }

  if (!userId) {
    // Cookie-based fallback — always use getUser() (server-validated), never getSession()
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    userId = user?.id;
  }

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = destroySchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request", details: parsed.error.format() }, { status: 400 });
  }

  const { projectId } = parsed.data;

  // Use admin client (service role) to fetch project — bypasses RLS.
  // We manually verify ownership below.
  const { data: project, error: projectError } = await adminClient
    .from("projects")
    .select("id, name, aws_role_arn, aws_external_id, aws_region, aws_account_id, user_id, modules, status")
    .eq("id", projectId)
    .single();

  if (projectError) {
    console.error(`[destroy] DB error fetching project: projectId=${projectId}`, projectError);
  }

  if (!project) {
    console.error(`[destroy] Project not found: projectId=${projectId} userId=${userId}`);
    return NextResponse.json({ error: "Project not found. Try starting a new project from the dashboard." }, { status: 404 });
  }

  if (project.user_id !== userId) {
    console.error(`[destroy] Ownership mismatch: project.user_id=${project.user_id} userId=${userId}`);
    return NextResponse.json({ error: "Project not found. Try starting a new project from the dashboard." }, { status: 404 });
  }

  if (!project.aws_role_arn) {
    return NextResponse.json({ error: "AWS account not connected. Cannot destroy infrastructure that was never deployed." }, { status: 400 });
  }

  // C5: reject concurrent operations — one deploy/destroy at a time per project
  if (["deploying", "running", "destroying"].includes(project.status)) {
    return NextResponse.json(
      { error: `Project is currently ${project.status}. Wait for it to finish before starting a new operation.` },
      { status: 409 }
    );
  }

  // C3/W3/W5: fetch both modules and full config from the last successful deployment
  // so the runner has the original vpc_cidr, environment, and other settings needed for destroy.
  const { data: lastDeployment } = await adminClient
    .from("deployments")
    .select("modules, config")
    .eq("project_id", projectId)
    .eq("status", "success")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  const lastModules: string[] = lastDeployment?.modules ?? [];
  const lastConfig: Record<string, unknown> = (lastDeployment?.config as Record<string, unknown>) ?? {};

  // Create destroy deployment record
  // I3: store the actual module list so the UI can show what will be destroyed
  const { data: deployment, error: dbError } = await adminClient
    .from("deployments")
    .insert({
      project_id: projectId,
      user_id: userId,
      modules: lastModules,
      config: lastConfig,
      status: "queued",
      logs: [],
      action: "destroy",
    })
    .select()
    .single();

  if (dbError || !deployment) {
    console.error("[destroy] Failed to create deployment record:", dbError);
    return NextResponse.json({ error: "Failed to create deployment" }, { status: 500 });
  }

  // Queue the destroy job
  // C3/W3/W5: merge the original deploy config so the runner has vpc_cidr, environment, etc.
  const jobPayload = {
    action: "destroy",
    deploymentId: deployment.id,
    projectId,
    userId,
    modules: lastModules,
    config: {
      ...lastConfig,
      aws_region:   project.aws_region ?? (lastConfig.aws_region as string) ?? "us-east-1",
      project_name: project.name.toLowerCase().replace(/[^a-z0-9-]/g, "-"),
    },
    awsRoleArn:    project.aws_role_arn,
    awsExternalId: project.aws_external_id,
  };

  if (process.env.DEPLOY_QUEUE_URL) {
    await sqs.send(new SendMessageCommand({
      QueueUrl: process.env.DEPLOY_QUEUE_URL,
      MessageBody: JSON.stringify(jobPayload),
      MessageGroupId: projectId,
      MessageDeduplicationId: deployment.id,
    }));
  } else {
    console.warn("[destroy] DEPLOY_QUEUE_URL not set — deployment record created but runner not notified.");
  }

  // Update project status to destroying
  await adminClient
    .from("projects")
    .update({ status: "destroying" })
    .eq("id", projectId);

  return NextResponse.json({ deploymentId: deployment.id }, { status: 202 });
}
