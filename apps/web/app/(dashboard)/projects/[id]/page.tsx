import { notFound } from "next/navigation";
import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";
import {
  GitBranch,
  Globe,
  Clock,
  CheckCircle,
  AlertCircle,
  Loader2,
  RefreshCw,
  Rocket,
  Terminal,
} from "lucide-react";
import { Metadata } from "next";
import { RealtimeLogs } from "./realtime-logs";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type DeploymentStatus = "pending" | "deploying" | "queued" | "running" | "success" | "failed";

interface LogLine {
  ts:    string;
  level: "info" | "success" | "error" | "warn";
  msg:   string;
}

interface Project {
  id: string;
  name: string;
  repo_url: string;
  aws_region: string;
  aws_account_id: string | null;
  status: DeploymentStatus;
  last_deployed_at: string | null;
  created_at: string;
}

interface Deployment {
  id: string;
  status: DeploymentStatus;
  modules: string[];
  logs: LogLine[];
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Status config
// ---------------------------------------------------------------------------

const statusConfig: Record<
  DeploymentStatus,
  { label: string; icon: React.ReactNode; className: string }
> = {
  pending:   { label: "Not deployed",  icon: <Clock className="w-3 h-3" />,                    className: "badge-pending" },
  queued:    { label: "Queued",         icon: <Clock className="w-3 h-3" />,                    className: "badge-pending" },
  deploying: { label: "Deploying...",   icon: <Loader2 className="w-3 h-3 animate-spin" />,     className: "badge-deploying" },
  running:   { label: "Running...",     icon: <Loader2 className="w-3 h-3 animate-spin" />,     className: "badge-deploying" },
  success:   { label: "Live",           icon: <CheckCircle className="w-3 h-3" />,               className: "badge-success" },
  failed:    { label: "Failed",         icon: <AlertCircle className="w-3 h-3" />,               className: "badge-failed" },
};

function StatusBadge({ status }: { status: DeploymentStatus }) {
  const cfg = statusConfig[status] ?? statusConfig.pending;
  return (
    <span className={`flex items-center gap-1.5 ${cfg.className}`}>
      {cfg.icon}
      {cfg.label}
    </span>
  );
}

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
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createServerClient();

  // Load project (RLS ensures it belongs to the authenticated user)
  const { data: project } = await supabase
    .from("projects")
    .select("*")
    .eq("id", id)
    .single();

  if (!project) notFound();

  const p = project as Project;

  // Load the latest deployment for this project
  const { data: latestDeployment } = await supabase
    .from("deployments")
    .select("*")
    .eq("project_id", id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const deployment = latestDeployment as Deployment | null;
  const logs: LogLine[] = Array.isArray(deployment?.logs) ? (deployment.logs as LogLine[]) : [];

  const canRedeploy = p.status === "success" || p.status === "failed";

  return (
    <div className="p-8 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-semibold text-white">{p.name}</h1>
            <StatusBadge status={p.status} />
          </div>
          <div className="flex items-center gap-4 text-sm text-gray-500">
            <span className="flex items-center gap-1.5">
              <GitBranch className="w-3.5 h-3.5" />
              {p.repo_url.replace("https://github.com/", "")}
            </span>
            <span className="flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5" />
              {p.aws_region}
            </span>
            {p.aws_account_id && (
              <span className="font-mono text-sky-500/80">
                {p.aws_account_id}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {canRedeploy && (
            <Link
              href={`/projects/new?redeploy=${p.id}`}
              className="btn-secondary flex items-center gap-2 text-sm"
            >
              <RefreshCw className="w-4 h-4" />
              Deploy Again
            </Link>
          )}
          {p.status === "pending" && (
            <Link
              href={`/projects/new`}
              className="btn-primary flex items-center gap-2 text-sm"
            >
              <Rocket className="w-4 h-4" />
              Configure &amp; Deploy
            </Link>
          )}
        </div>
      </div>

      <div className="space-y-6">
        {/* Project details card */}
        <div className="card">
          <h2 className="text-sm font-semibold text-gray-300 mb-4 uppercase tracking-wide">
            Project details
          </h2>
          <dl className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
            <div>
              <dt className="text-gray-500">Repository</dt>
              <dd className="text-gray-200 mt-0.5">
                <a
                  href={p.repo_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-sky-400 transition-colors"
                >
                  {p.repo_url.replace("https://github.com/", "")}
                </a>
              </dd>
            </div>
            <div>
              <dt className="text-gray-500">AWS Region</dt>
              <dd className="text-gray-200 mt-0.5 font-mono">{p.aws_region}</dd>
            </div>
            <div>
              <dt className="text-gray-500">AWS Account</dt>
              <dd className="text-gray-200 mt-0.5 font-mono">
                {p.aws_account_id ?? (
                  <span className="text-gray-500 font-sans">Not connected</span>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-gray-500">Created</dt>
              <dd className="text-gray-200 mt-0.5">
                {new Date(p.created_at).toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                })}
              </dd>
            </div>
            {p.last_deployed_at && (
              <div>
                <dt className="text-gray-500">Last deployed</dt>
                <dd className="text-gray-200 mt-0.5">
                  {new Date(p.last_deployed_at).toLocaleString("en-US", {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </dd>
              </div>
            )}
          </dl>
        </div>

        {/* Latest deployment */}
        {deployment ? (
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wide flex items-center gap-2">
                <Terminal className="w-4 h-4" />
                Latest deployment
              </h2>
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-500 font-mono">{deployment.id.slice(0, 8)}</span>
                <StatusBadge status={deployment.status} />
              </div>
            </div>

            {/* Modules deployed */}
            {deployment.modules && deployment.modules.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-4">
                {deployment.modules.map((mod) => (
                  <span
                    key={mod}
                    className="text-xs bg-gray-800 border border-gray-700 text-gray-400 px-2 py-0.5 rounded-full font-mono"
                  >
                    {mod}
                  </span>
                ))}
              </div>
            )}

            {/* Live log output — subscribes to Supabase Realtime while deploying */}
            <RealtimeLogs
              deploymentId={deployment.id}
              initialLogs={logs}
              initialStatus={deployment.status}
            />

            <p className="mt-3 text-xs text-gray-600">
              Started{" "}
              {new Date(deployment.created_at).toLocaleString("en-US", {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          </div>
        ) : (
          /* No deployments yet */
          <div className="card text-center py-12">
            <div className="w-12 h-12 bg-gray-800 rounded-xl flex items-center justify-center mx-auto mb-4">
              <Rocket className="w-6 h-6 text-gray-500" />
            </div>
            <h3 className="text-lg font-medium text-white mb-2">No deployments yet</h3>
            <p className="text-gray-400 text-sm mb-6 max-w-xs mx-auto">
              Start your first deployment to spin up AWS infrastructure for this project.
            </p>
            <Link href="/projects/new" className="btn-primary inline-flex items-center gap-2">
              <Rocket className="w-4 h-4" />
              Deploy Now
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
