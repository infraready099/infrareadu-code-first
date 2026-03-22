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

  // Verify project ownership
  const { data: project } = await adminClient
    .from("projects")
    .select("user_id")
    .eq("id", projectId)
    .single();

  if (!project || project.user_id !== user.id) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  // Get the most recent deploy (not plan) with modules
  const { data: deployment } = await adminClient
    .from("deployments")
    .select("modules, config")
    .eq("project_id", projectId)
    .or("action.eq.deploy,action.is.null")
    .not("modules", "eq", "[]")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!deployment) {
    return NextResponse.json({ error: "No previous deployment found" }, { status: 404 });
  }

  return NextResponse.json({
    modules: deployment.modules,
    config:  deployment.config,
  });
}
