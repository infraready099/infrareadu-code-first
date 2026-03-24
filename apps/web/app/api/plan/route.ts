import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import { z } from "zod";
import { getTemplate } from "@/lib/app-templates";

const planSchema = z.object({
  projectId: z.string().uuid(),
  modules: z.array(z.enum(["vpc", "rds", "ecs", "storage", "security", "app-runner", "aurora-serverless"])).min(1).optional(),
  config: z.object({
    aws_region:       z.string().default("us-east-1"),
    environment:      z.enum(["production", "staging", "development"]).default("production"),
    vpc_cidr:         z.string().optional(),
    enable_nat:       z.boolean().optional(),
    db_engine:        z.enum(["postgres", "mysql"]).optional(),
    db_instance:      z.string().optional(),
    db_multi_az:      z.boolean().optional(),
    container_port:   z.number().optional(),
    container_cpu:    z.number().optional(),
    container_memory: z.number().optional(),
    domain_name:      z.string().optional(),
    alert_email:      z.string().email().optional(),
    billing_threshold: z.number().optional(),
  }),
});

const sqs = new SQSClient({ region: process.env.AWS_REGION ?? "us-east-1" });

const adminClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  let userId: string | undefined;

  if (bearerToken) {
    const { data: { user }, error: authError } = await adminClient.auth.getUser(bearerToken);
    if (authError) console.error("[plan] Bearer token validation failed:", authError.message);
    userId = user?.id;
  }

  if (!userId) {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    userId = user?.id;
  }

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = planSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request", details: parsed.error.format() }, { status: 400 });
  }

  const { projectId, modules: requestedModules, config } = parsed.data;

  const { data: project, error: projectError } = await adminClient
    .from("projects")
    .select("id, name, aws_role_arn, aws_external_id, aws_region, aws_account_id, repo_url, github_installation_id, user_id, app_template_id, template_config, status")
    .eq("id", projectId)
    .single();

  if (projectError) {
    console.error(`[plan] DB error fetching project: projectId=${projectId}`, projectError);
  }

  if (!project) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  if (project.user_id !== userId) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  if (!project.aws_role_arn) {
    return NextResponse.json({ error: "AWS account not connected. Please connect your AWS account first." }, { status: 400 });
  }

  // Block if a deploy/destroy is actively running — plan can wait
  if (["deploying", "running", "destroying"].includes(project.status)) {
    return NextResponse.json(
      { error: `Project is currently ${project.status}. Wait for it to finish before running a plan.` },
      { status: 409 }
    );
  }

  // ── Resolve modules ─────────────────────────────────────────────────────────
  let modules: string[];

  if (project.app_template_id) {
    const template = getTemplate(project.app_template_id);
    if (!template) {
      return NextResponse.json(
        { error: `Unknown app template "${project.app_template_id}".` },
        { status: 400 }
      );
    }
    const derived: string[] = ["vpc"];
    if (template.requiresDatabase) derived.push("rds");
    derived.push("ecs");
    if (template.requiresStorage) derived.push("storage");
    derived.push("security");
    modules = derived;
  } else {
    if (!requestedModules || requestedModules.length === 0) {
      return NextResponse.json(
        { error: "modules is required for non-template projects." },
        { status: 400 }
      );
    }
    modules = requestedModules;
  }

  // Create plan deployment record
  const { data: deployment, error: dbError } = await adminClient
    .from("deployments")
    .insert({
      project_id: projectId,
      user_id: userId,
      modules,
      config,
      action: "plan",
      status: "queued",
      logs: [],
    })
    .select()
    .single();

  if (dbError || !deployment) {
    console.error("[plan] Failed to create deployment:", dbError);
    return NextResponse.json({ error: "Failed to create plan" }, { status: 500 });
  }

  // Parse repo info for template projects
  let githubRepoOwner: string | undefined;
  let githubRepoName:  string | undefined;
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
    action: "plan",
    deploymentId: deployment.id,
    projectId,
    userId,
    modules,
    config: {
      ...config,
      project_name: project.name.toLowerCase().replace(/[^a-z0-9-]/g, "-"),
      aws_region:   project.aws_region ?? config.aws_region,
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

  if (process.env.DEPLOY_QUEUE_URL) {
    try {
      await sqs.send(new SendMessageCommand({
        QueueUrl: process.env.DEPLOY_QUEUE_URL,
        MessageBody: JSON.stringify(jobPayload),
        MessageGroupId: projectId,
        MessageDeduplicationId: deployment.id,
      }));
    } catch (sqsErr) {
      console.error("[plan] SQS send failed — rolling back plan record:", sqsErr);
      await adminClient.from("deployments").delete().eq("id", deployment.id);
      return NextResponse.json({ error: "Failed to queue plan — please try again." }, { status: 503 });
    }
  } else {
    console.warn("DEPLOY_QUEUE_URL not set — plan record created but runner not notified.");
  }

  // Note: we do NOT update project.status for plan — the project stays at its current state.
  // Only a full deploy changes project status.

  return NextResponse.json({ deploymentId: deployment.id }, { status: 202 });
}
