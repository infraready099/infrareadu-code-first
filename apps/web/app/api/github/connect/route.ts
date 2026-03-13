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
    .select("id")
    .eq("id", projectId)
    .eq("user_id", user.id)
    .single();

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const appSlug = process.env.GITHUB_DEPLOY_APP_SLUG;

  if (!appSlug) {
    console.error("[github/connect] GITHUB_DEPLOY_APP_SLUG env var is not set");
    return NextResponse.json(
      { error: "GitHub integration is not configured. Contact support." },
      { status: 503 }
    );
  }

  // GitHub App installation URL — state parameter round-trips back to our callback
  const installUrl = new URL(`https://github.com/apps/${appSlug}/installations/new`);
  installUrl.searchParams.set("state", projectId);

  return NextResponse.redirect(installUrl.toString());
}
