/**
 * GET /api/plan/config/[projectId]
 * Returns the modules + config from the most recent successful deploy,
 * so the Preview Changes button can run a plan with the same parameters.
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";

const adminClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;

  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Verify project ownership + fetch name for project_name injection
  const { data: project } = await adminClient
    .from("projects")
    .select("user_id, name, aws_region")
    .eq("id", projectId)
    .single();

  if (!project || project.user_id !== user.id) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  // Get recent deploy-action deployments and pick the first with non-empty modules.
  // We do the modules check in JS rather than SQL because TEXT[] comparisons with
  // Supabase's PostgREST filter syntax are unreliable.
  const { data: rows } = await adminClient
    .from("deployments")
    .select("modules, config, action")
    .eq("project_id", projectId)
    .neq("action", "destroy")
    .neq("action", "test-destroy")
    .neq("action", "plan")
    .order("created_at", { ascending: false })
    .limit(20);

  const deployment = (rows ?? []).find(
    (d) => Array.isArray(d.modules) && d.modules.length > 0
  ) ?? null;

  if (!deployment) {
    return NextResponse.json({ error: "No previous deployment found" }, { status: 404 });
  }

  const config = {
    ...(deployment.config as Record<string, unknown>),
    project_name: (project.name ?? projectId.slice(0, 8)).toLowerCase().replace(/[^a-z0-9-]/g, "-"),
    aws_region:   project.aws_region ?? (deployment.config as Record<string, unknown>)?.aws_region ?? "us-east-1",
  };

  return NextResponse.json({
    modules: deployment.modules,
    config,
  });
}
