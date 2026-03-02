import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";
import { Plus, GitBranch, Clock, CheckCircle, AlertCircle, Loader2 } from "lucide-react";

export const metadata = { title: "Projects" };

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

const statusConfig: Record<DeploymentStatus, { label: string; icon: React.ReactNode; className: string }> = {
  pending:   { label: "Not deployed", icon: <Clock className="w-3 h-3" />,        className: "badge-pending" },
  deploying: { label: "Deploying...", icon: <Loader2 className="w-3 h-3 animate-spin" />, className: "badge-deploying" },
  success:   { label: "Live",         icon: <CheckCircle className="w-3 h-3" />,   className: "badge-success" },
  failed:    { label: "Failed",       icon: <AlertCircle className="w-3 h-3" />,   className: "badge-failed" },
};

export default async function ProjectsPage() {
  const supabase = await createServerClient();
  const { data: projects } = await supabase
    .from("projects")
    .select("*")
    .order("created_at", { ascending: false });

  return (
    <div className="p-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-white">Projects</h1>
          <p className="text-gray-400 mt-1">Manage your AWS infrastructure deployments.</p>
        </div>
        <Link href="/projects/new" className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" />
          New Project
        </Link>
      </div>

      {/* Empty state */}
      {!projects?.length && (
        <div className="card text-center py-16">
          <div className="w-12 h-12 bg-gray-800 rounded-xl flex items-center justify-center mx-auto mb-4">
            <GitBranch className="w-6 h-6 text-gray-500" />
          </div>
          <h3 className="text-lg font-medium text-white mb-2">No projects yet</h3>
          <p className="text-gray-400 mb-6 max-w-sm mx-auto">
            Connect your GitHub repo and we'll deploy your entire AWS infrastructure in under 20 minutes.
          </p>
          <Link href="/projects/new" className="btn-primary inline-flex items-center gap-2">
            <Plus className="w-4 h-4" />
            Create your first project
          </Link>
        </div>
      )}

      {/* Project grid */}
      {projects && projects.length > 0 && (
        <div className="grid gap-4">
          {projects.map((project: Project) => {
            const status = statusConfig[project.status] ?? statusConfig.pending;
            return (
              <Link
                key={project.id}
                href={`/projects/${project.id}`}
                className="card hover:border-gray-700 transition-colors group"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-gray-800 rounded-lg flex items-center justify-center shrink-0">
                      <GitBranch className="w-5 h-5 text-gray-400" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-white group-hover:text-sky-400 transition-colors">
                        {project.name}
                      </h3>
                      <p className="text-sm text-gray-500 mt-0.5">
                        {project.repo_url?.replace("https://github.com/", "")} · {project.aws_region}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className={`flex items-center gap-1.5 ${status.className}`}>
                      {status.icon}
                      {status.label}
                    </div>
                    {project.last_deployed_at && (
                      <span className="text-xs text-gray-600">
                        {new Date(project.last_deployed_at).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
