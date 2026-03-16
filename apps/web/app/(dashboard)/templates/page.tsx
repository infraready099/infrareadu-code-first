"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import {
  Search,
  X,
  ArrowRight,
  ChevronRight,
  TrendingDown,
  Globe,
  MapPin,
  Loader2,
  Check,
  ExternalLink,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Category = "all" | "automation" | "analytics" | "cms" | "storage" | "database";

interface Template {
  id: string;
  name: string;
  category: Exclude<Category, "all">;
  description: string;
  awsCost: number;
  saasCost: number;
  icon: string;
  color: string;
  tags: string[];
  modules: string[];
  envVars: { key: string; label: string; placeholder: string; secret?: boolean }[];
  saasLabel: string;
}

// ---------------------------------------------------------------------------
// Template data
// ---------------------------------------------------------------------------

const TEMPLATES: Template[] = [
  {
    id: "n8n",
    name: "n8n",
    category: "automation",
    description: "Workflow automation — like Zapier but self-hosted on your own AWS",
    awsCost: 24,
    saasCost: 50,
    icon: "⚡",
    color: "bg-orange-500",
    tags: ["automation", "workflows", "no-code"],
    saasLabel: "n8n Cloud",
    modules: ["VPC", "ECS Fargate", "RDS PostgreSQL", "Security Baseline"],
    envVars: [
      { key: "N8N_BASIC_AUTH_USER", label: "Admin username", placeholder: "admin" },
      { key: "N8N_BASIC_AUTH_PASSWORD", label: "Admin password", placeholder: "••••••••", secret: true },
      { key: "N8N_ENCRYPTION_KEY", label: "Encryption key", placeholder: "32-char random string", secret: true },
    ],
  },
  {
    id: "ghost",
    name: "Ghost",
    category: "cms",
    description: "Professional publishing platform for blogs and newsletters",
    awsCost: 20,
    saasCost: 36,
    icon: "👻",
    color: "bg-green-500",
    tags: ["cms", "blog", "newsletter"],
    saasLabel: "Ghost Pro",
    modules: ["VPC", "ECS Fargate", "RDS MySQL", "S3 + CloudFront", "Security Baseline"],
    envVars: [
      { key: "GHOST_ADMIN_EMAIL", label: "Admin email", placeholder: "you@yourdomain.com" },
      { key: "GHOST_ADMIN_PASSWORD", label: "Admin password", placeholder: "••••••••", secret: true },
      { key: "GHOST_BLOG_URL", label: "Blog URL", placeholder: "https://blog.yourdomain.com" },
    ],
  },
  {
    id: "plausible",
    name: "Plausible Analytics",
    category: "analytics",
    description: "Privacy-friendly Google Analytics alternative — no cookies, no tracking",
    awsCost: 15,
    saasCost: 19,
    icon: "📊",
    color: "bg-blue-500",
    tags: ["analytics", "privacy"],
    saasLabel: "Plausible Cloud",
    modules: ["VPC", "ECS Fargate", "RDS PostgreSQL", "Security Baseline"],
    envVars: [
      { key: "ADMIN_USER_EMAIL", label: "Admin email", placeholder: "you@yourdomain.com" },
      { key: "ADMIN_USER_PASSWORD", label: "Admin password", placeholder: "••••••••", secret: true },
      { key: "BASE_URL", label: "Your analytics URL", placeholder: "https://analytics.yourdomain.com" },
      { key: "SECRET_KEY_BASE", label: "Secret key", placeholder: "64-char random string", secret: true },
    ],
  },
  {
    id: "umami",
    name: "Umami",
    category: "analytics",
    description: "Simple, fast, privacy-focused analytics — open source and beautiful",
    awsCost: 10,
    saasCost: 9,
    icon: "🎯",
    color: "bg-purple-500",
    tags: ["analytics", "privacy"],
    saasLabel: "Umami Cloud",
    modules: ["VPC", "ECS Fargate", "RDS PostgreSQL", "Security Baseline"],
    envVars: [
      { key: "APP_SECRET", label: "App secret", placeholder: "random string", secret: true },
      { key: "DATABASE_URL", label: "Database URL", placeholder: "Auto-configured from RDS", secret: false },
    ],
  },
  {
    id: "minio",
    name: "MinIO",
    category: "storage",
    description: "S3-compatible object storage — use it as a drop-in replacement anywhere",
    awsCost: 5,
    saasCost: 25,
    icon: "🗄️",
    color: "bg-red-500",
    tags: ["storage", "s3", "files"],
    saasLabel: "MinIO Cloud",
    modules: ["VPC", "ECS Fargate", "EBS Volume", "Security Baseline"],
    envVars: [
      { key: "MINIO_ROOT_USER", label: "Root username", placeholder: "minioadmin" },
      { key: "MINIO_ROOT_PASSWORD", label: "Root password", placeholder: "••••••••", secret: true },
    ],
  },
  {
    id: "directus",
    name: "Directus",
    category: "cms",
    description: "Headless CMS and data platform — instant REST + GraphQL APIs for any database",
    awsCost: 20,
    saasCost: 99,
    icon: "📦",
    color: "bg-purple-600",
    tags: ["cms", "headless", "api"],
    saasLabel: "Directus Cloud",
    modules: ["VPC", "ECS Fargate", "RDS PostgreSQL", "S3 + CloudFront", "Security Baseline"],
    envVars: [
      { key: "ADMIN_EMAIL", label: "Admin email", placeholder: "admin@yourdomain.com" },
      { key: "ADMIN_PASSWORD", label: "Admin password", placeholder: "••••••••", secret: true },
      { key: "SECRET", label: "Session secret", placeholder: "random string", secret: true },
    ],
  },
  {
    id: "metabase",
    name: "Metabase",
    category: "analytics",
    description: "Business intelligence and data visualization — no SQL required",
    awsCost: 20,
    saasCost: 500,
    icon: "📈",
    color: "bg-blue-600",
    tags: ["analytics", "bi", "dashboards"],
    saasLabel: "Metabase Cloud",
    modules: ["VPC", "ECS Fargate", "RDS PostgreSQL", "Security Baseline"],
    envVars: [
      { key: "MB_DB_TYPE", label: "DB type", placeholder: "postgres (auto-set)" },
      { key: "MB_ADMIN_EMAIL", label: "Admin email", placeholder: "admin@yourdomain.com" },
    ],
  },
  {
    id: "appsmith",
    name: "Appsmith",
    category: "database",
    description: "Build internal tools and admin panels with drag-and-drop — connect any API or DB",
    awsCost: 15,
    saasCost: 40,
    icon: "🔧",
    color: "bg-yellow-500",
    tags: ["low-code", "internal-tools"],
    saasLabel: "Appsmith Cloud",
    modules: ["VPC", "ECS Fargate", "RDS MongoDB-compatible", "S3", "Security Baseline"],
    envVars: [
      { key: "APPSMITH_ADMIN_EMAIL", label: "Admin email", placeholder: "admin@yourdomain.com" },
      { key: "APPSMITH_ADMIN_PASSWORD", label: "Admin password", placeholder: "••••••••", secret: true },
      { key: "APPSMITH_ENCRYPTION_PASSWORD", label: "Encryption password", placeholder: "random string", secret: true },
      { key: "APPSMITH_ENCRYPTION_SALT", label: "Encryption salt", placeholder: "random string", secret: true },
    ],
  },
];

const CATEGORIES: { id: Category; label: string; count: number }[] = [
  { id: "all", label: "All", count: TEMPLATES.length },
  { id: "automation", label: "Automation", count: TEMPLATES.filter((t) => t.category === "automation").length },
  { id: "analytics", label: "Analytics", count: TEMPLATES.filter((t) => t.category === "analytics").length },
  { id: "cms", label: "CMS", count: TEMPLATES.filter((t) => t.category === "cms").length },
  { id: "storage", label: "Storage", count: TEMPLATES.filter((t) => t.category === "storage").length },
  { id: "database", label: "Database", count: TEMPLATES.filter((t) => t.category === "database").length },
];

const AWS_REGIONS = [
  { value: "us-east-1", label: "US East (N. Virginia)" },
  { value: "us-east-2", label: "US East (Ohio)" },
  { value: "us-west-2", label: "US West (Oregon)" },
  { value: "eu-west-1", label: "EU (Ireland)" },
  { value: "eu-central-1", label: "EU (Frankfurt)" },
  { value: "ap-southeast-1", label: "Asia Pacific (Singapore)" },
  { value: "ap-northeast-1", label: "Asia Pacific (Tokyo)" },
];

// ---------------------------------------------------------------------------
// Savings helpers
// ---------------------------------------------------------------------------

function savingsPct(awsCost: number, saasCost: number): number {
  return Math.round(((saasCost - awsCost) / saasCost) * 100);
}

function isCheaper(awsCost: number, saasCost: number): boolean {
  return awsCost < saasCost;
}

// ---------------------------------------------------------------------------
// Deploy Modal
// ---------------------------------------------------------------------------

interface DeployModalProps {
  template: Template | null;
  open: boolean;
  onClose: () => void;
}

function DeployModal({ template, open, onClose }: DeployModalProps) {
  const router = useRouter();
  const [config, setConfig] = useState<Record<string, string>>({});
  const [region, setRegion] = useState("us-east-1");
  const [deploying, setDeploying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const supabase = createClient();

  // Reset form when template changes
  useEffect(() => {
    setConfig({});
    setRegion("us-east-1");
    setDeploying(false);
    setError(null);
    setSuccess(false);
  }, [template?.id]);

  const handleDeploy = useCallback(async () => {
    if (!template) return;
    setDeploying(true);
    setError(null);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data: project, error: dbError } = await supabase
        .from("projects")
        .insert({
          name: `${template.name} (${region})`,
          aws_region: region,
          status: "pending",
          user_id: user.id,
          app_template_id: template.id,
          template_config: config,
        })
        .select("id")
        .single();

      if (dbError) throw new Error(dbError.message);

      setSuccess(true);
      setTimeout(() => {
        onClose();
        router.push(`/projects/new?projectId=${project.id}&step=2`);
      }, 800);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setDeploying(false);
    }
  }, [template, config, region, supabase, router, onClose]);

  if (!template) return null;

  const savings = savingsPct(template.awsCost, template.saasCost);
  const cheaper = isCheaper(template.awsCost, template.saasCost);

  return (
    <Dialog.Root open={open} onOpenChange={(v) => !v && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay
          className="fixed inset-0 z-50"
          style={{ background: "rgba(0,0,0,0.8)", backdropFilter: "blur(4px)" }}
        />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-2xl outline-none"
          style={{
            background: "#0d0d0d",
            border: "1px solid rgba(0,229,255,0.15)",
            boxShadow: "0 0 80px rgba(0,229,255,0.06), 0 40px 100px rgba(0,0,0,0.6)",
            maxHeight: "90vh",
            overflowY: "auto",
          }}
        >
          {/* Header */}
          <div
            className="flex items-start gap-4 p-6"
            style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
          >
            <div
              className={`w-12 h-12 ${template.color} rounded-xl flex items-center justify-center text-xl shrink-0`}
              style={{ boxShadow: "0 0 20px rgba(0,0,0,0.4)" }}
            >
              {template.icon}
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-bold text-white tracking-tight">{template.name}</h2>
              <p className="text-sm mt-0.5" style={{ color: "#64748B" }}>
                {template.description}
              </p>
            </div>
            <Dialog.Close
              className="flex items-center justify-center w-8 h-8 rounded-lg transition-colors duration-150 shrink-0"
              style={{ color: "#475569" }}
            >
              <X className="w-4 h-4" />
            </Dialog.Close>
          </div>

          <div className="p-6 space-y-6">
            {/* What gets deployed */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: "#475569" }}>
                What gets deployed
              </p>
              <div className="flex flex-wrap gap-2">
                {template.modules.map((mod) => (
                  <span
                    key={mod}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium"
                    style={{
                      background: "rgba(0,229,255,0.06)",
                      border: "1px solid rgba(0,229,255,0.15)",
                      color: "#00E5FF",
                    }}
                  >
                    <Check className="w-3 h-3" />
                    {mod}
                  </span>
                ))}
              </div>
            </div>

            {/* AWS Region */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: "#475569" }}>
                AWS Region
              </label>
              <div className="relative">
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color: "#475569" }} />
                <select
                  value={region}
                  onChange={(e) => setRegion(e.target.value)}
                  className="w-full pl-9 pr-4 py-2.5 rounded-xl text-sm appearance-none outline-none transition-colors duration-150"
                  style={{
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    color: "#E2E8F0",
                  }}
                >
                  {AWS_REGIONS.map((r) => (
                    <option key={r.value} value={r.value} style={{ background: "#0d0d0d" }}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Env vars */}
            {template.envVars.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: "#475569" }}>
                  Configuration
                </p>
                <div className="space-y-3">
                  {template.envVars.map((ev) => (
                    <div key={ev.key}>
                      <label className="block text-xs font-medium mb-1.5" style={{ color: "#94A3B8" }}>
                        {ev.label}
                      </label>
                      <input
                        type={ev.secret ? "password" : "text"}
                        placeholder={ev.placeholder}
                        value={config[ev.key] ?? ""}
                        onChange={(e) => setConfig((prev) => ({ ...prev, [ev.key]: e.target.value }))}
                        className="w-full px-3 py-2.5 rounded-xl text-sm outline-none transition-colors duration-150"
                        style={{
                          background: "rgba(255,255,255,0.04)",
                          border: "1px solid rgba(255,255,255,0.08)",
                          color: "#E2E8F0",
                        }}
                        onFocus={(e) => {
                          (e.currentTarget as HTMLElement).style.borderColor = "rgba(0,229,255,0.35)";
                        }}
                        onBlur={(e) => {
                          (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,0.08)";
                        }}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Cost estimate */}
            <div
              className="rounded-xl p-4"
              style={{
                background: "rgba(0,229,255,0.03)",
                border: "1px solid rgba(0,229,255,0.1)",
              }}
            >
              <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: "#475569" }}>
                Estimated monthly cost
              </p>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-2xl font-bold text-white">~${template.awsCost}<span className="text-sm font-normal" style={{ color: "#64748B" }}>/mo</span></p>
                  <p className="text-xs mt-0.5" style={{ color: "#64748B" }}>on your AWS account</p>
                </div>
                {cheaper && (
                  <div className="text-right">
                    <p className="text-sm line-through" style={{ color: "#475569" }}>${template.saasCost}/mo on {template.saasLabel}</p>
                    <p className="text-sm font-semibold" style={{ color: "#10B981" }}>Save {savings}% vs SaaS</p>
                  </div>
                )}
              </div>
              <p className="text-xs mt-3" style={{ color: "#334155" }}>
                With AWS Activate credits, your first 12 months may be free.
              </p>
            </div>

            {/* Error */}
            {error && (
              <p className="text-sm rounded-xl px-4 py-3" style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", color: "#f87171" }}>
                {error}
              </p>
            )}

            {/* Actions */}
            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 px-4 py-3 rounded-xl text-sm font-semibold transition-all duration-150"
                style={{
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  color: "#94A3B8",
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleDeploy}
                disabled={deploying || success}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-bold text-black transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                  background: success ? "#10B981" : "#00E5FF",
                  boxShadow: success ? "0 0 24px rgba(16,185,129,0.4)" : "0 0 24px rgba(0,229,255,0.4)",
                }}
              >
                {success ? (
                  <>
                    <Check className="w-4 h-4" />
                    Project created
                  </>
                ) : deploying ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Creating project...
                  </>
                ) : (
                  <>
                    <ArrowRight className="w-4 h-4" />
                    Deploy to My AWS
                  </>
                )}
              </button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// ---------------------------------------------------------------------------
// Template Card
// ---------------------------------------------------------------------------

function TemplateCard({
  template,
  onDeploy,
}: {
  template: Template;
  onDeploy: (t: Template) => void;
}) {
  const savings = savingsPct(template.awsCost, template.saasCost);
  const cheaper = isCheaper(template.awsCost, template.saasCost);

  const categoryColors: Record<string, { bg: string; text: string; border: string }> = {
    automation: { bg: "rgba(249,115,22,0.1)", text: "#fb923c", border: "rgba(249,115,22,0.2)" },
    analytics:  { bg: "rgba(59,130,246,0.1)", text: "#60a5fa", border: "rgba(59,130,246,0.2)" },
    cms:        { bg: "rgba(34,197,94,0.1)",  text: "#4ade80", border: "rgba(34,197,94,0.2)"  },
    storage:    { bg: "rgba(239,68,68,0.1)",  text: "#f87171", border: "rgba(239,68,68,0.2)"  },
    database:   { bg: "rgba(168,85,247,0.1)", text: "#c084fc", border: "rgba(168,85,247,0.2)" },
  };
  const catColor = categoryColors[template.category] ?? categoryColors.database;

  return (
    <div
      className="group relative rounded-2xl p-5 flex flex-col gap-4 transition-all duration-200"
      style={{
        background: "rgba(255,255,255,0.025)",
        border: "1px solid rgba(255,255,255,0.06)",
      }}
      onMouseEnter={(e) => {
        const el = e.currentTarget as HTMLElement;
        el.style.borderColor = "rgba(0,229,255,0.25)";
        el.style.boxShadow = "0 0 30px rgba(0,229,255,0.06)";
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget as HTMLElement;
        el.style.borderColor = "rgba(255,255,255,0.06)";
        el.style.boxShadow = "none";
      }}
    >
      {/* Savings badge — top-right */}
      {cheaper && savings > 0 && (
        <div
          className="absolute top-4 right-4 flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold"
          style={{
            background: "rgba(16,185,129,0.12)",
            border: "1px solid rgba(16,185,129,0.25)",
            color: "#10B981",
          }}
        >
          <TrendingDown className="w-3 h-3" />
          Save {savings}%
        </div>
      )}

      {/* Icon + category */}
      <div className="flex items-start gap-3">
        <div
          className={`w-11 h-11 ${template.color} rounded-xl flex items-center justify-center text-xl shrink-0`}
          style={{ boxShadow: "0 0 16px rgba(0,0,0,0.3)" }}
        >
          {template.icon}
        </div>
        <div>
          <h3 className="text-sm font-bold text-white leading-tight">{template.name}</h3>
          <span
            className="inline-block mt-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider"
            style={{ background: catColor.bg, color: catColor.text, border: `1px solid ${catColor.border}` }}
          >
            {template.category}
          </span>
        </div>
      </div>

      {/* Description */}
      <p className="text-sm leading-relaxed flex-1" style={{ color: "#64748B" }}>
        {template.description}
      </p>

      {/* Pricing */}
      <div
        className="rounded-xl p-3"
        style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)" }}
      >
        <div className="flex items-baseline gap-1.5">
          <span className="text-lg font-bold text-white">~${template.awsCost}</span>
          <span className="text-xs" style={{ color: "#475569" }}>/mo on AWS</span>
        </div>
        {cheaper ? (
          <p className="text-xs mt-0.5">
            <span className="line-through" style={{ color: "#334155" }}>${template.saasCost}/mo</span>
            <span className="ml-1.5" style={{ color: "#64748B" }}>on {template.saasLabel}</span>
          </p>
        ) : (
          <p className="text-xs mt-0.5" style={{ color: "#64748B" }}>
            Similar to {template.saasLabel} pricing
          </p>
        )}
      </div>

      {/* Deploy button */}
      <button
        onClick={() => onDeploy(template)}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold text-black transition-all duration-200"
        style={{
          background: "#00E5FF",
          boxShadow: "0 0 20px rgba(0,229,255,0.25)",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLElement).style.boxShadow = "0 0 30px rgba(0,229,255,0.45)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.boxShadow = "0 0 20px rgba(0,229,255,0.25)";
        }}
      >
        Deploy Now
        <ArrowRight className="w-4 h-4" />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function TemplatesPage() {
  const [activeCategory, setActiveCategory] = useState<Category>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const gridRef = useRef<HTMLDivElement>(null);

  const filtered = TEMPLATES.filter((t) => {
    const matchCat = activeCategory === "all" || t.category === activeCategory;
    const q = searchQuery.toLowerCase();
    const matchSearch =
      !q ||
      t.name.toLowerCase().includes(q) ||
      t.description.toLowerCase().includes(q) ||
      t.tags.some((tag) => tag.includes(q));
    return matchCat && matchSearch;
  });

  // Stagger-in animation on mount via CSS
  useEffect(() => {
    if (!gridRef.current) return;
    const cards = gridRef.current.querySelectorAll<HTMLElement>(".template-card");
    cards.forEach((card, i) => {
      card.style.opacity = "0";
      card.style.transform = "translateY(20px)";
      card.style.transition = `opacity 0.4s ${i * 0.06}s ease-out, transform 0.4s ${i * 0.06}s ease-out`;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          card.style.opacity = "1";
          card.style.transform = "translateY(0)";
        });
      });
    });
  }, [activeCategory, searchQuery]);

  const handleDeploy = (template: Template) => {
    setSelectedTemplate(template);
    setModalOpen(true);
  };

  return (
    <div className="p-8 max-w-6xl mx-auto">
      {/* Page header */}
      <div className="mb-10">
        <div
          className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-widest mb-4"
          style={{
            background: "rgba(0,229,255,0.06)",
            border: "1px solid rgba(0,229,255,0.15)",
            color: "#00E5FF",
          }}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" style={{ animation: "pulse-glow 2s ease-in-out infinite" }} />
          App Marketplace
        </div>
        <h1
          className="text-3xl font-bold tracking-tight text-white mb-3"
          style={{ letterSpacing: "-0.03em" }}
        >
          Deploy open-source apps to your AWS
        </h1>
        <p className="text-base max-w-lg" style={{ color: "#64748B", lineHeight: "1.6" }}>
          One-click deployment of the best open-source tools. Own your data, cut your SaaS bill, run on your own infrastructure.
        </p>
      </div>

      {/* Search + filter bar */}
      <div className="flex flex-col sm:flex-row gap-4 mb-8">
        {/* Search */}
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color: "#475569" }} />
          <input
            type="text"
            placeholder="Search templates..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 rounded-xl text-sm outline-none transition-colors duration-150"
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
              color: "#E2E8F0",
            }}
          />
        </div>

        {/* Category tabs */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className="px-3.5 py-2 rounded-xl text-sm font-medium transition-all duration-150"
              style={
                activeCategory === cat.id
                  ? {
                      background: "rgba(0,229,255,0.1)",
                      border: "1px solid rgba(0,229,255,0.25)",
                      color: "#00E5FF",
                    }
                  : {
                      background: "rgba(255,255,255,0.03)",
                      border: "1px solid rgba(255,255,255,0.07)",
                      color: "#64748B",
                    }
              }
            >
              {cat.label}
              <span
                className="ml-1.5 text-xs opacity-60"
              >
                {cat.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <div className="text-center py-20" style={{ color: "#475569" }}>
          <Globe className="w-10 h-10 mx-auto mb-4 opacity-30" />
          <p className="text-base">No templates match your search.</p>
        </div>
      ) : (
        <div
          ref={gridRef}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
        >
          {filtered.map((t) => (
            <div key={t.id} className="template-card">
              <TemplateCard template={t} onDeploy={handleDeploy} />
            </div>
          ))}
        </div>
      )}

      {/* Coming soon footer */}
      <div className="mt-12 text-center">
        <p className="text-sm" style={{ color: "#334155" }}>
          More templates coming soon &mdash;&nbsp;
          <a
            href="mailto:hello@infraready.io"
            className="transition-colors duration-150 hover:text-white"
            style={{ color: "#475569" }}
          >
            request one
          </a>
        </p>
      </div>

      {/* Deploy modal */}
      <DeployModal
        template={selectedTemplate}
        open={modalOpen}
        onClose={() => setModalOpen(false)}
      />
    </div>
  );
}
