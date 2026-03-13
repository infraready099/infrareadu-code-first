import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

/**
 * GET /api/github/connect?projectId=<uuid>
 *
 * Redirects the authenticated user to the GitHub App installation page.
 * The `state` parameter carries the projectId so the callback can associate
 * the installation with the right project after GitHub redirects back.
 *
 * Required env vars:
 *   GITHUB_DEPLOY_APP_SLUG — slug of the deploy GitHub App (e.g. "infraready-deploy")
 *   NEXT_PUBLIC_APP_URL — base URL for building the callback (e.g. https://infraready.io)
 */
export async function GET(req: NextRequest) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const projectId = req.nextUrl.searchParams.get("projectId");

  if (!projectId) {
    return NextResponse.json({ error: "projectId query parameter is required" }, { status: 400 });
  }

  // Verify the project exists and belongs to this user
  const { data: project } = await supabase
    .from("projects")
    .select("id, github_installation_id")
    .eq("id", projectId)
    .eq("user_id", user.id)
    .single();

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  // If this project already has an installation_id, skip GitHub and go to Step 2
  if (project.github_installation_id) {
    const wizardUrl = new URL("/projects/new", req.nextUrl.origin);
    wizardUrl.searchParams.set("projectId", projectId);
    wizardUrl.searchParams.set("step", "2");
    return NextResponse.redirect(wizardUrl.toString());
  }

  // Check if the user has any other project with an installation_id — reuse it
  const { data: existingInstall } = await supabase
    .from("projects")
    .select("github_installation_id")
    .eq("user_id", user.id)
    .not("github_installation_id", "is", null)
    .limit(1)
    .single();

  if (existingInstall?.github_installation_id) {
    // Copy the installation_id to this project and skip GitHub
    await supabase
      .from("projects")
      .update({ github_installation_id: existingInstall.github_installation_id })
      .eq("id", projectId);

    const wizardUrl = new URL("/projects/new", req.nextUrl.origin);
    wizardUrl.searchParams.set("projectId", projectId);
    wizardUrl.searchParams.set("step", "2");
    return NextResponse.redirect(wizardUrl.toString());
  }

  const appSlug = process.env.GITHUB_DEPLOY_APP_SLUG;

  if (!appSlug) {
    console.error("[github/connect] GITHUB_DEPLOY_APP_SLUG env var is not set");
    return NextResponse.json(
      { error: "GitHub integration is not configured. Contact support." },
      { status: 503 }
    );
  }

  // First time — redirect to GitHub App installation
  const installUrl = new URL(`https://github.com/apps/${appSlug}/installations/new`);
  installUrl.searchParams.set("state", projectId);

  return NextResponse.redirect(installUrl.toString());
}
