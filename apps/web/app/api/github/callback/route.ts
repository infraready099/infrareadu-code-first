import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

/**
 * GET /api/github/callback
 *
 * GitHub redirects here after the user installs (or updates) the GitHub App.
 * Query parameters from GitHub:
 *   installation_id — numeric ID of the installation
 *   setup_action    — "install" | "update" | "delete"
 *   state           — our projectId (passed in the install URL)
 *
 * We save the installation_id to the project row so the webhook handler can
 * look up the project from incoming push events.
 *
 * GitHub does NOT always send repository information in the callback; it sends
 * it in the installation webhook instead. For MVP we store the installation_id
 * here and let the webhook fill in repo details on first push.
 */
export async function GET(req: NextRequest) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    // GitHub redirects back unauthenticated in some edge cases (session expired).
    // Send them to login with enough context to retry.
    const loginUrl = new URL("/login", req.nextUrl.origin);
    return NextResponse.redirect(loginUrl.toString());
  }

  const installationId = req.nextUrl.searchParams.get("installation_id");
  const setupAction    = req.nextUrl.searchParams.get("setup_action") ?? "install";
  const projectId      = req.nextUrl.searchParams.get("state");

  // Delete events come from the GitHub App settings page — no project context needed.
  if (setupAction === "delete") {
    console.info(`[github/callback] App uninstalled — installation_id=${installationId}`);
    return NextResponse.redirect(new URL("/projects", req.nextUrl.origin).toString());
  }

  if (!installationId) {
    return NextResponse.json({ error: "Missing installation_id from GitHub" }, { status: 400 });
  }

  if (!projectId) {
    // Can happen if user navigates to install URL without going through /api/github/connect.
    console.warn("[github/callback] No state (projectId) in callback — cannot link installation");
    return NextResponse.redirect(new URL("/projects", req.nextUrl.origin).toString());
  }

  // Verify project ownership before writing
  const { data: project } = await supabase
    .from("projects")
    .select("id, github_installation_id")
    .eq("id", projectId)
    .eq("user_id", user.id)
    .single();

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const { error: updateError } = await supabase
    .from("projects")
    .update({
      github_installation_id: installationId,
      github_connected_at:    new Date().toISOString(),
    })
    .eq("id", projectId);

  if (updateError) {
    console.error("[github/callback] Failed to save installation_id:", updateError);
    return NextResponse.json({ error: "Failed to save GitHub connection" }, { status: 500 });
  }

  console.info(
    `[github/callback] Linked installation ${installationId} to project ${projectId} ` +
    `(action=${setupAction})`
  );

  // Redirect back to the project detail page
  return NextResponse.redirect(
    new URL(`/projects/${projectId}`, req.nextUrl.origin).toString()
  );
}
