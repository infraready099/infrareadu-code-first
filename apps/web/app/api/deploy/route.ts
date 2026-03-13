import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import { z } from "zod";

const deploySchema = z.object({
  projectId: z.string().uuid(),
  modules: z.array(z.enum(["vpc", "rds", "ecs", "storage", "security"])).min(1),
  config: z.object({
    aws_region:       z.string().default("us-east-1"),
    environment:      z.enum(["production", "staging", "development"]).default("production"),
    // VPC
    vpc_cidr:         z.string().optional(),
    enable_nat:       z.boolean().optional(),
    // RDS
    db_engine:        z.enum(["postgres", "mysql"]).optional(),
    db_instance:      z.string().optional(),
    db_multi_az:      z.boolean().optional(),
    // ECS
    container_port:   z.number().optional(),
    container_cpu:    z.number().optional(),
    container_memory: z.number().optional(),
    domain_name:      z.string().optional(),
    // Security
    alert_email:      z.string().email().optional(),
    billing_threshold: z.number().optional(),
  }),
});

const sqs = new SQSClient({ region: process.env.AWS_REGION ?? "us-east-1" });

export async function POST(req: NextRequest) {
  // If the client sent an explicit Bearer token, use it to build an authenticated
  // Supabase client — this bypasses cookie propagation issues entirely and ensures
  // RLS policies run in the correct user context.
  const authHeader = req.headers.get("authorization");
  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  // Build a Supabase client that is authenticated as the calling user
  const supabase = bearerToken
    ? createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { global: { headers: { Authorization: `Bearer ${bearerToken}` } } }
      )
    : await createServerClient();

  // Resolve userId
  const { data: { user } } = await supabase.auth.getUser();
  let userId: string | undefined = user?.id;
  if (!userId && !bearerToken) {
    // Cookie-based fallback: read JWT directly without server validation
    const { data: { session } } = await supabase.auth.getSession();
    userId = session?.user?.id;
  }

  if (!userId) {
    console.error("[deploy] Unauthorized — no userId resolved. bearerToken present:", !!bearerToken);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = deploySchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request", details: parsed.error.format() }, { status: 400 });
  }

  const { projectId, modules, config } = parsed.data;

  console.log("[deploy] userId:", userId, "projectId:", projectId, "bearerToken:", !!bearerToken);

  // Verify project exists and belongs to user
  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id, name, aws_role_arn, aws_external_id, aws_region, aws_account_id, repo_url, github_installation_id, user_id")
    .eq("id", projectId)
    .single();

  console.log("[deploy] project:", project?.id, "error:", projectError?.message);

  if (!project) {
    return NextResponse.json({ error: `Project not found (id: ${projectId}, user: ${userId})` }, { status: 404 });
  }

  if (project.user_id !== userId) {
    console.error("[deploy] user_id mismatch — project.user_id:", project.user_id, "userId:", userId);
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  if (!project.aws_role_arn) {
    return NextResponse.json({ error: "AWS account not connected. Please connect your AWS account first." }, { status: 400 });
  }

  // Create deployment record
  const { data: deployment, error: dbError } = await supabase
    .from("deployments")
    .insert({
      project_id: projectId,
      user_id: userId,
      modules,
      config,
      status: "queued",
      logs: [],
    })
    .select()
    .single();

  if (dbError || !deployment) {
    console.error("Failed to create deployment:", dbError);
    return NextResponse.json({ error: "Failed to create deployment" }, { status: 500 });
  }

  // Persist region to the project row so the detail page can show it
  await supabase
    .from("projects")
    .update({ aws_region: config.aws_region })
    .eq("id", projectId);

  // Parse repo owner + name from the stored GitHub URL
  let githubRepoOwner: string | undefined;
  let githubRepoName:  string | undefined;
  if (project.repo_url) {
    try {
      const parts = new URL(project.repo_url).pathname.replace(/^\//, "").split("/");
      if (parts.length >= 2) {
        githubRepoOwner = parts[0];
        githubRepoName  = parts[1].replace(/\.git$/, "");
      }
    } catch { /* invalid URL — skip */ }
  }

  // Queue the deployment job
  const jobPayload = {
    deploymentId: deployment.id,
    projectId,
    userId,
    modules,
    config: {
      ...config,
      project_name: project.name.toLowerCase().replace(/[^a-z0-9-]/g, "-"),
      aws_region:   project.aws_region ?? config.aws_region,
    },
    awsRoleArn:             project.aws_role_arn,
    awsExternalId:          project.aws_external_id,
    githubRepoOwner,
    githubRepoName,
    githubInstallationId:   project.github_installation_id ?? undefined,
  };

  if (process.env.DEPLOY_QUEUE_URL) {
    await sqs.send(new SendMessageCommand({
      QueueUrl: process.env.DEPLOY_QUEUE_URL,
      MessageBody: JSON.stringify(jobPayload),
      MessageGroupId: projectId,
      MessageDeduplicationId: deployment.id,
    }));
  } else {
    console.warn("DEPLOY_QUEUE_URL not set — deployment record created but runner not notified.");
  }

  // Update project status
  await supabase
    .from("projects")
    .update({ status: "deploying" })
    .eq("id", projectId);

  return NextResponse.json({ deploymentId: deployment.id }, { status: 202 });
}
