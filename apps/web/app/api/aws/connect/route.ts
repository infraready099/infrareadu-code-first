import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { STSClient, AssumeRoleCommand, GetCallerIdentityCommand } from "@aws-sdk/client-sts";
import { z } from "zod";
import { randomUUID } from "crypto";

const connectSchema = z.object({
  projectId: z.string().uuid(),
  roleArn: z.string().regex(/^arn:aws:iam::\d{12}:role\/.+$/, "Invalid IAM role ARN format"),
});

export async function POST(req: NextRequest) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = connectSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid role ARN format" }, { status: 400 });
  }

  const { projectId, roleArn } = parsed.data;

  // Verify project belongs to user
  const { data: project } = await supabase
    .from("projects")
    .select("id, aws_external_id")
    .eq("id", projectId)
    .eq("user_id", user.id)
    .single();

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const externalId = project.aws_external_id;

  // Try to assume the role to verify it's set up correctly
  const sts = new STSClient({ region: "us-east-1" });

  try {
    const assumeResult = await sts.send(new AssumeRoleCommand({
      RoleArn: roleArn,
      RoleSessionName: `infraready-verify-${Date.now()}`,
      ExternalId: externalId,
      DurationSeconds: 900, // 15 minutes — just for verification
    }));

    const tempSts = new STSClient({
      region: "us-east-1",
      credentials: {
        accessKeyId: assumeResult.Credentials!.AccessKeyId!,
        secretAccessKey: assumeResult.Credentials!.SecretAccessKey!,
        sessionToken: assumeResult.Credentials!.SessionToken!,
      },
    });

    const identity = await tempSts.send(new GetCallerIdentityCommand({}));

    // Save the verified role ARN
    await supabase
      .from("projects")
      .update({
        aws_role_arn: roleArn,
        aws_account_id: identity.Account,
        aws_connected_at: new Date().toISOString(),
      })
      .eq("id", projectId);

    return NextResponse.json({
      success: true,
      accountId: identity.Account,
      message: `Successfully connected to AWS account ${identity.Account}`,
    });

  } catch (err: unknown) {
    const error = err as { name?: string; message?: string };
    console.error("AWS role assumption failed:", error);

    let message = "Could not assume the IAM role. Check that the role ARN and ExternalId are correct.";
    if (error.name === "AccessDenied") {
      message = "Access denied. Make sure the IAM role trusts InfraReady and uses the correct ExternalId.";
    } else if (error.name === "NoSuchEntity") {
      message = "The IAM role was not found. Check the role ARN.";
    }

    return NextResponse.json({ error: message }, { status: 400 });
  }
}

// Generate ExternalId for a new project
export async function GET(req: NextRequest) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const projectId = req.nextUrl.searchParams.get("projectId");
  if (!projectId) return NextResponse.json({ error: "projectId required" }, { status: 400 });

  const { data: project } = await supabase
    .from("projects")
    .select("aws_external_id, aws_account_id")
    .eq("id", projectId)
    .eq("user_id", user.id)
    .single();

  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({
    externalId: project.aws_external_id,
    connected: !!project.aws_account_id,
    accountId: project.aws_account_id,
  });
}
