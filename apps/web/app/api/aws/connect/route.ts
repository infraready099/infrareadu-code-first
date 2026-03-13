import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";
import { STSClient, AssumeRoleCommand, GetCallerIdentityCommand } from "@aws-sdk/client-sts";
import { z } from "zod";

const connectSchema = z.object({
  projectId: z.string().uuid(),
  roleArn: z.string().regex(/^arn:aws:iam::\d{12}:role\/.+$/, "Invalid IAM role ARN format"),
});

// Service-role client bypasses RLS — we verify ownership manually.
const adminClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function resolveUserId(req: NextRequest): Promise<string | undefined> {
  const authHeader = req.headers.get("authorization");
  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (bearerToken) {
    const { data: { user } } = await adminClient.auth.getUser(bearerToken);
    if (user?.id) return user.id;
  }

  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user?.id) return user.id;

  const { data: { session } } = await supabase.auth.getSession();
  return session?.user?.id;
}

export async function POST(req: NextRequest) {
  const userId = await resolveUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = connectSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid role ARN format" }, { status: 400 });

  const { projectId, roleArn } = parsed.data;

  const { data: project } = await adminClient
    .from("projects")
    .select("id, aws_external_id, user_id")
    .eq("id", projectId)
    .single();

  if (!project || project.user_id !== userId) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const externalId = project.aws_external_id;
  const sts = new STSClient({ region: "us-east-1" });

  try {
    const assumeResult = await sts.send(new AssumeRoleCommand({
      RoleArn: roleArn,
      RoleSessionName: `infraready-verify-${Date.now()}`,
      ExternalId: externalId,
      DurationSeconds: 900,
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

    await adminClient
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

export async function GET(req: NextRequest) {
  const userId = await resolveUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const projectId = req.nextUrl.searchParams.get("projectId");
  if (!projectId) return NextResponse.json({ error: "projectId required" }, { status: 400 });

  const { data: project } = await adminClient
    .from("projects")
    .select("aws_external_id, aws_account_id, user_id")
    .eq("id", projectId)
    .single();

  if (!project || project.user_id !== userId) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({
    externalId: project.aws_external_id,
    connected: !!project.aws_account_id,
    accountId: project.aws_account_id,
  });
}
