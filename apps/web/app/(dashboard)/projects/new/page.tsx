"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Github,
  ExternalLink,
  CheckCircle,
  Loader2,
  AlertCircle,
  ArrowLeft,
  Rocket,
  Shield,
  Database,
  Box,
  Globe,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Step = 1 | 2 | 3;

interface StepOneData {
  repoUrl: string;
  projectName: string;
}

interface StepTwoData {
  externalId: string;
  roleArn: string;
  accountId: string;
}

type DbEngine = "postgres" | "mysql";
type Environment = "production" | "staging";

interface StepThreeData {
  awsRegion: string;
  environment: Environment;
  modules: {
    ecs: boolean;
    rds: boolean;
    storage: boolean;
    security: boolean;
  };
  containerPort: number;
  containerCpu: number;
  containerMemory: number;
  dbEngine: DbEngine;
  dbInstance: string;
  alertEmail: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateExternalId(): string {
  // crypto.randomUUID is available in all modern browsers
  return crypto.randomUUID();
}

function repoNameFromUrl(url: string): string {
  try {
    const parts = new URL(url).pathname.replace(/^\//, "").replace(/\/$/, "").split("/");
    return parts[1] ?? "";
  } catch {
    return "";
  }
}

function isValidGithubUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.hostname === "github.com" && parsed.pathname.split("/").filter(Boolean).length >= 2;
  } catch {
    return false;
  }
}

function isValidRoleArn(arn: string): boolean {
  return /^arn:aws:iam::\d{12}:role\/.+$/.test(arn);
}

// ---------------------------------------------------------------------------
// Step indicator
// ---------------------------------------------------------------------------

const STEPS = [
  { num: 1, label: "Repository" },
  { num: 2, label: "AWS Account" },
  { num: 3, label: "Configure" },
];

function StepIndicator({ current }: { current: Step }) {
  return (
    <div className="flex items-center gap-0 mb-8">
      {STEPS.map((s, i) => {
        const state: "active" | "done" | "pending" =
          s.num === current ? "active" : s.num < current ? "done" : "pending";
        return (
          <div key={s.num} className="flex items-center">
            <div className="wizard-step">
              <div className={`wizard-step-num ${state}`}>
                {state === "done" ? <CheckCircle className="w-4 h-4" /> : s.num}
              </div>
              <span
                className={`text-sm font-medium ${
                  state === "active"
                    ? "text-white"
                    : state === "done"
                    ? "text-green-400"
                    : "text-gray-500"
                }`}
              >
                {s.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div
                className={`w-12 h-px mx-3 ${
                  s.num < current ? "bg-green-700" : "bg-gray-800"
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 1 — Connect GitHub Repo
// ---------------------------------------------------------------------------

function StepOne({
  data,
  onChange,
  onContinue,
}: {
  data: StepOneData;
  onChange: (patch: Partial<StepOneData>) => void;
  onContinue: () => Promise<void>;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const urlError = data.repoUrl && !isValidGithubUrl(data.repoUrl)
    ? "Must be a valid github.com repository URL (e.g. https://github.com/username/my-app)"
    : "";

  async function handleContinue() {
    if (!isValidGithubUrl(data.repoUrl)) {
      setError("Please enter a valid GitHub repository URL.");
      return;
    }
    if (!data.projectName.trim()) {
      setError("Project name is required.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      await onContinue();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-9 h-9 bg-gray-800 rounded-lg flex items-center justify-center shrink-0">
          <Github className="w-5 h-5 text-gray-300" />
        </div>
        <div>
          <h2 className="font-semibold text-white">Connect your GitHub repository</h2>
          <p className="text-sm text-gray-400">
            We&apos;ll deploy infrastructure for this repo.
          </p>
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1.5">
            Repository URL
          </label>
          <input
            type="url"
            placeholder="https://github.com/username/my-app"
            value={data.repoUrl}
            onChange={(e) => {
              const url = e.target.value;
              const autoName = repoNameFromUrl(url);
              onChange({ repoUrl: url, ...(autoName ? { projectName: autoName } : {}) });
            }}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent"
          />
          {urlError && (
            <p className="mt-1.5 text-xs text-red-400">{urlError}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1.5">
            Project name
          </label>
          <input
            type="text"
            placeholder="my-app"
            value={data.projectName}
            onChange={(e) => onChange({ projectName: e.target.value })}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent"
          />
          <p className="mt-1.5 text-xs text-gray-500">
            This is the display name for your project inside InfraReady.
          </p>
        </div>

        {error && (
          <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-red-900/30 border border-red-800/50 text-sm text-red-400">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            {error}
          </div>
        )}

        <button
          onClick={handleContinue}
          disabled={loading || !!urlError || !data.repoUrl || !data.projectName}
          className="btn-primary w-full flex items-center justify-center gap-2"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          {loading ? "Creating project..." : "Continue"}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 2 — Connect AWS Account
// ---------------------------------------------------------------------------

function StepTwo({
  data,
  projectId,
  onChange,
  onContinue,
  onBack,
}: {
  data: StepTwoData;
  projectId: string;
  onChange: (patch: Partial<StepTwoData>) => void;
  onContinue: () => void;
  onBack: () => void;
}) {
  const [cfClicked, setCfClicked] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState("");

  const cfUrl =
    `https://console.aws.amazon.com/cloudformation/home#/stacks/create/review` +
    `?templateURL=https://infraready-public.s3.amazonaws.com/bootstrap-role.yaml` +
    `&stackName=InfraReadyRole` +
    `&param_ExternalId=${data.externalId}`;

  async function handleVerify() {
    if (!isValidRoleArn(data.roleArn)) {
      setVerifyError("Invalid ARN format. Must match arn:aws:iam::<account-id>:role/<role-name>");
      return;
    }
    setVerifyError("");
    setVerifying(true);

    try {
      const res = await fetch("/api/aws/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, roleArn: data.roleArn }),
      });
      const json = await res.json() as { success?: boolean; accountId?: string; error?: string };

      if (!res.ok || !json.success) {
        setVerifyError(json.error ?? "Verification failed. Please check the role ARN and try again.");
        return;
      }

      onChange({ accountId: json.accountId ?? "" });
      onContinue();
    } catch {
      setVerifyError("Network error. Please try again.");
    } finally {
      setVerifying(false);
    }
  }

  const isConnected = !!data.accountId;
  const arnError = data.roleArn && !isValidRoleArn(data.roleArn)
    ? "Must match arn:aws:iam::<12-digit-account-id>:role/<role-name>"
    : "";

  return (
    <div className="card">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-9 h-9 bg-gray-800 rounded-lg flex items-center justify-center shrink-0">
          <Shield className="w-5 h-5 text-gray-300" />
        </div>
        <div>
          <h2 className="font-semibold text-white">Connect your AWS account</h2>
          <p className="text-sm text-gray-400">
            We need read/write access to deploy infrastructure into your account.
          </p>
        </div>
      </div>

      <div className="space-y-5">
        {/* Step 2a — Launch CloudFormation */}
        <div className="bg-gray-800/60 border border-gray-700 rounded-lg p-4 space-y-3">
          <div className="flex items-start gap-2">
            <div className="w-5 h-5 rounded-full bg-sky-500/20 border border-sky-500/40 flex items-center justify-center shrink-0 mt-0.5">
              <span className="text-xs text-sky-400 font-semibold">1</span>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-200">
                Create the IAM role in your AWS account
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                Click the button below. This opens AWS CloudFormation in a new tab and creates a
                least-privilege IAM role that InfraReady will use to deploy your infrastructure.
              </p>
            </div>
          </div>

          <a
            href={cfUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setCfClicked(true)}
            className="btn-secondary inline-flex items-center gap-2 text-sm"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Launch CloudFormation Stack
          </a>

          {cfClicked && (
            <p className="text-xs text-sky-400 flex items-center gap-1.5">
              <CheckCircle className="w-3.5 h-3.5" />
              CloudFormation opened — come back here once the stack shows CREATE_COMPLETE.
            </p>
          )}

          {/* ExternalId for reference */}
          <div>
            <p className="text-xs text-gray-500 mb-1">Your External ID (pre-filled in the stack):</p>
            <code className="text-xs bg-gray-900 border border-gray-700 rounded px-2 py-1 text-sky-300 font-mono break-all">
              {data.externalId}
            </code>
          </div>
        </div>

        {/* Step 2b — Paste Role ARN */}
        <div className="bg-gray-800/60 border border-gray-700 rounded-lg p-4 space-y-3">
          <div className="flex items-start gap-2">
            <div className="w-5 h-5 rounded-full bg-sky-500/20 border border-sky-500/40 flex items-center justify-center shrink-0 mt-0.5">
              <span className="text-xs text-sky-400 font-semibold">2</span>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-200">
                Paste your IAM Role ARN
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                Found in the CloudFormation stack Outputs tab after CREATE_COMPLETE.
              </p>
            </div>
          </div>

          {isConnected ? (
            <div className="flex items-center gap-2 text-green-400 text-sm">
              <CheckCircle className="w-4 h-4" />
              <span>
                AWS account{" "}
                <span className="font-mono text-green-300">{data.accountId}</span> connected
              </span>
            </div>
          ) : (
            <>
              <input
                type="text"
                placeholder="arn:aws:iam::123456789012:role/InfraReadyRole"
                value={data.roleArn}
                onChange={(e) => onChange({ roleArn: e.target.value })}
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 font-mono focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent"
              />
              {arnError && (
                <p className="text-xs text-red-400">{arnError}</p>
              )}
              {verifyError && (
                <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-red-900/30 border border-red-800/50 text-sm text-red-400">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  {verifyError}
                </div>
              )}
              <button
                onClick={handleVerify}
                disabled={verifying || !data.roleArn || !!arnError}
                className="btn-primary flex items-center gap-2 text-sm"
              >
                {verifying ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <CheckCircle className="w-4 h-4" />
                )}
                {verifying ? "Verifying..." : "Verify Connection"}
              </button>
            </>
          )}
        </div>

        {/* Back */}
        <button onClick={onBack} className="btn-secondary flex items-center gap-2 text-sm">
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 3 — Configure & Deploy
// ---------------------------------------------------------------------------

const AWS_REGIONS = [
  { value: "us-east-1",      label: "US East (N. Virginia)" },
  { value: "us-west-2",      label: "US West (Oregon)" },
  { value: "eu-west-1",      label: "Europe (Ireland)" },
  { value: "ap-southeast-1", label: "Asia Pacific (Singapore)" },
];

function ModuleCard({
  icon,
  title,
  description,
  checked,
  disabled,
  onChange,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  checked: boolean;
  disabled: boolean;
  onChange: (val: boolean) => void;
}) {
  return (
    <label
      className={`flex items-start gap-3 p-3.5 rounded-lg border transition-colors cursor-pointer ${
        disabled
          ? "border-sky-800/50 bg-sky-900/10 cursor-not-allowed"
          : checked
          ? "border-sky-700/60 bg-sky-900/20"
          : "border-gray-700 bg-gray-800/40 hover:border-gray-600"
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 accent-sky-500"
      />
      <div className="flex items-start gap-2.5">
        <div className="text-gray-400 mt-0.5 shrink-0">{icon}</div>
        <div>
          <p className="text-sm font-medium text-gray-200">
            {title}
            {disabled && (
              <span className="ml-2 text-xs text-sky-400 font-normal">required</span>
            )}
          </p>
          <p className="text-xs text-gray-500 mt-0.5">{description}</p>
        </div>
      </div>
    </label>
  );
}

function StepThree({
  data,
  accountId,
  projectId,
  onChange,
  onBack,
}: {
  data: StepThreeData;
  accountId: string;
  projectId: string;
  onChange: (patch: Partial<StepThreeData>) => void;
  onBack: () => void;
}) {
  const [deploying, setDeploying] = useState(false);
  const [deployError, setDeployError] = useState("");
  const router = useRouter();

  function patchModules(patch: Partial<StepThreeData["modules"]>) {
    onChange({ modules: { ...data.modules, ...patch } });
  }

  async function handleDeploy() {
    setDeployError("");
    setDeploying(true);

    // Build module list — vpc is always included
    const modules: string[] = ["vpc"];
    if (data.modules.ecs) modules.push("ecs");
    if (data.modules.rds) modules.push("rds");
    if (data.modules.storage) modules.push("storage");
    if (data.modules.security) modules.push("security");

    const config: Record<string, unknown> = {
      aws_region: data.awsRegion,
      environment: data.environment,
      alert_email: data.alertEmail || undefined,
    };

    if (data.modules.ecs) {
      config.container_port = data.containerPort;
      config.container_cpu = data.containerCpu;
      config.container_memory = data.containerMemory;
    }

    if (data.modules.rds) {
      config.db_engine = data.dbEngine;
      config.db_instance = data.dbInstance;
    }

    try {
      const res = await fetch("/api/deploy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, modules, config }),
      });
      const json = await res.json() as { deploymentId?: string; error?: string };

      if (!res.ok || !json.deploymentId) {
        setDeployError(json.error ?? "Failed to queue deployment. Please try again.");
        return;
      }

      router.push(`/projects/${projectId}`);
    } catch {
      setDeployError("Network error. Please try again.");
    } finally {
      setDeploying(false);
    }
  }

  const inputClass =
    "w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent";

  const selectClass =
    "w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent";

  return (
    <div className="card">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-9 h-9 bg-gray-800 rounded-lg flex items-center justify-center shrink-0">
          <Rocket className="w-5 h-5 text-gray-300" />
        </div>
        <div>
          <h2 className="font-semibold text-white">Configure your infrastructure</h2>
          <p className="text-sm text-gray-400">
            Deploying to account{" "}
            <span className="font-mono text-sky-400">{accountId}</span>
          </p>
        </div>
      </div>

      <div className="space-y-6">
        {/* Region + Environment */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">AWS Region</label>
            <select
              value={data.awsRegion}
              onChange={(e) => onChange({ awsRegion: e.target.value })}
              className={selectClass}
            >
              {AWS_REGIONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">Environment</label>
            <select
              value={data.environment}
              onChange={(e) => onChange({ environment: e.target.value as Environment })}
              className={selectClass}
            >
              <option value="production">Production</option>
              <option value="staging">Staging</option>
            </select>
          </div>
        </div>

        {/* Module selection */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Infrastructure modules
          </label>
          <div className="space-y-2">
            <ModuleCard
              icon={<Globe className="w-4 h-4" />}
              title="VPC"
              description="Virtual private cloud, subnets, NAT gateway, routing"
              checked={true}
              disabled={true}
              onChange={() => {}}
            />
            <ModuleCard
              icon={<Box className="w-4 h-4" />}
              title="ECS"
              description="Run your containers on AWS Fargate — no servers to manage"
              checked={data.modules.ecs}
              disabled={false}
              onChange={(v) => patchModules({ ecs: v })}
            />
            <ModuleCard
              icon={<Database className="w-4 h-4" />}
              title="RDS"
              description="PostgreSQL or MySQL database, Multi-AZ, automated backups"
              checked={data.modules.rds}
              disabled={false}
              onChange={(v) => patchModules({ rds: v })}
            />
            <ModuleCard
              icon={<Globe className="w-4 h-4" />}
              title="Storage"
              description="S3 bucket + CloudFront CDN for static assets"
              checked={data.modules.storage}
              disabled={false}
              onChange={(v) => patchModules({ storage: v })}
            />
            <ModuleCard
              icon={<Shield className="w-4 h-4" />}
              title="Security"
              description="SOC2 baseline: GuardDuty, CloudTrail, Config, Security Hub"
              checked={data.modules.security}
              disabled={false}
              onChange={(v) => patchModules({ security: v })}
            />
          </div>
        </div>

        {/* ECS config */}
        {data.modules.ecs && (
          <div className="bg-gray-800/50 border border-gray-700/60 rounded-lg p-4 space-y-4">
            <p className="text-sm font-medium text-gray-300">ECS configuration</p>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Container port</label>
                <input
                  type="number"
                  min={1}
                  max={65535}
                  value={data.containerPort}
                  onChange={(e) => onChange({ containerPort: Number(e.target.value) })}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">CPU (vCPU units)</label>
                <select
                  value={data.containerCpu}
                  onChange={(e) => onChange({ containerCpu: Number(e.target.value) })}
                  className={selectClass}
                >
                  <option value={256}>256 (0.25 vCPU)</option>
                  <option value={512}>512 (0.5 vCPU)</option>
                  <option value={1024}>1024 (1 vCPU)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Memory (MB)</label>
                <select
                  value={data.containerMemory}
                  onChange={(e) => onChange({ containerMemory: Number(e.target.value) })}
                  className={selectClass}
                >
                  <option value={512}>512 MB</option>
                  <option value={1024}>1024 MB</option>
                  <option value={2048}>2048 MB</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {/* RDS config */}
        {data.modules.rds && (
          <div className="bg-gray-800/50 border border-gray-700/60 rounded-lg p-4 space-y-4">
            <p className="text-sm font-medium text-gray-300">RDS configuration</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Database engine</label>
                <select
                  value={data.dbEngine}
                  onChange={(e) => onChange({ dbEngine: e.target.value as DbEngine })}
                  className={selectClass}
                >
                  <option value="postgres">PostgreSQL</option>
                  <option value="mysql">MySQL</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Instance size</label>
                <select
                  value={data.dbInstance}
                  onChange={(e) => onChange({ dbInstance: e.target.value })}
                  className={selectClass}
                >
                  <option value="db.t3.micro">db.t3.micro (~$13/mo)</option>
                  <option value="db.t3.small">db.t3.small (~$26/mo)</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {/* Alert email */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1.5">
            Alert email{" "}
            <span className="text-gray-500 font-normal">(optional)</span>
          </label>
          <input
            type="email"
            placeholder="you@example.com"
            value={data.alertEmail}
            onChange={(e) => onChange({ alertEmail: e.target.value })}
            className={inputClass}
          />
          <p className="mt-1.5 text-xs text-gray-500">
            Receive cost alerts and security notifications.
          </p>
        </div>

        {deployError && (
          <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-red-900/30 border border-red-800/50 text-sm text-red-400">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            {deployError}
          </div>
        )}

        <div className="flex items-center gap-3 pt-2">
          <button onClick={onBack} className="btn-secondary flex items-center gap-2 text-sm">
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>
          <button
            onClick={handleDeploy}
            disabled={deploying}
            className="btn-primary flex items-center gap-2 flex-1 justify-center"
          >
            {deploying ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Rocket className="w-4 h-4" />
            )}
            {deploying ? "Queuing deployment..." : "Deploy Infrastructure"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main wizard page
// ---------------------------------------------------------------------------

export default function NewProjectPage() {
  const [step, setStep] = useState<Step>(1);
  const [projectId, setProjectId] = useState("");

  const [stepOneData, setStepOneData] = useState<StepOneData>({
    repoUrl: "",
    projectName: "",
  });

  const [stepTwoData, setStepTwoData] = useState<StepTwoData>({
    externalId: generateExternalId(),
    roleArn: "",
    accountId: "",
  });

  const [stepThreeData, setStepThreeData] = useState<StepThreeData>({
    awsRegion: "us-east-1",
    environment: "production",
    modules: {
      ecs: true,
      rds: false,
      storage: false,
      security: true,
    },
    containerPort: 3000,
    containerCpu: 256,
    containerMemory: 512,
    dbEngine: "postgres",
    dbInstance: "db.t3.micro",
    alertEmail: "",
  });

  // Step 1 → 2: create the project record first so step 2 has a projectId
  const handleStepOneContinue = useCallback(async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) throw new Error("You must be logged in.");

    const { data: project, error } = await supabase
      .from("projects")
      .insert({
        user_id: user.id,
        name: stepOneData.projectName.trim(),
        repo_url: stepOneData.repoUrl.trim(),
        aws_external_id: stepTwoData.externalId,
        status: "pending",
      })
      .select("id")
      .single();

    if (error || !project) {
      throw new Error(error?.message ?? "Failed to create project. Please try again.");
    }

    setProjectId(project.id);
    setStep(2);
  }, [stepOneData, stepTwoData.externalId]);

  return (
    <div className="p-8 max-w-2xl mx-auto">
      {/* Page header */}
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-white">New project</h1>
        <p className="text-gray-400 mt-1">
          Deploy production AWS infrastructure in under 20 minutes.
        </p>
      </div>

      {/* Step indicator */}
      <StepIndicator current={step} />

      {/* Step panels */}
      {step === 1 && (
        <StepOne
          data={stepOneData}
          onChange={(patch) => setStepOneData((d) => ({ ...d, ...patch }))}
          onContinue={handleStepOneContinue}
        />
      )}

      {step === 2 && (
        <StepTwo
          data={stepTwoData}
          projectId={projectId}
          onChange={(patch) => setStepTwoData((d) => ({ ...d, ...patch }))}
          onContinue={() => setStep(3)}
          onBack={() => setStep(1)}
        />
      )}

      {step === 3 && (
        <StepThree
          data={stepThreeData}
          accountId={stepTwoData.accountId}
          projectId={projectId}
          onChange={(patch) => setStepThreeData((d) => ({ ...d, ...patch }))}
          onBack={() => setStep(2)}
        />
      )}
    </div>
  );
}
