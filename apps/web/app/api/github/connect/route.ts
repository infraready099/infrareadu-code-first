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
  const projectId = req.nextUrl.searchParams.get("projectId");

  if (!projectId) {
    return NextResponse.json({ error: "projectId query parameter is required" }, { status: 400 });
  }

  // Check if any project already has an installation_id — if so skip GitHub
  const supabase = await createServerClient();
  const { data: project } = await supabase
    .from("projects")
    .select("github_installation_id")
    .eq("id", projectId)
    .single();

  if (project?.github_installation_id) {
    const wizardUrl = new URL("/projects/new", req.nextUrl.origin);
    wizardUrl.searchParams.set("projectId", projectId);
    wizardUrl.searchParams.set("step", "2");
    return NextResponse.redirect(wizardUrl.toString());
  }

  // Check if any other project from this user has an installation_id — reuse it
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    const { data: existingInstall } = await supabase
      .from("projects")
      .select("github_installation_id")
      .eq("user_id", user.id)
      .not("github_installation_id", "is", null)
      .limit(1)
      .single();

    if (existingInstall?.github_installation_id) {
      await supabase
        .from("projects")
        .update({ github_installation_id: existingInstall.github_installation_id })
        .eq("id", projectId);

      const wizardUrl = new URL("/projects/new", req.nextUrl.origin);
      wizardUrl.searchParams.set("projectId", projectId);
      wizardUrl.searchParams.set("step", "2");
      return NextResponse.redirect(wizardUrl.toString());
    }
  }

  const appSlug = process.env.GITHUB_DEPLOY_APP_SLUG;

  if (!appSlug) {
    console.error("[github/connect] GITHUB_DEPLOY_APP_SLUG env var is not set");
    return NextResponse.json(
      { error: "GitHub integration is not configured. Contact support." },
      { status: 503 }
    );
  }

  // Redirect to GitHub App installation.
  // Using /installations/new/permissions forces GitHub to call our callback
  // even when the app is already installed (re-authorization flow).
  const installUrl = new URL(`https://github.com/apps/${appSlug}/installations/new/permissions`);
  installUrl.searchParams.set("state", projectId);

  return NextResponse.redirect(installUrl.toString());
}
