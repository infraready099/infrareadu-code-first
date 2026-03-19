import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import { z } from "zod";

const destroySchema = z.object({
  projectId: z.string().uuid(),
});

const sqs = new SQSClient({ region: process.env.AWS_REGION ?? "us-east-1" });

// Service-role client — used only for writes that need to bypass RLS (insert deployment, update project)
const adminClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  // Verify identity: Bearer token takes priority (reliable in client fetches),
  // fall back to cookie-based auth (Server Components / SSR).
  let userId: string;

  if (bearerToken) {
    // adminClient.auth.getUser(token) validates the JWT server-side — no client needed
    const { data: { user }, error } = await adminClient.auth.getUser(bearerToken);
    if (!user || error) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    userId = user.id;
  } else {
    const serverClient = await createServerClient();
    const { data: { user } } = await serverClient.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    userId = user.id;
  }

  const body = await req.json();
  const parsed = destroySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { projectId } = parsed.data;

  // Fetch project via admin client, filtering by BOTH projectId AND userId.
  // This is equivalent to RLS — if the row is null, either it doesn't exist or this user doesn't own it.
  const { data: project, error: projectError } = await adminClient
    .from("projects")
    .select("id, name, aws_role_arn, aws_external_id, aws_region, aws_account_id, user_id, status")
    .eq("id", projectId)
    .eq("user_id", userId)
    .single();

  if (projectError) {
    console.error(`[destroy] DB error: projectId=${projectId} userId=${userId}`, projectError.message);
  }

  if (!project) {
    console.error(`[destroy] Project not found or ownership mismatch: projectId=${projectId} userId=${userId} dbErr=${projectError?.message}`);
    return NextResponse.json(
      { error: `Project not found (uid=${userId?.slice(0,8)}, proj=${projectId.slice(0,8)}). Try signing out and back in.` },
      { status: 404 }
    );
  }

  if (!project.aws_role_arn) {
    return NextResponse.json(
      { error: "AWS account not connected. Cannot destroy infrastructure that was never deployed." },
      { status: 400 }
    );
  }

  // Reject only active deploy operations — destroying is allowed to retry (runner may have crashed)
  if (["deploying", "running"].includes(project.status)) {
    return NextResponse.json(
      { error: `Project is currently ${project.status}. Wait for it to finish before destroying.` },
      { status: 409 }
    );
  }

  // Fetch modules + config from the last successful deployment
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
      QueueUrl:              process.env.DEPLOY_QUEUE_URL,
      MessageBody:           JSON.stringify(jobPayload),
      MessageGroupId:        projectId,
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
