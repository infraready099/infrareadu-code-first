import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";
import { Plus, GitBranch, Clock, CheckCircle, AlertCircle, Loader2, ChevronRight } from "lucide-react";

export const metadata = { title: "Projects — InfraReady" };

type DeploymentStatus = "pending" | "deploying" | "success" | "failed";

interface Project {
  id: string;
  name: string;
  repo_url: string;
  aws_region: string;
  status: DeploymentStatus;
  last_deployed_at: string | null;
  created_at: string;
}

const STATUS_STYLES: Record<DeploymentStatus, { label: string; dot: string; text: string; bg: string; border: string }> = {
  pending:   { label: "Not deployed", dot: "bg-slate-500",   text: "text-slate-400",  bg: "bg-slate-500/10",  border: "border-slate-500/20" },
  deploying: { label: "Deploying",    dot: "bg-sky-400 animate-pulse", text: "text-sky-400",   bg: "bg-sky-500/10",    border: "border-sky-500/20" },
  success:   { label: "Live",         dot: "bg-emerald-400", text: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/20" },
  failed:    { label: "Failed",       dot: "bg-red-400",     text: "text-red-400",     bg: "bg-red-500/10",     border: "border-red-500/20" },
};

const STATUS_ICONS: Record<DeploymentStatus, React.ReactNode> = {
  pending:   <Clock className="w-3 h-3" />,
  deploying: <Loader2 className="w-3 h-3 animate-spin" />,
  success:   <CheckCircle className="w-3 h-3" />,
  failed:    <AlertCircle className="w-3 h-3" />,
};

function StatusBadge({ status }: { status: DeploymentStatus }) {
  const s = STATUS_STYLES[status] ?? STATUS_STYLES.pending;
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${s.text} ${s.bg} ${s.border}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${s.dot}`} />
      {s.label}
    </span>
  );
}

export default async function ProjectsPage() {
  const supabase = await createServerClient();
  const { data: projects } = await supabase
    .from("projects")
    .select("*")
    .order("created_at", { ascending: false });

  return (
    <div className="p-8 max-w-5xl mx-auto">

      {/* Page header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight" style={{ color: "#F0F9FF" }}>
            Projects
          </h1>
          <p className="text-sm mt-1" style={{ color: "#64748B" }}>
            Manage your AWS infrastructure deployments.
          </p>
        </div>

        <Link
          href="/projects/new"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white transition-all duration-150"
          style={{
            background: "#0EA5E9",
            boxShadow: "0 0 20px rgba(14,165,233,0.25)",
          }}
        >
          <Plus className="w-4 h-4" />
          New Project
        </Link>
      </div>

      {/* Empty state */}
      {!projects?.length && (
        <div
          className="rounded-2xl border text-center py-20 px-8"
          style={{
            background: "rgba(255,255,255,0.02)",
            borderColor: "rgba(255,255,255,0.07)",
          }}
        >
          {/* Icon */}
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-5"
            style={{
              background: "rgba(14,165,233,0.08)",
              border: "1px solid rgba(14,165,233,0.15)",
            }}
          >
            <GitBranch className="w-6 h-6" style={{ color: "#38BDF8" }} />
          </div>

          <h3
            className="text-lg font-semibold mb-2 tracking-tight"
            style={{ color: "#F0F9FF" }}
          >
            No projects yet
          </h3>
          <p className="text-sm mb-8 max-w-sm mx-auto leading-relaxed" style={{ color: "#64748B" }}>
            Connect your GitHub repo and we&apos;ll deploy your entire AWS infrastructure in under 20 minutes. No DevOps required.
          </p>

          <Link
            href="/projects/new"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-all duration-150"
            style={{
              background: "#0EA5E9",
              boxShadow: "0 0 24px rgba(14,165,233,0.3)",
            }}
          >
            <Plus className="w-4 h-4" />
            Create your first project
          </Link>
        </div>
      )}

      {/* Project list */}
      {projects && projects.length > 0 && (
        <div className="space-y-2">
          {projects.map((project: Project) => {
            const repoShort = project.repo_url?.replace("https://github.com/", "") ?? "";

            return (
              <Link
                key={project.id}
                href={`/projects/${project.id}`}
                className="flex items-center gap-4 px-5 py-4 rounded-xl border group transition-all duration-150"
                style={{
                  background: "rgba(255,255,255,0.02)",
                  borderColor: "rgba(255,255,255,0.07)",
                }}
              >
                {/* Repo icon */}
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-colors duration-150"
                  style={{
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.07)",
                  }}
                >
                  <GitBranch className="w-4 h-4" style={{ color: "#475569" }} />
                </div>

                {/* Name + meta */}
                <div className="flex-1 min-w-0">
                  <p
                    className="text-sm font-semibold truncate leading-tight"
                    style={{ color: "#F0F9FF" }}
                  >
                    {project.name}
                  </p>
                  <p className="text-xs mt-0.5 truncate" style={{ color: "#475569" }}>
                    {repoShort}
                    {project.aws_region && (
                      <>
                        <span className="mx-1.5" style={{ color: "#1E293B" }}>·</span>
                        {project.aws_region}
                      </>
                    )}
                  </p>
                </div>

                {/* Status + date */}
                <div className="flex items-center gap-4 shrink-0">
                  <StatusBadge status={project.status} />

                  {project.last_deployed_at && (
                    <span className="text-xs hidden sm:block" style={{ color: "#334155" }}>
                      {new Date(project.last_deployed_at).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                  )}

                  <ChevronRight
                    className="w-4 h-4 transition-transform duration-150 group-hover:translate-x-0.5"
                    style={{ color: "#334155" }}
                  />
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
