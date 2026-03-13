"use client";

import { useState, useCallback, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Github,
  ExternalLink,
  CheckCircle2,
  Loader2,
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Rocket,
  Shield,
  Database,
  Box,
  Globe,
  Cpu,
  Zap,
  TrendingUp,
  Check,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Step = 1 | 2 | 3;
type AppType = "nextjs" | "python" | "java" | "ai" | "other";
type DeploymentTier = "lean" | "production" | "scale";

interface StepOneData {
  repoUrl: string;
  projectName: string;
  appType: AppType;
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
  deploymentTier: DeploymentTier;
  modules: {
    ecs: boolean;
    rds: boolean;
    storage: boolean;
    security: boolean;
    "app-runner": boolean;
    "aurora-serverless": boolean;
  };
  containerPort: number;
  containerCpu: number;
  containerMemory: number;
  dbEngine: DbEngine;
  dbInstance: string;
  alertEmail: string;
}

// ---------------------------------------------------------------------------
// App type defaults
// ---------------------------------------------------------------------------

const APP_DEFAULTS: Record<AppType, { port: number; cpu: number; memory: number }> = {
  nextjs: { port: 3000, cpu: 256,  memory: 512  },
  python: { port: 8000, cpu: 256,  memory: 512  },
  java:   { port: 8080, cpu: 512,  memory: 1024 },
  ai:     { port: 8000, cpu: 1024, memory: 2048 },
  other:  { port: 3000, cpu: 256,  memory: 512  },
};

// ---------------------------------------------------------------------------
// Tier definitions
// ---------------------------------------------------------------------------

const TIERS: Record<DeploymentTier, {
  label: string;
  tagline: string;
  cost: string;
  bestFor: string;
  modules: (keyof StepThreeData["modules"])[];
  accent: string;
  ring: string;
  badge: string;
}> = {
  lean: {
    label:   "Lean",
    tagline: "Fast MVP, minimal cost",
    cost:    "$45–65/mo",
    bestFor: "Side projects & early MVPs",
    modules: ["ecs", "rds", "security"],
    accent:  "text-cyan-400",
    ring:    "ring-cyan-500/40 border-cyan-500/30",
    badge:   "bg-cyan-500/10 text-cyan-400",
  },
  production: {
    label:   "Production",
    tagline: "HA-ready + SOC2 baseline",
    cost:    "$100–150/mo",
    bestFor: "Launched products with users",
    modules: ["ecs", "rds", "storage", "security"],
    accent:  "text-violet-400",
    ring:    "ring-violet-500/40 border-violet-500/30",
    badge:   "bg-violet-500/10 text-violet-400",
  },
  scale: {
    label:   "Scale",
    tagline: "Auto-scaling + full compliance",
    cost:    "$300+/mo",
    bestFor: "Enterprise pilots & SOC2/HIPAA",
    modules: ["ecs", "aurora-serverless", "storage", "security"],
    accent:  "text-amber-400",
    ring:    "ring-amber-500/40 border-amber-500/30",
    badge:   "bg-amber-500/10 text-amber-400",
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateExternalId(): string {
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
// Shared input styles
// ---------------------------------------------------------------------------

const inputCls =
  "w-full bg-[#0d1117] border border-white/[0.08] rounded-lg px-3.5 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500/50 transition-all";

const selectCls =
  "w-full bg-[#0d1117] border border-white/[0.08] rounded-lg px-3.5 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500/50 transition-all";

// ---------------------------------------------------------------------------
// Step progress bar
// ---------------------------------------------------------------------------

const STEPS = [
  { num: 1, label: "Repository" },
  { num: 2, label: "AWS Account" },
  { num: 3, label: "Configure" },
];

function StepBar({ current }: { current: Step }) {
  return (
    <div className="flex items-center">
      {STEPS.map((s, i) => {
        const done   = s.num < current;
        const active = s.num === current;
        return (
          <div key={s.num} className="flex items-center">
            <div className="flex items-center gap-2.5">
              {/* Circle */}
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-200 shrink-0"
                style={
                  done
                    ? { background: "#10B981", color: "#fff" }
                    : active
                    ? {
                        background: "#f97316",
                        color: "#fff",
                        boxShadow: "0 0 0 4px rgba(249,115,22,0.18)",
                      }
                    : {
                        background: "rgba(255,255,255,0.05)",
                        color: "#475569",
                        border: "1px solid rgba(255,255,255,0.08)",
                      }
                }
              >
                {done ? <Check className="w-3.5 h-3.5" /> : s.num}
              </div>

              {/* Label */}
              <span
                className="text-sm font-medium transition-colors duration-200"
                style={
                  active
                    ? { color: "#F0F9FF" }
                    : done
                    ? { color: "#34D399" }
                    : { color: "#475569" }
                }
              >
                {s.label}
              </span>
            </div>

            {/* Connector */}
            {i < STEPS.length - 1 && (
              <div
                className="w-14 h-px mx-4 transition-colors duration-200"
                style={{ background: done ? "rgba(52,211,153,0.3)" : "rgba(255,255,255,0.07)" }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 1 — GitHub repo + app type
// ---------------------------------------------------------------------------

const APP_TYPE_OPTIONS: { value: AppType; label: string; icon: string; hint: string }[] = [
  { value: "nextjs",  label: "Next.js",       icon: "N", hint: "Port 3000" },
  { value: "python",  label: "Python",         icon: "Py", hint: "Port 8000" },
  { value: "java",    label: "Java / Spring",  icon: "Jv", hint: "Port 8080" },
  { value: "ai",      label: "AI / ML",        icon: "AI", hint: "1+ vCPU" },
  { value: "other",   label: "Other",          icon: "···", hint: "Custom" },
];

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
  const [error, setError]     = useState("");

  const urlError = data.repoUrl && !isValidGithubUrl(data.repoUrl)
    ? "Must be a valid github.com URL"
    : "";

  async function handleContinue() {
    if (!isValidGithubUrl(data.repoUrl)) { setError("Enter a valid GitHub repository URL."); return; }
    if (!data.projectName.trim())         { setError("Project name is required.");           return; }
    setError("");
    setLoading(true);
    try {
      await onContinue();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* Repo URL */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">Repository URL</label>
        <div className="relative">
          <Github className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="url"
            placeholder="https://github.com/username/my-app"
            value={data.repoUrl}
            onChange={(e) => {
              const url = e.target.value;
              const autoName = repoNameFromUrl(url);
              onChange({ repoUrl: url, ...(autoName ? { projectName: autoName } : {}) });
            }}
            className={`${inputCls} pl-10`}
          />
        </div>
        {urlError && <p className="mt-1.5 text-xs text-red-400">{urlError}</p>}
      </div>

      {/* Project name */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">Project name</label>
        <input
          type="text"
          placeholder="my-app"
          value={data.projectName}
          onChange={(e) => onChange({ projectName: e.target.value })}
          className={inputCls}
        />
      </div>

      {/* App type */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">
          App type
          <span className="ml-2 text-xs text-gray-500 font-normal">Sets container defaults</span>
        </label>
        <div className="grid grid-cols-5 gap-2">
          {APP_TYPE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange({ appType: opt.value })}
              className={`flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl border text-center transition-all cursor-pointer ${
                data.appType === opt.value
                  ? "border-orange-500/50 bg-orange-500/10 ring-1 ring-orange-500/30"
                  : "border-white/[0.06] bg-white/[0.02] hover:border-white/[0.12] hover:bg-white/[0.04]"
              }`}
            >
              <span
                className={`text-xs font-bold font-mono ${
                  data.appType === opt.value ? "text-orange-400" : "text-gray-400"
                }`}
              >
                {opt.icon}
              </span>
              <span className={`text-xs font-medium leading-tight ${
                data.appType === opt.value ? "text-white" : "text-gray-400"
              }`}>
                {opt.label}
              </span>
              <span className="text-[10px] text-gray-600">{opt.hint}</span>
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      <button
        onClick={handleContinue}
        disabled={loading || !!urlError || !data.repoUrl || !data.projectName}
        className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-orange-500 hover:bg-orange-400 disabled:bg-orange-500/40 disabled:cursor-not-allowed text-white text-sm font-semibold transition-all"
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
        {loading ? "Creating project…" : "Continue"}
      </button>
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
  const [cfClicked,      setCfClicked]      = useState(false);
  const [verifying,      setVerifying]      = useState(false);
  const [verifyError,    setVerifyError]    = useState("");
  const [existingRole,   setExistingRole]   = useState(false);
  const [customExtId,    setCustomExtId]    = useState("");

  const cfUrl =
    `https://console.aws.amazon.com/cloudformation/home#/stacks/create/review` +
    `?templateURL=https://infraready-public.s3.amazonaws.com/bootstrap-role.yaml` +
    `&stackName=InfraReadyRole` +
    `&param_ExternalId=${data.externalId}`;

  async function handleVerify() {
    if (!isValidRoleArn(data.roleArn)) {
      setVerifyError("Invalid ARN — must match arn:aws:iam::<account-id>:role/<name>");
      return;
    }
    setVerifyError("");
    setVerifying(true);
    try {
      // If using existing role with custom External ID, update it in Supabase first
      if (existingRole && customExtId.trim()) {
        const supabase = createClient();
        await supabase
          .from("projects")
          .update({ aws_external_id: customExtId.trim() })
          .eq("id", projectId);
      }
      const res  = await fetch("/api/aws/connect", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ projectId, roleArn: data.roleArn }),
      });
      const json = await res.json() as { success?: boolean; accountId?: string; error?: string };
      if (!res.ok || !json.success) {
        setVerifyError(json.error ?? "Verification failed. Check the role ARN.");
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
  const arnError    = data.roleArn && !isValidRoleArn(data.roleArn)
    ? "Must match arn:aws:iam::<12-digit-id>:role/<name>"
    : "";

  return (
    <div className="space-y-4">
      {/* Step 1: Launch CloudFormation */}
      <div className={`rounded-xl border p-5 space-y-4 transition-all ${
        cfClicked ? "border-emerald-500/20 bg-emerald-500/[0.03]" : "border-white/[0.08] bg-white/[0.02]"
      }`}>
        <div className="flex items-start gap-3">
          <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5 ${
            cfClicked ? "bg-emerald-500 text-white" : "bg-orange-500/20 text-orange-400 border border-orange-500/30"
          }`}>
            {cfClicked ? <Check className="w-3.5 h-3.5" /> : "1"}
          </div>
          <div>
            <p className="text-sm font-semibold text-white">Create the IAM role</p>
            <p className="text-xs text-gray-500 mt-0.5">
              Opens AWS CloudFormation. Creates a least-privilege role in ~90 seconds.
            </p>
          </div>
        </div>

        <a
          href={cfUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => setCfClicked(true)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white/[0.06] hover:bg-white/[0.09] border border-white/[0.08] text-sm font-medium text-gray-200 transition-all"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          Launch CloudFormation Stack
        </a>

        {cfClicked && (
          <p className="text-xs text-emerald-400 flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Wait for stack to show <span className="font-mono">CREATE_COMPLETE</span>, then continue below.
          </p>
        )}

        {!existingRole && (
          <div>
            <p className="text-xs text-gray-500 mb-1.5">Your External ID (pre-filled in the stack)</p>
            <code className="block text-xs bg-[#0d1117] border border-white/[0.06] rounded-lg px-3 py-2 text-orange-300 font-mono break-all">
              {data.externalId}
            </code>
          </div>
        )}

        <button
          type="button"
          onClick={() => setExistingRole((v) => !v)}
          className="text-xs text-gray-500 hover:text-gray-300 underline underline-offset-2 transition-colors"
        >
          {existingRole ? "New role — use auto-generated External ID" : "Already have InfraReadyRole? Use existing External ID"}
        </button>

        {existingRole && (
          <div>
            <p className="text-xs text-gray-500 mb-1.5">Your existing External ID</p>
            <input
              type="text"
              placeholder="Paste your original External ID here"
              value={customExtId}
              onChange={(e) => setCustomExtId(e.target.value)}
              className={`${inputCls} font-mono`}
            />
            <p className="text-xs text-gray-600 mt-1">Find it in CloudFormation → your existing stack → Parameters tab</p>
          </div>
        )}
      </div>

      {/* Step 2: Paste ARN */}
      <div className={`rounded-xl border p-5 space-y-4 transition-all ${
        isConnected ? "border-emerald-500/20 bg-emerald-500/[0.03]" : "border-white/[0.08] bg-white/[0.02]"
      }`}>
        <div className="flex items-start gap-3">
          <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5 ${
            isConnected ? "bg-emerald-500 text-white" : "bg-orange-500/20 text-orange-400 border border-orange-500/30"
          }`}>
            {isConnected ? <Check className="w-3.5 h-3.5" /> : "2"}
          </div>
          <div>
            <p className="text-sm font-semibold text-white">Paste your IAM Role ARN</p>
            <p className="text-xs text-gray-500 mt-0.5">
              Found in the CloudFormation stack <span className="font-mono">Outputs</span> tab.
            </p>
          </div>
        </div>

        {isConnected ? (
          <div className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-sm text-emerald-400">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            AWS account <span className="font-mono ml-1">{data.accountId}</span> connected
          </div>
        ) : (
          <>
            <input
              type="text"
              placeholder="arn:aws:iam::123456789012:role/InfraReadyRole"
              value={data.roleArn}
              onChange={(e) => onChange({ roleArn: e.target.value })}
              className={`${inputCls} font-mono`}
            />
            {arnError && <p className="text-xs text-red-400">{arnError}</p>}
            {verifyError && (
              <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {verifyError}
              </div>
            )}
            <button
              onClick={handleVerify}
              disabled={verifying || !data.roleArn || !!arnError}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-orange-500 hover:bg-orange-400 disabled:bg-orange-500/40 disabled:cursor-not-allowed text-white text-sm font-semibold transition-all"
            >
              {verifying ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              {verifying ? "Verifying…" : "Verify Connection"}
            </button>
          </>
        )}
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-gray-400 hover:text-gray-200 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>
        {isConnected && (
          <button
            onClick={onContinue}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-orange-500 hover:bg-orange-400 text-white text-sm font-semibold transition-all"
          >
            Continue
            <ArrowRight className="w-4 h-4" />
          </button>
        )}
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

function TierCard({
  tierKey,
  tier,
  selected,
  onSelect,
}: {
  tierKey: DeploymentTier;
  tier: (typeof TIERS)[DeploymentTier];
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`relative text-left rounded-xl border p-4 transition-all cursor-pointer ${
        selected
          ? `${tier.ring} bg-white/[0.03] ring-1`
          : "border-white/[0.06] bg-white/[0.01] hover:border-white/[0.1] hover:bg-white/[0.03]"
      }`}
    >
      {selected && (
        <div className="absolute top-3 right-3 w-4 h-4 rounded-full bg-orange-500 flex items-center justify-center">
          <Check className="w-2.5 h-2.5 text-white" />
        </div>
      )}
      <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold mb-3 ${tier.badge}`}>
        {tierKey === "lean" && <Zap className="w-3 h-3" />}
        {tierKey === "production" && <Rocket className="w-3 h-3" />}
        {tierKey === "scale" && <TrendingUp className="w-3 h-3" />}
        {tier.label}
      </div>
      <p className={`text-lg font-bold ${selected ? tier.accent : "text-white"}`}>{tier.cost}</p>
      <p className="text-xs text-gray-500 mt-0.5 leading-snug">{tier.bestFor}</p>
      <p className="text-xs text-gray-400 mt-2 leading-snug">{tier.tagline}</p>
    </button>
  );
}

function ModuleToggle({
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
  onChange: (v: boolean) => void;
}) {
  return (
    <label
      className={`flex items-center gap-3.5 px-4 py-3 rounded-lg border transition-all cursor-pointer ${
        disabled
          ? "border-orange-500/20 bg-orange-500/[0.03] cursor-not-allowed"
          : checked
          ? "border-orange-500/30 bg-orange-500/[0.05] hover:bg-orange-500/[0.08]"
          : "border-white/[0.06] bg-white/[0.02] hover:border-white/[0.1] hover:bg-white/[0.04]"
      }`}
    >
      <div className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${
        checked ? "bg-orange-500/20 text-orange-400" : "bg-white/[0.05] text-gray-500"
      }`}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-gray-200">{title}</p>
          {disabled && (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-400">
              required
            </span>
          )}
        </div>
        <p className="text-xs text-gray-500 mt-0.5 truncate">{description}</p>
      </div>
      <div className={`w-9 h-5 rounded-full transition-all relative shrink-0 ${
        checked ? "bg-orange-500" : "bg-gray-700"
      } ${disabled ? "opacity-60" : ""}`}>
        <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${
          checked ? "left-[calc(100%-18px)]" : "left-0.5"
        }`} />
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
          className="sr-only"
        />
      </div>
    </label>
  );
}

function StepThree({
  data,
  appType,
  accountId,
  projectId,
  onChange,
  onBack,
}: {
  data: StepThreeData;
  appType: AppType;
  accountId: string;
  projectId: string;
  onChange: (patch: Partial<StepThreeData>) => void;
  onBack: () => void;
}) {
  const [deploying,    setDeploying]    = useState(false);
  const [deployError,  setDeployError]  = useState("");
  const router = useRouter();

  function handleTierChange(tier: DeploymentTier) {
    const tierModules  = TIERS[tier].modules;
    const appDefaults  = APP_DEFAULTS[appType];
    onChange({
      deploymentTier: tier,
      modules: {
        ecs:               tierModules.includes("ecs"),
        rds:               tierModules.includes("rds"),
        storage:           tierModules.includes("storage"),
        security:          tierModules.includes("security"),
        "app-runner":      tierModules.includes("app-runner"),
        "aurora-serverless": tierModules.includes("aurora-serverless"),
      },
      containerPort:   appDefaults.port,
      containerCpu:    appDefaults.cpu,
      containerMemory: appDefaults.memory,
    });
  }

  function patchModules(patch: Partial<StepThreeData["modules"]>) {
    onChange({ modules: { ...data.modules, ...patch } });
  }

  async function handleDeploy() {
    setDeployError("");
    setDeploying(true);

    const modules: string[] = ["vpc"];
    if (data.modules.ecs)                  modules.push("ecs");
    if (data.modules.rds)                  modules.push("rds");
    if (data.modules.storage)              modules.push("storage");
    if (data.modules.security)             modules.push("security");
    if (data.modules["app-runner"])        modules.push("app-runner");
    if (data.modules["aurora-serverless"]) modules.push("aurora-serverless");

    const config: Record<string, unknown> = {
      aws_region:  data.awsRegion,
      environment: data.environment,
      app_type:    appType,
      alert_email: data.alertEmail || undefined,
    };

    if (data.modules.ecs || data.modules["app-runner"]) {
      config.container_port   = data.containerPort;
      config.container_cpu    = data.containerCpu;
      config.container_memory = data.containerMemory;
    }

    if (data.modules.rds) {
      config.db_engine   = data.dbEngine;
      config.db_instance = data.dbInstance;
    }

    try {
      const res  = await fetch("/api/deploy", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ projectId, modules, config }),
      });
      const json = await res.json() as { deploymentId?: string; error?: string };
      if (!res.ok || !json.deploymentId) {
        setDeployError(json.error ?? "Failed to queue deployment.");
        return;
      }
      router.push(`/projects/${projectId}`);
    } catch {
      setDeployError("Network error. Please try again.");
    } finally {
      setDeploying(false);
    }
  }

  const appDefaults = APP_DEFAULTS[appType];

  return (
    <div className="space-y-6">
      {/* AWS account badge */}
      <div className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-sm text-emerald-400">
        <CheckCircle2 className="w-4 h-4 shrink-0" />
        Deploying to AWS account <span className="font-mono ml-1">{accountId}</span>
      </div>

      {/* App type detected */}
      <div className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg bg-white/[0.03] border border-white/[0.06] text-sm">
        <Cpu className="w-4 h-4 text-cyan-400 shrink-0" />
        <span className="text-gray-400">Detected: </span>
        <span className="text-white font-medium ml-0.5">
          {appType === "nextjs" ? "Next.js" :
           appType === "python" ? "Python"  :
           appType === "java"   ? "Java / Spring" :
           appType === "ai"     ? "AI / ML" : "Custom"}
        </span>
        <span className="text-gray-600 ml-1">
          · Port {appDefaults.port} · {appDefaults.cpu / 1024} vCPU · {appDefaults.memory} MB
        </span>
      </div>

      {/* Tier selector */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-3">Deployment tier</label>
        <div className="grid grid-cols-3 gap-3">
          {(Object.entries(TIERS) as [DeploymentTier, (typeof TIERS)[DeploymentTier]][]).map(([key, tier]) => (
            <TierCard
              key={key}
              tierKey={key}
              tier={tier}
              selected={data.deploymentTier === key}
              onSelect={() => handleTierChange(key)}
            />
          ))}
        </div>
      </div>

      {/* Region + Environment */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">AWS Region</label>
          <select
            value={data.awsRegion}
            onChange={(e) => onChange({ awsRegion: e.target.value })}
            className={selectCls}
          >
            {AWS_REGIONS.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">Environment</label>
          <select
            value={data.environment}
            onChange={(e) => onChange({ environment: e.target.value as Environment })}
            className={selectCls}
          >
            <option value="production">Production</option>
            <option value="staging">Staging</option>
          </select>
        </div>
      </div>

      {/* Modules */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-3">
          Infrastructure modules
          <span className="ml-2 text-xs text-gray-500 font-normal">auto-selected by tier</span>
        </label>
        <div className="space-y-2">
          <ModuleToggle icon={<Globe className="w-4 h-4" />} title="VPC" description="Virtual private cloud, subnets, NAT gateway" checked={true} disabled={true} onChange={() => {}} />
          <ModuleToggle icon={<Box className="w-4 h-4" />} title="ECS Fargate" description="Serverless containers — no EC2 to manage" checked={data.modules.ecs} disabled={false} onChange={(v) => patchModules({ ecs: v })} />
          <ModuleToggle icon={<Zap className="w-4 h-4" />} title="App Runner" description="Auto-HTTPS containers, scales to zero, no ALB" checked={data.modules["app-runner"]} disabled={false} onChange={(v) => patchModules({ "app-runner": v })} />
          <ModuleToggle icon={<Database className="w-4 h-4" />} title="RDS PostgreSQL" description="Always-on Postgres with automated backups" checked={data.modules.rds} disabled={false} onChange={(v) => patchModules({ rds: v })} />
          <ModuleToggle icon={<TrendingUp className="w-4 h-4" />} title="Aurora Serverless v2" description="Auto-scaling Postgres — 0.5–64 ACUs" checked={data.modules["aurora-serverless"]} disabled={false} onChange={(v) => patchModules({ "aurora-serverless": v })} />
          <ModuleToggle icon={<Globe className="w-4 h-4" />} title="Storage + CDN" description="S3 + CloudFront for static assets and uploads" checked={data.modules.storage} disabled={false} onChange={(v) => patchModules({ storage: v })} />
          <ModuleToggle icon={<Shield className="w-4 h-4" />} title="Security Baseline" description="GuardDuty, CloudTrail, Config, Security Hub" checked={data.modules.security} disabled={false} onChange={(v) => patchModules({ security: v })} />
        </div>
      </div>

      {/* Container config */}
      {(data.modules.ecs || data.modules["app-runner"]) && (
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 space-y-4">
          <p className="text-sm font-semibold text-gray-200">Container settings</p>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1.5">Port</label>
              <input type="number" min={1} max={65535} value={data.containerPort}
                onChange={(e) => onChange({ containerPort: Number(e.target.value) })} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1.5">CPU</label>
              <select value={data.containerCpu} onChange={(e) => onChange({ containerCpu: Number(e.target.value) })} className={selectCls}>
                <option value={256}>0.25 vCPU</option>
                <option value={512}>0.5 vCPU</option>
                <option value={1024}>1 vCPU</option>
                <option value={2048}>2 vCPU</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1.5">Memory</label>
              <select value={data.containerMemory} onChange={(e) => onChange({ containerMemory: Number(e.target.value) })} className={selectCls}>
                <option value={512}>512 MB</option>
                <option value={1024}>1 GB</option>
                <option value={2048}>2 GB</option>
                <option value={4096}>4 GB</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {/* RDS config */}
      {data.modules.rds && (
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 space-y-4">
          <p className="text-sm font-semibold text-gray-200">RDS settings</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1.5">Engine</label>
              <select value={data.dbEngine} onChange={(e) => onChange({ dbEngine: e.target.value as DbEngine })} className={selectCls}>
                <option value="postgres">PostgreSQL</option>
                <option value="mysql">MySQL</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1.5">Instance</label>
              <select value={data.dbInstance} onChange={(e) => onChange({ dbInstance: e.target.value })} className={selectCls}>
                <option value="db.t3.micro">db.t3.micro (~$13/mo)</option>
                <option value="db.t3.small">db.t3.small (~$26/mo)</option>
                <option value="db.t3.medium">db.t3.medium (~$52/mo)</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Alert email */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">
          Alert email <span className="text-gray-600 font-normal">— optional</span>
        </label>
        <input type="email" placeholder="you@example.com" value={data.alertEmail}
          onChange={(e) => onChange({ alertEmail: e.target.value })} className={inputCls} />
        <p className="mt-1.5 text-xs text-gray-600">Cost alerts and security notifications.</p>
      </div>

      {deployError && (
        <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {deployError}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-3 pt-1">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium text-gray-400 hover:text-gray-200 border border-white/[0.06] hover:border-white/[0.12] transition-all"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>
        <button
          onClick={handleDeploy}
          disabled={deploying}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-orange-500 hover:bg-orange-400 disabled:bg-orange-500/40 disabled:cursor-not-allowed text-white text-sm font-semibold transition-all"
        >
          {deploying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Rocket className="w-4 h-4" />}
          {deploying ? "Queuing deployment…" : "Deploy Infrastructure"}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page shell
// ---------------------------------------------------------------------------

const STEP_META = [
  { icon: <Github className="w-4 h-4" />,  title: "Import repository",          sub: "Connect your GitHub repo to get started." },
  { icon: <Shield className="w-4 h-4" />,  title: "Connect AWS account",         sub: "We deploy into your own AWS account — you stay in control." },
  { icon: <Rocket className="w-4 h-4" />,  title: "Configure infrastructure",    sub: "Pick a tier and customize your modules." },
];

function NewProjectPageInner() {
  const searchParams = useSearchParams();

  const [step, setStep]           = useState<Step>(1);
  const [projectId, setProjectId] = useState("");

  const [stepOneData, setStepOneData] = useState<StepOneData>({
    repoUrl: "", projectName: "", appType: "nextjs",
  });

  const [stepTwoData, setStepTwoData] = useState<StepTwoData>({
    externalId: generateExternalId(), roleArn: "", accountId: "",
  });

  const [stepThreeData, setStepThreeData] = useState<StepThreeData>({
    awsRegion: "us-east-1", environment: "production", deploymentTier: "lean",
    modules: { ecs: true, rds: false, storage: false, security: true, "app-runner": false, "aurora-serverless": false },
    containerPort: 3000, containerCpu: 256, containerMemory: 512,
    dbEngine: "postgres", dbInstance: "db.t3.micro", alertEmail: "",
  });

  // Resume wizard after GitHub App install redirects back with ?projectId=&step=2
  useEffect(() => {
    const pid  = searchParams.get("projectId");
    const step = searchParams.get("step");
    if (pid && step === "2") {
      setProjectId(pid);
      setStep(2);
    }
  }, [searchParams]);

  const handleStepOneContinue = useCallback(async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("You must be logged in.");

    const { data: project, error } = await supabase
      .from("projects")
      .insert({
        user_id:         user.id,
        name:            stepOneData.projectName.trim(),
        repo_url:        stepOneData.repoUrl.trim(),
        aws_external_id: stepTwoData.externalId,
        status:          "pending",
      })
      .select("id")
      .single();

    if (error || !project) throw new Error(error?.message ?? "Failed to create project.");

    const appDefaults = APP_DEFAULTS[stepOneData.appType];
    setStepThreeData((d) => ({
      ...d,
      containerPort:   appDefaults.port,
      containerCpu:    appDefaults.cpu,
      containerMemory: appDefaults.memory,
    }));

    // Silently reuse existing GitHub installation if available — never block wizard
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
        .eq("id", project.id);
    }

    // Always proceed to Step 2 — GitHub connection never blocks infra deployment
    setProjectId(project.id);
    setStep(2);
  }, [stepOneData, stepTwoData.externalId]);

  const meta = STEP_META[step - 1];

  return (
    <div
      className="h-screen flex flex-col overflow-hidden"
      style={{ background: "#04091A" }}
    >
      {/* Radial glow atmosphere */}
      <div
        className="pointer-events-none fixed inset-0"
        style={{
          background:
            "radial-gradient(ellipse 70% 40% at 50% 0%, rgba(14,165,233,0.07) 0%, transparent 70%)",
        }}
      />

      {/* Top bar — step indicator */}
      <div
        className="relative z-10 px-8 py-4 flex items-center justify-between"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
      >
        <StepBar current={step} />

        {/* Back to projects link */}
        <a
          href="/projects"
          className="text-xs font-medium transition-colors duration-150"
          style={{ color: "#475569" }}
        >
          Cancel
        </a>
      </div>

      {/* Content area */}
      <div className="relative z-10 flex-1 overflow-y-auto">
        <div className="flex items-start justify-center px-4 py-12">
        <div className="w-full max-w-xl">

          {/* Step header */}
          <div
            className="flex items-center gap-3.5 mb-8 p-4 rounded-xl"
            style={{
              background: "rgba(255,255,255,0.02)",
              border: "1px solid rgba(255,255,255,0.06)",
            }}
          >
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
              style={{
                background: "rgba(14,165,233,0.1)",
                border: "1px solid rgba(14,165,233,0.2)",
                color: "#38BDF8",
              }}
            >
              {meta.icon}
            </div>
            <div>
              <h1
                className="text-base font-semibold leading-tight"
                style={{ color: "#F0F9FF" }}
              >
                {meta.title}
              </h1>
              <p
                className="text-sm mt-0.5 leading-snug"
                style={{ color: "#475569" }}
              >
                {meta.sub}
              </p>
            </div>
          </div>

          {/* Step content */}
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
              appType={stepOneData.appType}
              accountId={stepTwoData.accountId}
              projectId={projectId}
              onChange={(patch) => setStepThreeData((d) => ({ ...d, ...patch }))}
              onBack={() => setStep(2)}
            />
          )}
        </div>
        </div>
      </div>
    </div>
  );
}

export default function NewProjectPage() {
  return (
    <Suspense>
      <NewProjectPageInner />
    </Suspense>
  );
}
