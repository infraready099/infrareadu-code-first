import { notFound } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Metadata } from "next";
import { createServerClient } from "@/lib/supabase/server";
import { ProjectTabs } from "./project-tabs";
import type { DeploymentStatus, LogLine, Deployment, Project } from "./types";

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createServerClient();
  const { data: project } = await supabase
    .from("projects")
    .select("name")
    .eq("id", id)
    .single();
  return { title: project?.name ?? "Project" };
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function ProjectDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ deployment?: string }>;
}) {
  const { id } = await params;
  const { deployment: deploymentIdParam } = await searchParams;
  const supabase = await createServerClient();

  const { data: project } = await supabase
    .from("projects")
    .select("*")
    .eq("id", id)
    .single();

  if (!project) notFound();
  const p = project as Project;

  const { data: latestDeployment } = deploymentIdParam
    ? await supabase
        .from("deployments")
        .select("*")
        .eq("id", deploymentIdParam)
        .eq("project_id", id)
        .maybeSingle()
    : await supabase
        .from("deployments")
        .select("*")
        .eq("project_id", id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

  const deployment = latestDeployment as Deployment | null;
  const logs: LogLine[] = Array.isArray(deployment?.logs) ? (deployment.logs as LogLine[]) : [];

  // Determine available actions
  const { data: recentDeploys } = await supabase
    .from("deployments")
    .select("id, modules")
    .eq("project_id", id)
    .neq("action", "destroy")
    .neq("action", "plan")
    .order("created_at", { ascending: false })
    .limit(20);

  const hasDeployedModules = (recentDeploys ?? []).some(
    (d) => Array.isArray(d.modules) && d.modules.length > 0
  );

  const isIdle    = ["success", "failed", "destroyed"].includes(p.status);
  const canRedeploy   = isIdle;
  const canDestroy    = (p.status === "success" || p.status === "failed" || p.status === "destroying") && hasDeployedModules;
  const canTestDeploy = isIdle && hasDeployedModules;
  const canPreview    = isIdle && hasDeployedModules;

  return (
    <div className="p-8 max-w-5xl mx-auto">
      {/* Destroying banner */}
      {p.status === "destroying" && (
        <div className="mb-6 flex items-center gap-3 px-4 py-3 rounded-xl bg-red-950/40 border border-red-900/50 text-red-400 text-sm">
          <Loader2 className="w-4 h-4 animate-spin shrink-0" />
          <span>Tearing down AWS infrastructure — this takes 5–10 minutes. Do not close this tab.</span>
        </div>
      )}

      {/* Page header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-white">{p.name}</h1>
        <p className="text-sm text-gray-500 mt-1">
          {p.repo_url.replace("https://github.com/", "")} · {p.aws_region}
          {p.aws_account_id && <span className="font-mono text-orange-500/70 ml-2">{p.aws_account_id}</span>}
        </p>
      </div>

      {/* Tabbed interface */}
      <ProjectTabs
        project={p}
        deployment={deployment}
        logs={logs}
        canRedeploy={canRedeploy}
        canDestroy={canDestroy}
        canTestDeploy={canTestDeploy}
        canPreview={canPreview}
      />
    </div>
  );
}
