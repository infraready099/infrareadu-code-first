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
    // Validate token directly — no cookie dependency
    const { data: { user } } = await adminClient.auth.getUser(bearerToken);
    userId = user?.id;
  }

  if (!userId) {
    // Cookie-based fallback
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      userId = user.id;
    } else {
      const { data: { session } } = await supabase.auth.getSession();
      userId = session?.user?.id;
    }
  }

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = deploySchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request", details: parsed.error.format() }, { status: 400 });
  }

  const { projectId, modules, config } = parsed.data;

  // Use admin client (service role) to fetch project — bypasses RLS.
  // We manually verify ownership below.
  const { data: project } = await adminClient
    .from("projects")
    .select("id, name, aws_role_arn, aws_external_id, aws_region, aws_account_id, repo_url, github_installation_id, user_id")
    .eq("id", projectId)
    .single();

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  if (project.user_id !== userId) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  if (!project.aws_role_arn) {
    return NextResponse.json({ error: "AWS account not connected. Please connect your AWS account first." }, { status: 400 });
  }

  // Create deployment record
  const { data: deployment, error: dbError } = await adminClient
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
  await adminClient
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
  await adminClient
    .from("projects")
    .update({ status: "deploying" })
    .eq("id", projectId);

  return NextResponse.json({ deploymentId: deployment.id }, { status: 202 });
}
