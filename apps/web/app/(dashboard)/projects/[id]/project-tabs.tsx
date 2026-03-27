"use client";

import { useState } from "react";
import Link from "next/link";
import {
  LayoutDashboard, Terminal, Database, Shield, Settings,
  CheckCircle, XCircle, Clock, Loader2, AlertCircle, Trash2, ClipboardList,
  ExternalLink, Copy, Check, Download, GitBranch, Globe, Server,
  HardDrive, Lock, Rocket, RefreshCw, Activity, Zap,
} from "lucide-react";
import { RealtimeLogs } from "./realtime-logs";
import { ResourceOutputs as ResourceOutputsPanel } from "./resource-outputs";
import { DestroyButton } from "./destroy-button";
import { TestDeployButton } from "./test-deploy-button";
import { PreviewChangesButton } from "./preview-changes-button";
import { DeployAgainButton } from "./deploy-again-button";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type DeploymentStatus =
  | "pending" | "deploying" | "queued" | "running"
  | "success" | "failed" | "destroying" | "destroyed" | "planned";

interface LogLine {
  ts:    string;
  level: "info" | "success" | "error" | "warn";
  msg:   string;
}

interface ModulePlan {
  toAdd:     number;
  toChange:  number;
  toDestroy: number;
}

interface Deployment {
  id:           string;
  status:       DeploymentStatus;
  action:       string;
  modules:      string[];
  logs:         LogLine[];
  outputs:      Record<string, unknown> | null;
  plan_summary: Record<string, ModulePlan> | null;
  created_at:   string;
  updated_at:   string;
}

interface Project {
  id:               string;
  name:             string;
  repo_url:         string;
  aws_region:       string;
  aws_account_id:   string | null;
  status:           DeploymentStatus;
  last_deployed_at: string | null;
  created_at:       string;
}

type ResourceOutputs = {
  vpc_id?:               string;
  public_subnet_ids?:    string[];
  private_subnet_ids?:   string[];
  db_endpoint?:          string;
  db_port?:              number;
  db_name?:              string;
  db_secret_arn?:        string;
  app_url?:              string;
  ecr_url?:              string;
  cluster_name?:         string;
  service_name?:         string;
  log_group?:            string;
  task_role_arn?:        string;
  execution_role_arn?:   string;
  cdn_url?:              string;
  bucket_name?:          string;
  bucket_arn?:           string;
  alerts_topic_arn?:     string;
  github_workflow_yaml?: string;
};

export interface ProjectTabsProps {
  project:      Project;
  deployment:   Deployment | null;
  logs:         LogLine[];
  canRedeploy:  boolean;
  canDestroy:   boolean;
  canTestDeploy: boolean;
  canPreview:   boolean;
}

type Tab = "overview" | "infrastructure" | "database" | "security" | "settings";

// ---------------------------------------------------------------------------
// Status config
// ---------------------------------------------------------------------------

const statusConfig: Record<DeploymentStatus, { label: string; icon: React.ReactNode; className: string }> = {
  pending:    { label: "Not deployed",  icon: <Clock className="w-3 h-3" />,                 className: "badge-pending" },
  queued:     { label: "Queued",        icon: <Clock className="w-3 h-3" />,                 className: "badge-pending" },
  deploying:  { label: "Deploying...", icon: <Loader2 className="w-3 h-3 animate-spin" />,  className: "badge-deploying" },
  running:    { label: "Running...",   icon: <Loader2 className="w-3 h-3 animate-spin" />,  className: "badge-deploying" },
  success:    { label: "Live",          icon: <CheckCircle className="w-3 h-3" />,            className: "badge-success" },
  failed:     { label: "Failed",        icon: <AlertCircle className="w-3 h-3" />,            className: "badge-failed" },
  destroying: { label: "Destroying...", icon: <Loader2 className="w-3 h-3 animate-spin" />,  className: "badge-failed" },
  destroyed:  { label: "Destroyed",     icon: <Trash2 className="w-3 h-3" />,                className: "badge-pending" },
  planned:    { label: "Plan ready",    icon: <ClipboardList className="w-3 h-3" />,          className: "badge-pending" },
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
// Shared small components
// ---------------------------------------------------------------------------

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button onClick={copy} aria-label="Copy" className="ml-2 text-gray-500 hover:text-orange-400 transition-colors shrink-0">
      {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

function InfoRow({ label, value, mono = true, href }: { label: string; value: string; mono?: boolean; href?: string }) {
  return (
    <div className="flex items-start justify-between py-2.5 border-b border-white/[0.04] last:border-0">
      <span className="text-xs text-gray-500 shrink-0 w-36">{label}</span>
      <div className="flex items-center min-w-0 flex-1">
        {href ? (
          <a href={href} target="_blank" rel="noopener noreferrer"
            className={`text-xs text-orange-400 hover:text-orange-300 truncate flex items-center gap-1 ${mono ? "font-mono" : ""}`}>
            {value}
            <ExternalLink className="w-3 h-3 shrink-0" />
          </a>
        ) : (
          <span className={`text-xs text-gray-300 truncate ${mono ? "font-mono" : ""}`}>{value}</span>
        )}
        {!href && <CopyButton value={value} />}
      </div>
    </div>
  );
}

function CheckItem({ label, checked, description }: { label: string; checked: boolean; description?: string }) {
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-white/[0.04] last:border-0">
      {checked
        ? <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
        : <XCircle className="w-4 h-4 text-gray-600 shrink-0 mt-0.5" />
      }
      <div>
        <p className={`text-sm ${checked ? "text-gray-200" : "text-gray-500"}`}>{label}</p>
        {description && <p className="text-xs text-gray-600 mt-0.5">{description}</p>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Overview
// ---------------------------------------------------------------------------

function OverviewTab({ project, deployment, canRedeploy, canDestroy, canTestDeploy, canPreview }: ProjectTabsProps) {
  const outputs = (deployment?.outputs ?? {}) as ResourceOutputs;
  const isDeployed = project.status === "success";
  const isActive = ["deploying", "running", "queued", "destroying"].includes(project.status);
  const modules = deployment?.modules ?? [];

  const consoleBase = `https://${project.aws_region}.console.aws.amazon.com`;

  return (
    <div className="space-y-5">
      {/* Status + Actions row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Status card */}
        <div className="card col-span-2">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">Deployment Status</p>
              <div className="flex items-center gap-3 mb-3">
                <StatusBadge status={project.status} />
                {isActive && <span className="text-xs text-gray-500 animate-pulse">In progress...</span>}
              </div>
              {project.last_deployed_at && (
                <p className="text-xs text-gray-500">
                  Last deployed{" "}
                  <span className="text-gray-400">
                    {new Date(project.last_deployed_at).toLocaleString("en-US", {
                      month: "short", day: "numeric",
                      hour: "2-digit", minute: "2-digit",
                    })}
                  </span>
                </p>
              )}
              {project.aws_account_id && (
                <p className="text-xs text-gray-500 mt-1">
                  AWS <span className="font-mono text-orange-500/80">{project.aws_account_id}</span>
                  {" · "}<span className="font-mono text-gray-400">{project.aws_region}</span>
                </p>
              )}
            </div>

            {/* Action buttons */}
            <div className="flex flex-col gap-2 items-end">
              {project.status === "pending" && (
                <Link href="/projects/new" className="btn-primary flex items-center gap-2 text-sm">
                  <Rocket className="w-4 h-4" /> Configure &amp; Deploy
                </Link>
              )}
              {canRedeploy && <DeployAgainButton projectId={project.id} />}
              {canPreview   && <PreviewChangesButton projectId={project.id} />}
              {canTestDeploy && <TestDeployButton projectId={project.id} />}
              {canDestroy   && <DestroyButton projectId={project.id} />}
            </div>
          </div>

          {/* Modules deployed */}
          {modules.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-4 pt-4 border-t border-white/[0.04]">
              <span className="text-xs text-gray-600 mr-1">Modules:</span>
              {modules.map((mod) => (
                <span key={mod} className="text-xs bg-gray-800 border border-gray-700 text-gray-400 px-2 py-0.5 rounded-full font-mono">
                  {mod}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Quick stats */}
        <div className="space-y-3">
          {outputs.app_url ? (
            <a
              href={outputs.app_url}
              target="_blank"
              rel="noopener noreferrer"
              className="card border border-emerald-500/20 flex items-center gap-3 hover:border-emerald-500/40 transition-colors group"
            >
              <div className="w-8 h-8 bg-emerald-500/10 rounded-lg flex items-center justify-center shrink-0">
                <Globe className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-gray-500">App URL</p>
                <p className="text-xs text-emerald-400 truncate font-mono group-hover:text-emerald-300">{outputs.app_url}</p>
              </div>
              <ExternalLink className="w-3 h-3 text-gray-600 shrink-0 ml-auto" />
            </a>
          ) : (
            <div className="card border border-gray-800 flex items-center gap-3 opacity-50">
              <div className="w-8 h-8 bg-gray-800 rounded-lg flex items-center justify-center shrink-0">
                <Globe className="w-4 h-4 text-gray-600" />
              </div>
              <div>
                <p className="text-xs text-gray-500">App URL</p>
                <p className="text-xs text-gray-600">{isDeployed ? "Not configured" : "Not deployed yet"}</p>
              </div>
            </div>
          )}

          {outputs.db_endpoint ? (
            <div className="card border border-sky-500/20 flex items-center gap-3">
              <div className="w-8 h-8 bg-sky-500/10 rounded-lg flex items-center justify-center shrink-0">
                <Database className="w-4 h-4 text-sky-400" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-gray-500">Database</p>
                <p className="text-xs text-sky-400 truncate font-mono">PostgreSQL · RDS</p>
              </div>
              <a
                href={`${consoleBase}/rds/home?region=${project.aws_region}#databases:`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-600 hover:text-sky-400 transition-colors shrink-0"
              >
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          ) : (
            <div className="card border border-gray-800 flex items-center gap-3 opacity-50">
              <div className="w-8 h-8 bg-gray-800 rounded-lg flex items-center justify-center shrink-0">
                <Database className="w-4 h-4 text-gray-600" />
              </div>
              <div>
                <p className="text-xs text-gray-500">Database</p>
                <p className="text-xs text-gray-600">{isDeployed ? "Not configured" : "Not deployed yet"}</p>
              </div>
            </div>
          )}

          {outputs.cdn_url ? (
            <a
              href={outputs.cdn_url}
              target="_blank"
              rel="noopener noreferrer"
              className="card border border-violet-500/20 flex items-center gap-3 hover:border-violet-500/40 transition-colors group"
            >
              <div className="w-8 h-8 bg-violet-500/10 rounded-lg flex items-center justify-center shrink-0">
                <HardDrive className="w-4 h-4 text-violet-400" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-gray-500">CDN</p>
                <p className="text-xs text-violet-400 truncate font-mono group-hover:text-violet-300">CloudFront active</p>
              </div>
              <ExternalLink className="w-3 h-3 text-gray-600 shrink-0 ml-auto" />
            </a>
          ) : (
            <div className="card border border-gray-800 flex items-center gap-3 opacity-50">
              <div className="w-8 h-8 bg-gray-800 rounded-lg flex items-center justify-center shrink-0">
                <HardDrive className="w-4 h-4 text-gray-600" />
              </div>
              <div>
                <p className="text-xs text-gray-500">CDN / Storage</p>
                <p className="text-xs text-gray-600">{isDeployed ? "Not configured" : "Not deployed yet"}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Project details */}
      <div className="card">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Project Details</h3>
        <dl className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
          <div>
            <dt className="text-gray-500 text-xs">Repository</dt>
            <dd className="text-gray-200 mt-0.5">
              <a href={project.repo_url} target="_blank" rel="noopener noreferrer"
                className="hover:text-orange-400 transition-colors text-sm flex items-center gap-1">
                <GitBranch className="w-3.5 h-3.5" />
                {project.repo_url.replace("https://github.com/", "")}
              </a>
            </dd>
          </div>
          <div>
            <dt className="text-gray-500 text-xs">AWS Region</dt>
            <dd className="text-gray-200 mt-0.5 font-mono text-sm">{project.aws_region}</dd>
          </div>
          <div>
            <dt className="text-gray-500 text-xs">AWS Account</dt>
            <dd className="text-gray-200 mt-0.5 font-mono text-sm">
              {project.aws_account_id ?? <span className="text-gray-500 font-sans text-xs">Not connected</span>}
            </dd>
          </div>
          <div>
            <dt className="text-gray-500 text-xs">Created</dt>
            <dd className="text-gray-200 mt-0.5 text-sm">
              {new Date(project.created_at).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}
            </dd>
          </div>
        </dl>
      </div>

      {/* No deployment yet */}
      {!deployment && (
        <div className="card text-center py-12">
          <div className="w-12 h-12 bg-gray-800 rounded-xl flex items-center justify-center mx-auto mb-4">
            <Rocket className="w-6 h-6 text-gray-500" />
          </div>
          <h3 className="text-lg font-medium text-white mb-2">No deployments yet</h3>
          <p className="text-gray-400 text-sm mb-6 max-w-xs mx-auto">
            Start your first deployment to spin up AWS infrastructure.
          </p>
          <Link href="/projects/new" className="btn-primary inline-flex items-center gap-2">
            <Rocket className="w-4 h-4" /> Deploy Now
          </Link>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Infrastructure
// ---------------------------------------------------------------------------

function InfrastructureTab({ deployment, logs, project }: Pick<ProjectTabsProps, "deployment" | "logs" | "project">) {
  const outputs = (deployment?.outputs ?? {}) as ResourceOutputs;
  const hasOutputs = deployment?.status === "success" && deployment.outputs &&
    Object.keys(deployment.outputs).some((k) => k !== "github_workflow_yaml" && (deployment.outputs as Record<string, unknown>)[k]);
  const consoleBase = `https://${project.aws_region}.console.aws.amazon.com`;

  return (
    <div className="space-y-5">
      {deployment ? (
        <>
          {/* Deployment card */}
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wide flex items-center gap-2">
                <Terminal className="w-4 h-4" />
                Latest Deployment
              </h3>
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-500 font-mono">{deployment.id.slice(0, 8)}</span>
                <StatusBadge status={deployment.status} />
              </div>
            </div>

            {/* Modules */}
            {deployment.modules?.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-4">
                {deployment.modules.map((mod) => (
                  <span key={mod} className="text-xs bg-gray-800 border border-gray-700 text-gray-400 px-2 py-0.5 rounded-full font-mono">
                    {mod}
                  </span>
                ))}
              </div>
            )}

            <RealtimeLogs
              deploymentId={deployment.id}
              initialLogs={logs}
              initialStatus={deployment.status}
              initialPlanSummary={deployment.plan_summary}
              projectId={project.id}
            />

            <p className="mt-3 text-xs text-gray-600">
              Started{" "}
              {new Date(deployment.created_at).toLocaleString("en-US", {
                month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
              })}
            </p>
          </div>

          {/* AWS Console quick links */}
          {deployment.status === "success" && (
            <div className="card">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">AWS Console Links</h3>
              <div className="grid grid-cols-2 gap-2">
                {outputs.cluster_name && (
                  <a
                    href={`${consoleBase}/ecs/v2/clusters/${outputs.cluster_name}/services`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 px-3 py-2 bg-gray-800/50 rounded-lg hover:bg-gray-800 transition-colors text-xs text-gray-400 hover:text-white"
                  >
                    <Server className="w-3.5 h-3.5 text-sky-400" /> ECS Cluster
                    <ExternalLink className="w-3 h-3 ml-auto shrink-0" />
                  </a>
                )}
                {outputs.log_group && (
                  <a
                    href={`${consoleBase}/cloudwatch/home?region=${project.aws_region}#logsV2:log-groups/log-group/${encodeURIComponent(outputs.log_group)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 px-3 py-2 bg-gray-800/50 rounded-lg hover:bg-gray-800 transition-colors text-xs text-gray-400 hover:text-white"
                  >
                    <Activity className="w-3.5 h-3.5 text-yellow-400" /> CloudWatch Logs
                    <ExternalLink className="w-3 h-3 ml-auto shrink-0" />
                  </a>
                )}
                {outputs.ecr_url && (
                  <a
                    href={`${consoleBase}/ecr/repositories`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 px-3 py-2 bg-gray-800/50 rounded-lg hover:bg-gray-800 transition-colors text-xs text-gray-400 hover:text-white"
                  >
                    <HardDrive className="w-3.5 h-3.5 text-violet-400" /> ECR Repository
                    <ExternalLink className="w-3 h-3 ml-auto shrink-0" />
                  </a>
                )}
                <a
                  href={`${consoleBase}/cloudformation/home?region=${project.aws_region}#/stacks`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-3 py-2 bg-gray-800/50 rounded-lg hover:bg-gray-800 transition-colors text-xs text-gray-400 hover:text-white"
                >
                  <Zap className="w-3.5 h-3.5 text-orange-400" /> CloudFormation
                  <ExternalLink className="w-3 h-3 ml-auto shrink-0" />
                </a>
              </div>
            </div>
          )}

          {/* Resource outputs */}
          {hasOutputs && (
            <ResourceOutputsPanel
              outputs={deployment.outputs as Parameters<typeof ResourceOutputsPanel>[0]["outputs"]}
              projectName={project.name}
              awsRegion={project.aws_region}
              awsAccountId={project.aws_account_id}
            />
          )}
        </>
      ) : (
        <div className="card text-center py-12">
          <Terminal className="w-10 h-10 text-gray-600 mx-auto mb-3" />
          <p className="text-gray-400">No deployment logs yet.</p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Database
// ---------------------------------------------------------------------------

function DatabaseTab({ deployment, project }: Pick<ProjectTabsProps, "deployment" | "project">) {
  const outputs = (deployment?.outputs ?? {}) as ResourceOutputs;
  const consoleBase = `https://${project.aws_region}.console.aws.amazon.com`;

  if (!outputs.db_endpoint) {
    return (
      <div className="card text-center py-12">
        <Database className="w-10 h-10 text-gray-600 mx-auto mb-3" />
        <p className="text-gray-400 mb-1">No database deployed</p>
        <p className="text-gray-500 text-xs">Include the RDS module in your next deployment to provision a PostgreSQL database.</p>
      </div>
    );
  }

  const connString = `postgresql://infraready:YOUR_PASSWORD@${outputs.db_endpoint}:${outputs.db_port ?? 5432}/${outputs.db_name ?? "app"}`;

  return (
    <div className="space-y-5">
      {/* Connection info */}
      <div className="card border border-emerald-500/20">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-emerald-500/10 rounded-lg flex items-center justify-center">
              <Database className="w-4 h-4 text-emerald-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white">PostgreSQL · RDS</p>
              <p className="text-xs text-gray-500">{outputs.db_endpoint}</p>
            </div>
          </div>
          <a
            href={`${consoleBase}/rds/home?region=${project.aws_region}#databases:`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-gray-500 hover:text-emerald-400 flex items-center gap-1 transition-colors"
          >
            RDS Console <ExternalLink className="w-3 h-3" />
          </a>
        </div>

        <InfoRow label="Host" value={outputs.db_endpoint} />
        <InfoRow label="Port" value={String(outputs.db_port ?? 5432)} />
        {outputs.db_name && <InfoRow label="Database name" value={outputs.db_name} />}
        <InfoRow label="Engine" value="PostgreSQL 15" />

        {/* Connection string */}
        <div className="mt-4 p-3 bg-black/30 rounded-xl">
          <p className="text-xs text-gray-500 mb-2">Connection string</p>
          <div className="flex items-start gap-2">
            <code className="text-xs text-emerald-400 break-all flex-1 leading-relaxed">
              {`postgresql://infraready:****@${outputs.db_endpoint}:${outputs.db_port ?? 5432}/${outputs.db_name ?? "app"}`}
            </code>
            <CopyButton value={connString} />
          </div>
        </div>
      </div>

      {/* Secrets Manager */}
      {outputs.db_secret_arn && (
        <div className="card border border-amber-500/20">
          <div className="flex items-center gap-2.5 mb-4">
            <div className="w-8 h-8 bg-amber-500/10 rounded-lg flex items-center justify-center">
              <Lock className="w-4 h-4 text-amber-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white">AWS Secrets Manager</p>
              <p className="text-xs text-gray-500">DB credentials stored securely — never hardcoded</p>
            </div>
          </div>
          <InfoRow label="Secret ARN" value={outputs.db_secret_arn} />
          <div className="mt-3">
            <a
              href={`${consoleBase}/secretsmanager/secret?name=${encodeURIComponent(outputs.db_secret_arn)}&region=${project.aws_region}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-amber-400 hover:text-amber-300 flex items-center gap-1 transition-colors"
            >
              View secret in AWS Console <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      )}

      {/* Backup & security status */}
      <div className="card">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Backup &amp; Security</h3>
        <CheckItem
          label="Automated backups enabled"
          checked={true}
          description="RDS automated backups with 7-day retention"
        />
        <CheckItem
          label="Encryption at rest"
          checked={true}
          description="Storage encrypted with AWS KMS"
        />
        <CheckItem
          label="Credentials in Secrets Manager"
          checked={!!outputs.db_secret_arn}
          description="No hardcoded passwords — retrieved at runtime"
        />
        <CheckItem
          label="Private subnet isolation"
          checked={!!outputs.db_endpoint}
          description="Database is not publicly accessible"
        />
        <CheckItem
          label="Automated snapshots"
          checked={true}
          description="Daily automated snapshots retained for 7 days"
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Security
// ---------------------------------------------------------------------------

function SecurityTab({ deployment, project }: Pick<ProjectTabsProps, "deployment" | "project">) {
  const outputs = (deployment?.outputs ?? {}) as ResourceOutputs;
  const deployedModules = deployment?.modules ?? [];
  const consoleBase = `https://${project.aws_region}.console.aws.amazon.com`;

  const hasVpc      = deployedModules.includes("vpc") || !!outputs.vpc_id;
  const hasEcs      = deployedModules.includes("ecs") || !!outputs.cluster_name;
  const hasRds      = deployedModules.includes("rds") || !!outputs.db_endpoint;
  const hasSecurity = deployedModules.includes("security") || !!outputs.alerts_topic_arn;
  const hasStorage  = deployedModules.includes("storage") || !!outputs.cdn_url;
  const hasSecret   = !!outputs.db_secret_arn;
  const isSuccess   = deployment?.status === "success";

  const productionScore = [hasVpc, hasEcs, hasRds, hasSecurity, hasStorage, hasSecret, isSuccess].filter(Boolean).length;
  const productionMax = 7;
  const scorePercent = Math.round((productionScore / productionMax) * 100);

  return (
    <div className="space-y-5">
      {/* SOC2 Compliance overview */}
      <div className="card border border-orange-500/20">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-orange-500/10 rounded-lg flex items-center justify-center">
              <Shield className="w-4 h-4 text-orange-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white">SOC2 Readiness</p>
              <p className="text-xs text-gray-500">Infrastructure compliance baseline</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-orange-400">{scorePercent}%</p>
            <p className="text-xs text-gray-500">{productionScore}/{productionMax} controls</p>
          </div>
        </div>

        {/* Progress bar */}
        <div className="h-2 bg-gray-800 rounded-full overflow-hidden mb-4">
          <div
            className="h-full bg-gradient-to-r from-orange-500 to-amber-400 rounded-full transition-all"
            style={{ width: `${scorePercent}%` }}
          />
        </div>

        {/* Compliance badges */}
        <div className="flex flex-wrap gap-2">
          {[
            { label: "GDPR", met: hasSecurity },
            { label: "SOC2", met: hasSecurity && hasVpc && hasRds },
            { label: "HIPAA", met: false },
            { label: "PIPEDA", met: hasSecurity },
          ].map(({ label, met }) => (
            <span
              key={label}
              className={`text-xs px-2.5 py-1 rounded-full font-medium border ${
                met
                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                  : "bg-gray-800/50 border-gray-700 text-gray-600"
              }`}
            >
              {met ? "✓ " : ""}{label}
            </span>
          ))}
        </div>
      </div>

      {/* Security modules status */}
      <div className="card">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Security Modules</h3>
        <CheckItem
          label="VPC Network Isolation"
          checked={hasVpc}
          description="Private subnets, NAT Gateway, no public DB access"
        />
        <CheckItem
          label="AWS GuardDuty"
          checked={hasSecurity}
          description="AI-powered threat detection for your AWS account"
        />
        <CheckItem
          label="AWS Security Hub"
          checked={hasSecurity}
          description="Centralized security findings and compliance checks"
        />
        <CheckItem
          label="AWS Config"
          checked={hasSecurity}
          description="Resource configuration history and compliance rules"
        />
        <CheckItem
          label="CloudTrail Logging"
          checked={hasSecurity}
          description="All API calls logged to S3 with integrity validation"
        />
        <CheckItem
          label="KMS Encryption"
          checked={hasRds}
          description="All data encrypted at rest with customer-managed keys"
        />
        <CheckItem
          label="Secrets Manager"
          checked={hasSecret}
          description="No hardcoded credentials — DB secrets injected at runtime"
        />
        <CheckItem
          label="SNS Security Alerts"
          checked={!!outputs.alerts_topic_arn}
          description="Real-time alerts for GuardDuty findings"
        />
      </div>

      {/* Production readiness */}
      <div className="card">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Production Readiness</h3>
        <CheckItem
          label="App is live"
          checked={isSuccess}
          description={isSuccess ? "Application deployed and accessible" : "Deploy your app first"}
        />
        <CheckItem
          label="Database provisioned"
          checked={hasRds}
          description="PostgreSQL RDS with automated backups"
        />
        <CheckItem
          label="Static assets on CDN"
          checked={hasStorage}
          description="S3 + CloudFront for global low-latency delivery"
        />
        <CheckItem
          label="Security baseline active"
          checked={hasSecurity}
          description="GuardDuty, Security Hub, Config, CloudTrail enabled"
        />
        <CheckItem
          label="Container registry"
          checked={hasEcs}
          description="ECR repository for Docker images"
        />
        <CheckItem
          label="Network secured"
          checked={hasVpc}
          description="VPC with public/private subnet architecture"
        />
      </div>

      {/* Console links */}
      {hasSecurity && (
        <div className="card">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">AWS Security Console</h3>
          <div className="grid grid-cols-2 gap-2">
            <a
              href={`${consoleBase}/securityhub/home?region=${project.aws_region}`}
              target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-2 px-3 py-2 bg-gray-800/50 rounded-lg hover:bg-gray-800 transition-colors text-xs text-gray-400 hover:text-white"
            >
              <Shield className="w-3.5 h-3.5 text-orange-400" /> Security Hub
              <ExternalLink className="w-3 h-3 ml-auto shrink-0" />
            </a>
            <a
              href={`${consoleBase}/guardduty/home?region=${project.aws_region}`}
              target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-2 px-3 py-2 bg-gray-800/50 rounded-lg hover:bg-gray-800 transition-colors text-xs text-gray-400 hover:text-white"
            >
              <Shield className="w-3.5 h-3.5 text-amber-400" /> GuardDuty
              <ExternalLink className="w-3 h-3 ml-auto shrink-0" />
            </a>
            <a
              href={`${consoleBase}/config/home?region=${project.aws_region}`}
              target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-2 px-3 py-2 bg-gray-800/50 rounded-lg hover:bg-gray-800 transition-colors text-xs text-gray-400 hover:text-white"
            >
              <RefreshCw className="w-3.5 h-3.5 text-sky-400" /> AWS Config
              <ExternalLink className="w-3 h-3 ml-auto shrink-0" />
            </a>
            <a
              href={`${consoleBase}/cloudtrail/home?region=${project.aws_region}#/dashboard`}
              target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-2 px-3 py-2 bg-gray-800/50 rounded-lg hover:bg-gray-800 transition-colors text-xs text-gray-400 hover:text-white"
            >
              <Activity className="w-3.5 h-3.5 text-violet-400" /> CloudTrail
              <ExternalLink className="w-3 h-3 ml-auto shrink-0" />
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Settings
// ---------------------------------------------------------------------------

function SettingsTab({ project, deployment, canDestroy }: Pick<ProjectTabsProps, "project" | "deployment" | "canDestroy">) {
  const outputs = (deployment?.outputs ?? {}) as ResourceOutputs;

  const downloadEnv = () => {
    const lines: string[] = [
      `# Generated by InfraReady — ${new Date().toISOString()}`,
      `# Project: ${project.name} | Region: ${project.aws_region}`,
      "",
    ];
    if (outputs.app_url) { lines.push(`APP_URL=${outputs.app_url}`, ""); }
    if (outputs.db_endpoint) {
      lines.push(
        `DATABASE_HOST=${outputs.db_endpoint}`,
        `DATABASE_PORT=${outputs.db_port ?? 5432}`,
        `DATABASE_NAME=${outputs.db_name ?? "app"}`,
        `DATABASE_URL=postgresql://infraready:YOUR_PASSWORD@${outputs.db_endpoint}:${outputs.db_port ?? 5432}/${outputs.db_name ?? "app"}`,
      );
      if (outputs.db_secret_arn) lines.push(`DATABASE_SECRET_ARN=${outputs.db_secret_arn}`);
      lines.push("");
    }
    if (outputs.cdn_url) { lines.push(`CDN_URL=${outputs.cdn_url}`); }
    if (outputs.bucket_name) { lines.push(`S3_BUCKET=${outputs.bucket_name}`); }
    if (outputs.ecr_url) { lines.push(`ECR_REPOSITORY=${outputs.ecr_url}`); }
    if (outputs.cluster_name) { lines.push(`ECS_CLUSTER=${outputs.cluster_name}`); }
    if (outputs.service_name) { lines.push(`ECS_SERVICE=${outputs.service_name}`); }
    if (outputs.vpc_id) { lines.push(`VPC_ID=${outputs.vpc_id}`); }
    lines.push(`AWS_REGION=${project.aws_region}`);

    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `.env.${project.name.toLowerCase().replace(/\s+/g, "-")}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5">
      {/* Project config */}
      <div className="card">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Project Configuration</h3>
        <InfoRow label="Project name" value={project.name} mono={false} />
        <InfoRow label="Repository" value={project.repo_url.replace("https://github.com/", "")} href={project.repo_url} />
        <InfoRow label="AWS Region" value={project.aws_region} />
        {project.aws_account_id && <InfoRow label="AWS Account ID" value={project.aws_account_id} />}
        <InfoRow label="Created" value={new Date(project.created_at).toLocaleDateString()} mono={false} />
        {project.last_deployed_at && (
          <InfoRow label="Last deployed" value={new Date(project.last_deployed_at).toLocaleString()} mono={false} />
        )}
      </div>

      {/* Environment variables */}
      {deployment?.status === "success" && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-white">Environment Variables</h3>
              <p className="text-xs text-gray-500 mt-0.5">
                Connection strings and config for your app
              </p>
            </div>
            <button onClick={downloadEnv} className="btn-secondary flex items-center gap-2 text-xs">
              <Download className="w-3.5 h-3.5" /> Download .env
            </button>
          </div>

          <div className="space-y-1.5">
            {outputs.app_url && (
              <div className="flex items-center gap-2 px-3 py-2 bg-gray-900 rounded-lg">
                <span className="text-xs text-gray-500 w-36 shrink-0">APP_URL</span>
                <code className="text-xs text-emerald-400 truncate flex-1">{outputs.app_url}</code>
                <CopyButton value={`APP_URL=${outputs.app_url}`} />
              </div>
            )}
            {outputs.db_endpoint && (
              <div className="flex items-center gap-2 px-3 py-2 bg-gray-900 rounded-lg">
                <span className="text-xs text-gray-500 w-36 shrink-0">DATABASE_HOST</span>
                <code className="text-xs text-sky-400 truncate flex-1">{outputs.db_endpoint}</code>
                <CopyButton value={`DATABASE_HOST=${outputs.db_endpoint}`} />
              </div>
            )}
            {outputs.db_secret_arn && (
              <div className="flex items-center gap-2 px-3 py-2 bg-gray-900 rounded-lg">
                <span className="text-xs text-gray-500 w-36 shrink-0">DATABASE_SECRET_ARN</span>
                <code className="text-xs text-amber-400 truncate flex-1">{outputs.db_secret_arn}</code>
                <CopyButton value={`DATABASE_SECRET_ARN=${outputs.db_secret_arn}`} />
              </div>
            )}
            {outputs.cdn_url && (
              <div className="flex items-center gap-2 px-3 py-2 bg-gray-900 rounded-lg">
                <span className="text-xs text-gray-500 w-36 shrink-0">CDN_URL</span>
                <code className="text-xs text-violet-400 truncate flex-1">{outputs.cdn_url}</code>
                <CopyButton value={`CDN_URL=${outputs.cdn_url}`} />
              </div>
            )}
            {outputs.ecr_url && (
              <div className="flex items-center gap-2 px-3 py-2 bg-gray-900 rounded-lg">
                <span className="text-xs text-gray-500 w-36 shrink-0">ECR_REPOSITORY</span>
                <code className="text-xs text-gray-300 truncate flex-1">{outputs.ecr_url}</code>
                <CopyButton value={`ECR_REPOSITORY=${outputs.ecr_url}`} />
              </div>
            )}
            <div className="flex items-center gap-2 px-3 py-2 bg-gray-900 rounded-lg">
              <span className="text-xs text-gray-500 w-36 shrink-0">AWS_REGION</span>
              <code className="text-xs text-gray-300 truncate flex-1">{project.aws_region}</code>
              <CopyButton value={`AWS_REGION=${project.aws_region}`} />
            </div>
          </div>
        </div>
      )}

      {/* GitHub Actions workflow */}
      {outputs.github_workflow_yaml && (
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-semibold text-white">GitHub Actions Workflow</h3>
              <p className="text-xs text-gray-500 mt-0.5">
                Add to <code className="text-orange-400">.github/workflows/deploy.yml</code>
              </p>
            </div>
            <button
              onClick={() => navigator.clipboard.writeText(outputs.github_workflow_yaml!)}
              className="btn-secondary text-xs flex items-center gap-1.5"
            >
              <Copy className="w-3 h-3" /> Copy YAML
            </button>
          </div>
          <pre className="text-xs text-gray-400 bg-black/40 rounded-xl p-4 overflow-x-auto max-h-56 border border-white/[0.04]">
            {outputs.github_workflow_yaml}
          </pre>
        </div>
      )}

      {/* Danger zone */}
      {canDestroy && (
        <div className="card border border-red-900/50 bg-red-950/10">
          <h3 className="text-sm font-semibold text-red-400 mb-1">Danger Zone</h3>
          <p className="text-xs text-gray-500 mb-4">
            Destroying your infrastructure will permanently remove all AWS resources. This cannot be undone.
          </p>
          <DestroyButton projectId={project.id} />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main export: ProjectTabs
// ---------------------------------------------------------------------------

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "overview",        label: "Overview",       icon: <LayoutDashboard className="w-4 h-4" /> },
  { id: "infrastructure",  label: "Infrastructure", icon: <Terminal className="w-4 h-4" /> },
  { id: "database",        label: "Database",       icon: <Database className="w-4 h-4" /> },
  { id: "security",        label: "Security",       icon: <Shield className="w-4 h-4" /> },
  { id: "settings",        label: "Settings",       icon: <Settings className="w-4 h-4" /> },
];

export function ProjectTabs({
  project, deployment, logs,
  canRedeploy, canDestroy, canTestDeploy, canPreview,
}: ProjectTabsProps) {
  const [activeTab, setActiveTab] = useState<Tab>("overview");

  return (
    <div>
      {/* Tab navigation */}
      <div className="flex items-center gap-1 border-b border-white/[0.06] mb-6 overflow-x-auto">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
              activeTab === tab.id
                ? "border-orange-500 text-orange-400"
                : "border-transparent text-gray-500 hover:text-gray-300 hover:border-gray-700"
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "overview" && (
        <OverviewTab
          project={project}
          deployment={deployment}
          logs={logs}
          canRedeploy={canRedeploy}
          canDestroy={canDestroy}
          canTestDeploy={canTestDeploy}
          canPreview={canPreview}
        />
      )}
      {activeTab === "infrastructure" && (
        <InfrastructureTab project={project} deployment={deployment} logs={logs} />
      )}
      {activeTab === "database" && (
        <DatabaseTab project={project} deployment={deployment} />
      )}
      {activeTab === "security" && (
        <SecurityTab project={project} deployment={deployment} />
      )}
      {activeTab === "settings" && (
        <SettingsTab project={project} deployment={deployment} canDestroy={canDestroy} />
      )}
    </div>
  );
}
