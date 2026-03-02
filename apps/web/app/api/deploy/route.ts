import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
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
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = deploySchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request", details: parsed.error.format() }, { status: 400 });
  }

  const { projectId, modules, config } = parsed.data;

  // Verify project belongs to user
  const { data: project } = await supabase
    .from("projects")
    .select("id, name, aws_role_arn, aws_external_id, aws_region")
    .eq("id", projectId)
    .eq("user_id", user.id)
    .single();

  if (!project) {
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
      user_id: user.id,
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

  // Queue the deployment job
  const jobPayload = {
    deploymentId: deployment.id,
    projectId,
    userId: user.id,
    modules,
    config: { ...config, aws_region: project.aws_region ?? config.aws_region },
    awsRoleArn: project.aws_role_arn,
    awsExternalId: project.aws_external_id,
  };

  await sqs.send(new SendMessageCommand({
    QueueUrl: process.env.DEPLOY_QUEUE_URL!,
    MessageBody: JSON.stringify(jobPayload),
    MessageGroupId: projectId,          // FIFO: one deploy at a time per project
    MessageDeduplicationId: deployment.id,
  }));

  // Update project status
  await supabase
    .from("projects")
    .update({ status: "deploying" })
    .eq("id", projectId);

  return NextResponse.json({ deploymentId: deployment.id }, { status: 202 });
}
