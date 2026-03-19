import Link from "next/link";
import {
  Rocket,
  Code,
  Terminal,
  Shield,
  Lock,
  CreditCard,
  Check,
  ArrowRight,
  ChevronRight,
  X,
  TrendingDown,
} from "lucide-react";
import { createServerClient } from "@/lib/supabase/server";
import { Nav } from "@/components/landing/Nav";
import { WaitlistForm } from "@/components/landing/WaitlistForm";
import { HeroBackground } from "@/components/landing/HeroBackground";
import { TiltCard } from "@/components/landing/TiltCard";
import { CostCalculator } from "@/components/CostCalculator";

// ─── Auth check (server) ─────────────────────────────────────────────────────
async function getUser() {
  try {
    const supabase = await createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return user;
  } catch {
    return null;
  }
}

// ─── Features data ────────────────────────────────────────────────────────────
const features = [
  {
    icon: Rocket,
    title: "One-click deploy",
    desc: "VPC, RDS, ECS, S3, and security baseline provisioned in 20 minutes. No YAML, no console clicking.",
    span: "md:col-span-2",
  },
  {
    icon: Code,
    title: "You own the code",
    desc: "Pure OpenTofu. No proprietary syntax. Download and run it yourself — zero lock-in.",
    span: "",
  },
  {
    icon: Terminal,
    title: "Real-time logs",
    desc: "Watch every resource deploy live. Failures auto-retry and self-heal.",
    span: "",
  },
  {
    icon: Shield,
    title: "Least-privilege IAM",
    desc: "We request only the permissions we need. Revoke our access any time with one click.",
    span: "",
  },
  {
    icon: Lock,
    title: "SOC2-ready baseline",
    desc: "GuardDuty, Security Hub, and Config all wired up from day one. Audit-ready out of the box.",
    span: "",
  },
  {
    icon: CreditCard,
    title: "AWS credits friendly",
    desc: "Use your Activate or Promotional credits. We deploy to YOUR account — you capture the savings.",
    span: "md:col-span-2",
  },
];

// ─── How it works ─────────────────────────────────────────────────────────────
const steps = [
  {
    num: "01",
    title: "Connect",
    desc: "Run one CloudFormation stack in your AWS account. We get a scoped IAM role. You keep full control.",
  },
  {
    num: "02",
    title: "Configure",
    desc: "Pick your modules. Set your options. We generate clean OpenTofu — no proprietary syntax, ever.",
  },
  {
    num: "03",
    title: "Deploy",
    desc: "Watch your infrastructure deploy in real time. Every resource tracked. Every failure auto-retried.",
  },
];

// ─── Logo marquee items ───────────────────────────────────────────────────────
const marqueeItems = [
  "Lovable",
  "Bolt.new",
  "Cursor",
  "AWS",
  "GitHub",
  "OpenTofu",
  "Terraform",
  "Claude AI",
  "Supabase",
  "Vercel",
  "Docker",
  "Kubernetes",
  "Replit",
  "v0 by Vercel",
];

// ─── Free tier features ───────────────────────────────────────────────────────
const freeTierFeatures = [
  "1 environment (VPC + full stack)",
  "All 5 modules included",
  "Real-time deploy logs",
  "OpenTofu export",
  "SOC2-ready baseline",
  "No credit card required",
];

// ─── Featured templates (for landing page preview) ───────────────────────────
const featuredTemplates = [
  { id: "n8n",      name: "n8n",                icon: "⚡", color: "bg-orange-500", desc: "Workflow automation",        awsCost: 24, saasCost: 50,  savings: 52 },
  { id: "ghost",    name: "Ghost",               icon: "👻", color: "bg-green-500",  desc: "Blog & newsletter platform", awsCost: 20, saasCost: 36,  savings: 44 },
  { id: "plausible",name: "Plausible Analytics", icon: "📊", color: "bg-blue-500",   desc: "Privacy-friendly analytics", awsCost: 15, saasCost: 19,  savings: 21 },
  { id: "metabase", name: "Metabase",            icon: "📈", color: "bg-blue-600",   desc: "Business intelligence",      awsCost: 20, saasCost: 500, savings: 96 },
];

// Your App card is rendered separately — always first in the marketplace grid

// ─── AI Builder platforms ─────────────────────────────────────────────────────
const aiBuilders = [
  { name: "Lovable", badge: "8M users", color: "#FF6B6B", exports: "React + Vite → GitHub" },
  { name: "Bolt.new", badge: "5M signups", color: "#F59E0B", exports: "React / Node → ZIP" },
  { name: "Cursor", badge: "2M paying", color: "#00E5FF", exports: "Any language → GitHub" },
  { name: "Replit", badge: "35M registered", color: "#F97316", exports: "Any language → ZIP" },
  { name: "v0 by Vercel", badge: "6M devs", color: "#8B5CF6", exports: "Next.js → GitHub" },
];

const lovableSteps = [
  {
    num: "01",
    title: "Export from your AI builder",
    desc: "In Lovable: click GitHub → Push to repo. In Bolt: click Export → Download ZIP then push to GitHub. Cursor users already have a local repo — just push it.",
    code: "# Lovable auto-syncs every save. For Bolt:\ngit init && git add . && git push origin main",
  },
  {
    num: "02",
    title: "Connect GitHub + AWS to InfraReady",
    desc: "Paste your GitHub repo URL. Run our one-time CloudFormation stack in your AWS account (takes 2 min). We get a scoped IAM role — you keep full control.",
    code: "# One CloudFormation command in your AWS console\n# Stack URL: s3://infraready-public/bootstrap-role.yaml",
  },
  {
    num: "03",
    title: "Deploy — your app is live on AWS",
    desc: "InfraReady provisions VPC, ECS, and a CI/CD pipeline. Every git push after this automatically rebuilds and redeploys your app. Zero DevOps.",
    code: "✓ VPC created\n✓ ECS cluster ready\n✓ Deploy pipeline wired to your GitHub\n✓ App live at your domain",
  },
];

// ─── Pain points ─────────────────────────────────────────────────────────────
const oldWay = [
  "Read 400 pages of AWS docs",
  "Spend 3 weeks configuring VPCs",
  "Hire a DevOps engineer ($180K/yr)",
  "Watch $40K in AWS credits expire",
  "Pay Heroku $400/mo in desperation",
];

const newWay = [
  "Connect your AWS account (2 min)",
  "Pick your modules",
  "Click deploy",
  "Use your AWS credits",
  "Own your OpenTofu forever",
];

// ─── Page ─────────────────────────────────────────────────────────────────────
export default async function LandingPage() {
  const user = await getUser();
  const isAuthenticated = !!user;

  return (
    <div
      className="min-h-screen text-white overflow-x-hidden"
      style={{ background: "#000000" }}
    >
      <Nav isAuthenticated={isAuthenticated} />

      {/* ════════════════════════════════════════════════════════
          HERO
      ════════════════════════════════════════════════════════ */}
      <section
        className="relative min-h-screen flex items-center pt-32 pb-20 px-6"
        style={{ isolation: "isolate" }}
      >
        <HeroBackground />

        <div className="relative z-10 max-w-[1100px] mx-auto w-full">
          <div className="max-w-[700px]">
            {/* Badge */}
            <div
              className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold mb-8"
              style={{
                background: "rgba(0, 229, 255, 0.06)",
                border: "1px solid rgba(0, 229, 255, 0.18)",
                color: "#00E5FF",
                animation: "fade-up 0.5s ease-out both",
              }}
            >
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{
                  background: "#10B981",
                  boxShadow: "0 0 6px #10B981",
                  animation: "pulse-glow 2s ease-in-out infinite",
                }}
              />
              Now in early access &mdash; limited spots
              <ArrowRight size={12} />
            </div>

            {/* H1 */}
            <h1
              className="font-extrabold text-white leading-[1.04] mb-6"
              style={{
                fontSize: "clamp(44px, 6.5vw, 80px)",
                letterSpacing: "-0.04em",
                animation: "fade-up 0.6s 0.1s ease-out both",
              }}
            >
              Deploy AWS infrastructure.
              <br />
              <span
                style={{
                  background: "linear-gradient(135deg, #00E5FF 0%, #0EA5E9 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                }}
              >
                Own it forever.
              </span>
            </h1>

            {/* Subtext */}
            <p
              className="text-[18px] leading-relaxed mb-10 max-w-[560px]"
              style={{
                color: "#94A3B8",
                animation: "fade-up 0.6s 0.2s ease-out both",
              }}
            >
              Connect your GitHub + AWS in 2 minutes. We deploy VPC, RDS, ECS, S3,
              and security baseline using OpenTofu. You keep the code forever.
            </p>

            {/* CTA buttons */}
            <div
              className="flex flex-col sm:flex-row items-start gap-3 mb-6"
              style={{ animation: "fade-up 0.6s 0.3s ease-out both" }}
            >
              <Link
                href="/login"
                className="inline-flex items-center gap-2 px-7 py-3.5 rounded-xl font-bold text-sm text-black transition-all duration-200"
                style={{
                  background: "#00E5FF",
                  boxShadow: "0 0 30px rgba(0,229,255,0.5)",
                }}
              >
                <Rocket size={16} />
                Deploy Free
              </Link>
              <a
                href="#how-it-works"
                className="inline-flex items-center gap-2 px-7 py-3.5 rounded-xl font-semibold text-sm text-white transition-all duration-200"
                style={{
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.12)",
                }}
              >
                See how it works
                <ArrowRight size={15} />
              </a>
            </div>

            {/* Trust line */}
            <p
              className="text-xs"
              style={{
                color: "#475569",
                animation: "fade-up 0.6s 0.4s ease-out both",
              }}
            >
              Free forever for 1 environment &nbsp;&middot;&nbsp; No credit card
              &nbsp;&middot;&nbsp; Your AWS account
            </p>
          </div>

          {/* Terminal mockup — floated right on desktop */}
          <div
            className="hidden lg:block absolute right-0 top-1/2"
            style={{
              transform: "translateY(-50%) perspective(1000px) rotateY(-6deg) rotateX(2deg)",
              animation: "fade-in 0.8s 0.5s ease-out both",
            }}
          >
            <HeroTerminal />
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════
          LOGO MARQUEE BAR
      ════════════════════════════════════════════════════════ */}
      <div
        className="py-5 overflow-hidden"
        style={{ borderTop: "1px solid rgba(255,255,255,0.06)", borderBottom: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.01)" }}
      >
        <div className="flex items-center gap-6 max-w-[1100px] mx-auto px-6 mb-4">
          <span className="text-xs font-medium whitespace-nowrap shrink-0" style={{ color: "#475569" }}>
            Trusted by builders using:
          </span>
        </div>
        <div className="relative overflow-hidden">
          {/* Fade masks */}
          <div className="absolute inset-y-0 left-0 w-20 z-10" style={{ background: "linear-gradient(to right, #000, transparent)" }} />
          <div className="absolute inset-y-0 right-0 w-20 z-10" style={{ background: "linear-gradient(to left, #000, transparent)" }} />

          <div className="flex animate-marquee gap-8" style={{ width: "max-content" }}>
            {[...marqueeItems, ...marqueeItems].map((item, i) => (
              <span
                key={`${item}-${i}`}
                className="px-4 py-1.5 rounded-lg text-xs font-semibold tracking-wide whitespace-nowrap select-none"
                style={{
                  color: "#475569",
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.06)",
                }}
              >
                {item}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════
          PAIN / SOLUTION
      ════════════════════════════════════════════════════════ */}
      <section className="py-28 px-6">
        <div className="max-w-[1100px] mx-auto">
          <p className="text-xs font-semibold uppercase tracking-widest mb-4" style={{ color: "#00E5FF" }}>
            The problem
          </p>
          <h2
            className="font-bold text-white mb-14"
            style={{ fontSize: "clamp(28px, 3.5vw, 48px)", letterSpacing: "-0.03em", lineHeight: 1.1 }}
          >
            You ship fast. Deployment stops you cold.
          </h2>

          <div className="grid md:grid-cols-2 gap-5">
            {/* Old way */}
            <div
              className="p-7 rounded-2xl"
              style={{
                background: "rgba(255,255,255,0.02)",
                border: "1px solid rgba(255,255,255,0.06)",
              }}
            >
              <p className="text-xs font-bold uppercase tracking-widest mb-6" style={{ color: "#475569" }}>
                The old way
              </p>
              <ul className="space-y-3.5 font-mono text-sm">
                {oldWay.map((item) => (
                  <li key={item} className="flex items-start gap-3">
                    <span
                      className="flex items-center justify-center w-5 h-5 rounded-full shrink-0 mt-0.5"
                      style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.2)" }}
                    >
                      <X size={10} className="text-red-400" />
                    </span>
                    <span style={{ color: "#94A3B8" }}>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* New way */}
            <div
              className="p-7 rounded-2xl"
              style={{
                background: "rgba(0, 229, 255, 0.02)",
                border: "1px solid rgba(0, 229, 255, 0.12)",
                boxShadow: "0 0 40px rgba(0,229,255,0.04)",
              }}
            >
              <p className="text-xs font-bold uppercase tracking-widest mb-6" style={{ color: "#00E5FF" }}>
                With InfraReady
              </p>
              <ul className="space-y-3.5 font-mono text-sm">
                {newWay.map((item) => (
                  <li key={item} className="flex items-start gap-3">
                    <span
                      className="flex items-center justify-center w-5 h-5 rounded-full shrink-0 mt-0.5"
                      style={{ background: "rgba(16,185,129,0.12)", border: "1px solid rgba(16,185,129,0.2)" }}
                    >
                      <Check size={10} className="text-emerald-400" />
                    </span>
                    <span style={{ color: "#94A3B8" }}>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════
          AI BUILDER ESCAPE HATCH
      ════════════════════════════════════════════════════════ */}
      <section
        id="ai-builders"
        className="py-28 px-6"
        style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}
      >
        <div className="max-w-[1100px] mx-auto">
          {/* Header */}
          <div className="max-w-[680px] mb-16">
            <p className="text-xs font-semibold uppercase tracking-widest mb-4" style={{ color: "#00E5FF" }}>
              For AI builder users
            </p>
            <h2
              className="font-bold text-white mb-5"
              style={{ fontSize: "clamp(28px, 3.5vw, 48px)", letterSpacing: "-0.03em", lineHeight: 1.1 }}
            >
              Built with Lovable, Bolt, or Cursor?
              <br />
              <span style={{
                background: "linear-gradient(135deg, #00E5FF 0%, #0EA5E9 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}>
                Deploy it to your own AWS.
              </span>
            </h2>
            <p className="text-base leading-relaxed mb-8" style={{ color: "#94A3B8" }}>
              Every major AI builder exports code to GitHub. InfraReady takes it from there — deploying your app to <strong className="text-white">your</strong> AWS account with production-grade infrastructure in 20 minutes. No DevOps. No Kubernetes. You own everything.
            </p>

            {/* Platform pills */}
            <div className="flex flex-wrap gap-2.5">
              {aiBuilders.map((b) => (
                <div
                  key={b.name}
                  className="flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold"
                  style={{
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    color: "#CBD5E1",
                  }}
                >
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ background: b.color, boxShadow: `0 0 6px ${b.color}` }}
                  />
                  <span className="text-white font-bold">{b.name}</span>
                  <span style={{ color: "#475569" }}>{b.badge}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Callout — Lovable feature request */}
          <div
            className="flex items-start gap-4 p-5 rounded-2xl mb-14 max-w-2xl"
            style={{
              background: "rgba(255, 107, 107, 0.05)",
              border: "1px solid rgba(255, 107, 107, 0.15)",
            }}
          >
            <div
              className="shrink-0 flex items-center justify-center w-8 h-8 rounded-lg text-sm font-bold"
              style={{ background: "rgba(255,107,107,0.15)", color: "#FF6B6B" }}
            >
              !
            </div>
            <div>
              <p className="text-sm font-semibold text-white mb-1">
                Lovable users: AWS deploy is the #1 requested feature — and InfraReady already ships it.
              </p>
              <p className="text-xs leading-relaxed" style={{ color: "#64748B" }}>
                There&apos;s an open feature request on Lovable&apos;s feedback portal titled &quot;AWS automatic deployment integration&quot; with 30+ upvotes, status &quot;In Review.&quot; Lovable hasn&apos;t built it. InfraReady has.
              </p>
            </div>
          </div>

          {/* Step-by-step instructions */}
          <div className="mb-10">
            <p className="text-xs font-semibold uppercase tracking-widest mb-8" style={{ color: "#475569" }}>
              How to deploy your Lovable / Bolt / Cursor app to AWS
            </p>
            <div className="grid md:grid-cols-3 gap-6">
              {lovableSteps.map((step) => (
                <div
                  key={step.num}
                  className="rounded-2xl overflow-hidden"
                  style={{
                    background: "rgba(255,255,255,0.025)",
                    border: "1px solid rgba(255,255,255,0.06)",
                  }}
                >
                  {/* Step header */}
                  <div
                    className="px-5 py-4 flex items-center gap-3"
                    style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}
                  >
                    <span
                      className="text-xs font-black"
                      style={{ color: "rgba(0,229,255,0.4)", letterSpacing: "-0.04em" }}
                    >
                      {step.num}
                    </span>
                    <h3 className="text-sm font-bold text-white">{step.title}</h3>
                  </div>
                  {/* Body */}
                  <div className="p-5">
                    <p className="text-xs leading-relaxed mb-4" style={{ color: "#94A3B8" }}>
                      {step.desc}
                    </p>
                    {/* Code snippet */}
                    <div
                      className="rounded-lg p-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-all"
                      style={{
                        background: "rgba(0,0,0,0.4)",
                        border: "1px solid rgba(0,229,255,0.08)",
                        color: "#10B981",
                        overflowX: "scroll",
                        WebkitOverflowScrolling: "touch",
                      }}
                    >
                      {step.code}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* CTA */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <Link
              href="/login"
              className="inline-flex items-center gap-2 px-7 py-3.5 rounded-xl font-bold text-sm text-black transition-all duration-200"
              style={{
                background: "#00E5FF",
                boxShadow: "0 0 30px rgba(0,229,255,0.45)",
              }}
            >
              <Rocket size={16} />
              Deploy my Lovable app
            </Link>
            <p className="text-xs" style={{ color: "#475569" }}>
              Free forever for 1 environment &middot; No credit card &middot; Your AWS account
            </p>
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════
          FEATURES BENTO GRID
      ════════════════════════════════════════════════════════ */}
      <section id="features" className="py-28 px-6" style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
        <div className="max-w-[1100px] mx-auto">
          <p className="text-xs font-semibold uppercase tracking-widest mb-4" style={{ color: "#00E5FF" }}>
            Everything included
          </p>
          <h2
            className="font-bold text-white mb-5"
            style={{ fontSize: "clamp(28px, 3.5vw, 48px)", letterSpacing: "-0.03em", lineHeight: 1.1 }}
          >
            Production infra. Zero expertise required.
          </h2>
          <p className="mb-14 max-w-lg" style={{ color: "#94A3B8", fontSize: "17px", lineHeight: "1.6" }}>
            Five battle-tested modules, security baseline, and real-time observability — all wired together.
          </p>

          <div className="grid md:grid-cols-3 gap-4">
            {features.map((f) => {
              const Icon = f.icon;
              return (
                <TiltCard
                  key={f.title}
                  className={`${f.span} p-6 rounded-2xl group cursor-default transition-all duration-300`}
                  style={{
                    background: "rgba(255,255,255,0.025)",
                    border: "1px solid rgba(255,255,255,0.06)",
                  } as React.CSSProperties}
                  intensity={6}
                >
                  <FeatureCard Icon={Icon} title={f.title} desc={f.desc} />
                </TiltCard>
              );
            })}
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════
          HOW IT WORKS
      ════════════════════════════════════════════════════════ */}
      <section
        id="how-it-works"
        className="py-28 px-6"
        style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}
      >
        <div className="max-w-[1100px] mx-auto">
          <p className="text-xs font-semibold uppercase tracking-widest mb-4" style={{ color: "#00E5FF" }}>
            How it works
          </p>
          <h2
            className="font-bold text-white mb-16"
            style={{ fontSize: "clamp(28px, 3.5vw, 48px)", letterSpacing: "-0.03em", lineHeight: 1.1 }}
          >
            From zero to production in three steps.
          </h2>

          <div className="grid md:grid-cols-3 gap-0 mb-16 relative">
            {/* Connector line */}
            <div
              className="hidden md:block absolute top-8 left-1/3 right-1/3 h-px"
              style={{ background: "linear-gradient(90deg, rgba(0,229,255,0.15), rgba(0,229,255,0.15))" }}
            />

            {steps.map((step, i) => (
              <div
                key={step.num}
                className="relative px-6 first:pl-0 last:pr-0"
              >
                {/* Step number — big ghost numeral */}
                <div
                  className="font-black leading-none mb-3 select-none"
                  style={{
                    fontSize: "120px",
                    fontWeight: 900,
                    color: "rgba(0, 229, 255, 0.06)",
                    lineHeight: 1,
                    letterSpacing: "-0.06em",
                  }}
                  aria-hidden
                >
                  {step.num}
                </div>

                {/* Connector dot */}
                <div className="flex items-center gap-3 mb-4">
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs shrink-0"
                    style={{
                      background: "rgba(0, 229, 255, 0.08)",
                      border: "1px solid rgba(0, 229, 255, 0.25)",
                      color: "#00E5FF",
                    }}
                  >
                    {i + 1}
                  </div>
                  {i < steps.length - 1 && (
                    <div className="hidden md:flex gap-1.5 items-center">
                      {[0, 1, 2].map((d) => (
                        <div
                          key={d}
                          className="w-1.5 h-1.5 rounded-full animate-pulse-glow"
                          style={{
                            background: "rgba(0, 229, 255, 0.4)",
                            animationDelay: `${d * 0.3}s`,
                          }}
                        />
                      ))}
                    </div>
                  )}
                </div>

                <h3
                  className="text-white font-bold text-xl mb-2.5"
                  style={{ letterSpacing: "-0.02em" }}
                >
                  {step.title}
                </h3>
                <p className="text-sm leading-relaxed" style={{ color: "#94A3B8" }}>
                  {step.desc}
                </p>
              </div>
            ))}
          </div>

          {/* Terminal mockup */}
          <HeroTerminal wide />
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════
          TEMPLATE MARKETPLACE PREVIEW
      ════════════════════════════════════════════════════════ */}
      <section
        id="marketplace"
        className="py-28 px-6"
        style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}
      >
        <div className="max-w-[1100px] mx-auto">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-14">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest mb-4" style={{ color: "#00E5FF" }}>
                App Marketplace
              </p>
              <h2
                className="font-bold text-white"
                style={{ fontSize: "clamp(28px, 3.5vw, 48px)", letterSpacing: "-0.03em", lineHeight: 1.1 }}
              >
                Deploy popular apps.
                <br />
                No DevOps required.
              </h2>
              <p className="mt-4 max-w-sm" style={{ color: "#94A3B8", fontSize: "16px", lineHeight: "1.6" }}>
                One-click deployment for open-source tools you already use — on your AWS, at a fraction of the SaaS price.
              </p>
            </div>
            <Link
              href="/templates"
              className="inline-flex items-center gap-2 text-sm font-semibold shrink-0 transition-colors duration-150 hover:text-white"
              style={{ color: "#00E5FF" }}
            >
              View all templates
              <ArrowRight size={14} />
            </Link>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Your App card — always first */}
            <Link
              href="/login"
              className="group rounded-2xl p-5 flex flex-col gap-3 transition-all duration-200"
              style={{
                background: "linear-gradient(135deg, rgba(0,229,255,0.07) 0%, rgba(14,165,233,0.04) 100%)",
                border: "1px solid rgba(0,229,255,0.25)",
                boxShadow: "0 0 24px rgba(0,229,255,0.06)",
                textDecoration: "none",
              }}
            >
              <div className="flex items-start justify-between">
                <div
                  className="w-11 h-11 rounded-xl flex items-center justify-center text-sm font-bold shrink-0"
                  style={{ background: "rgba(0,229,255,0.12)", border: "1px solid rgba(0,229,255,0.25)", color: "#00E5FF" }}
                >
                  {"</>"}
                </div>
                <div
                  className="px-2 py-0.5 rounded-full text-[10px] font-bold"
                  style={{ background: "rgba(0,229,255,0.1)", border: "1px solid rgba(0,229,255,0.2)", color: "#00E5FF" }}
                >
                  Your App
                </div>
              </div>
              <div>
                <h3 className="text-sm font-bold text-white leading-tight">Lovable · Bolt · Cursor</h3>
                <p className="text-xs mt-1" style={{ color: "#64748B" }}>Deploy your AI-built app to your own AWS</p>
              </div>
              <div className="mt-auto">
                <p className="text-xs" style={{ color: "#475569" }}>Connect GitHub → deploy in 20 min</p>
              </div>
              <div
                className="flex items-center gap-1 text-xs font-semibold transition-colors duration-150"
                style={{ color: "#00E5FF" }}
              >
                Deploy My App
                <ChevronRight size={12} className="transition-transform duration-150 group-hover:translate-x-0.5" />
              </div>
            </Link>

            {featuredTemplates.map((t) => (
              <Link
                key={t.id}
                href="/templates"
                className="group rounded-2xl p-5 flex flex-col gap-4 transition-all duration-200"
                style={{
                  background: "rgba(255,255,255,0.025)",
                  border: "1px solid rgba(255,255,255,0.06)",
                  textDecoration: "none",
                }}
              >
                {/* Icon */}
                <div className="flex items-start justify-between">
                  <div
                    className={`w-11 h-11 ${t.color} rounded-xl flex items-center justify-center text-xl`}
                    style={{ boxShadow: "0 0 16px rgba(0,0,0,0.3)" }}
                  >
                    {t.icon}
                  </div>
                  {t.savings > 0 && (
                    <div
                      className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold"
                      style={{
                        background: "rgba(16,185,129,0.12)",
                        border: "1px solid rgba(16,185,129,0.25)",
                        color: "#10B981",
                      }}
                    >
                      <TrendingDown size={10} />
                      -{t.savings}%
                    </div>
                  )}
                </div>

                <div>
                  <h3 className="text-sm font-bold text-white leading-tight">{t.name}</h3>
                  <p className="text-xs mt-1" style={{ color: "#64748B" }}>{t.desc}</p>
                </div>

                <div className="mt-auto">
                  <span className="text-base font-bold text-white">~${t.awsCost}</span>
                  <span className="text-xs ml-1" style={{ color: "#475569" }}>/mo on AWS</span>
                  <p className="text-xs mt-0.5 line-through" style={{ color: "#334155" }}>
                    ${t.saasCost}/mo SaaS
                  </p>
                </div>

                <div
                  className="flex items-center gap-1 text-xs font-semibold transition-colors duration-150"
                  style={{ color: "#475569" }}
                >
                  Deploy Now
                  <ChevronRight size={12} className="transition-transform duration-150 group-hover:translate-x-0.5" />
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════
          COST CALCULATOR
      ════════════════════════════════════════════════════════ */}
      <section
        id="savings"
        className="py-28 px-6"
        style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}
      >
        <div className="max-w-[1100px] mx-auto">
          <div className="text-center mb-12">
            <p className="text-xs font-semibold uppercase tracking-widest mb-4" style={{ color: "#00E5FF" }}>
              The math
            </p>
            <h2
              className="font-bold text-white"
              style={{ fontSize: "clamp(28px, 3.5vw, 48px)", letterSpacing: "-0.03em", lineHeight: 1.1 }}
            >
              How much are you
              <br />
              leaving on the table?
            </h2>
            <p className="mt-4 text-base max-w-md mx-auto" style={{ color: "#94A3B8", lineHeight: "1.6" }}>
              Check the tools you pay for. See your AWS equivalent — instantly.
            </p>
          </div>
          <CostCalculator />
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════
          AWS ACTIVATE CREDITS
      ════════════════════════════════════════════════════════ */}
      <section
        id="aws-credits"
        className="py-28 px-6"
        style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}
      >
        <div className="max-w-[1100px] mx-auto">
          <div className="rounded-2xl overflow-hidden relative"
            style={{
              background: "linear-gradient(135deg, rgba(0,229,255,0.06) 0%, rgba(0,0,0,0) 60%)",
              border: "1px solid rgba(0,229,255,0.15)",
            }}
          >
            {/* Glow */}
            <div className="absolute top-0 left-0 w-64 h-64 rounded-full pointer-events-none"
              style={{ background: "radial-gradient(circle, rgba(0,229,255,0.08) 0%, transparent 70%)", transform: "translate(-30%, -30%)" }}
            />

            <div className="relative px-8 py-12 md:px-16 md:py-16 flex flex-col md:flex-row items-start md:items-center gap-10">
              {/* Left */}
              <div className="flex-1">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold mb-5"
                  style={{ background: "rgba(0,229,255,0.08)", border: "1px solid rgba(0,229,255,0.2)", color: "#00E5FF" }}
                >
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: "#00E5FF" }} />
                  AWS Activate
                </div>
                <h2 className="font-bold text-white mb-4"
                  style={{ fontSize: "clamp(24px, 3vw, 40px)", letterSpacing: "-0.03em", lineHeight: 1.15 }}
                >
                  Have AWS Activate credits?
                  <br />
                  <span style={{ color: "#00E5FF" }}>Deploy them in 20 minutes.</span>
                </h2>
                <p className="text-base mb-6 max-w-lg" style={{ color: "#94A3B8", lineHeight: "1.7" }}>
                  YC, Techstars, and AWS Activate give startups up to <strong className="text-white">$300,000 in AWS credits.</strong> Most founders let them expire because they can't figure out how to deploy anything. InfraReady turns those credits into running production infrastructure — VPC, RDS, ECS, security baseline — in one click.
                </p>
                <div className="flex flex-wrap gap-4 text-sm" style={{ color: "#64748B" }}>
                  {[
                    "No DevOps hire needed",
                    "Credits stay in your account",
                    "Infrastructure you own forever",
                  ].map((item) => (
                    <span key={item} className="flex items-center gap-1.5">
                      <Check size={13} className="text-[#00E5FF]" />
                      {item}
                    </span>
                  ))}
                </div>
              </div>

              {/* Right — credit tiers */}
              <div className="shrink-0 w-full md:w-72 flex flex-col gap-3">
                {[
                  { tier: "AWS Activate Founders", amount: "$1,000", color: "#64748B" },
                  { tier: "AWS Activate Portfolio", amount: "$5,000–$25,000", color: "#94A3B8" },
                  { tier: "YC + Techstars", amount: "Up to $100,000", color: "#00E5FF" },
                  { tier: "AWS Activate Select", amount: "Up to $300,000", color: "#00E5FF" },
                ].map((c) => (
                  <div key={c.tier} className="flex items-center justify-between px-4 py-3 rounded-xl"
                    style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
                  >
                    <span className="text-sm" style={{ color: "#94A3B8" }}>{c.tier}</span>
                    <span className="text-sm font-bold" style={{ color: c.color }}>{c.amount}</span>
                  </div>
                ))}
                <Link
                  href="/login"
                  className="mt-2 w-full flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-sm font-bold text-black transition-all duration-200"
                  style={{ background: "#00E5FF", boxShadow: "0 0 24px rgba(0,229,255,0.35)" }}
                >
                  Deploy my credits now
                  <ArrowRight size={15} />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════
          FREE TIER SECTION
      ════════════════════════════════════════════════════════ */}
      <section
        id="free-tier"
        className="py-28 px-6"
        style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}
      >
        <div className="max-w-[1100px] mx-auto">
          <div
            className="rounded-3xl p-12 md:p-16"
            style={{
              background: "linear-gradient(135deg, rgba(0,229,255,0.05) 0%, rgba(14,165,233,0.03) 100%)",
              border: "1px solid rgba(0, 229, 255, 0.15)",
              boxShadow: "0 0 80px rgba(0,229,255,0.05)",
            }}
          >
            {/* Badge */}
            <div
              className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-widest mb-6"
              style={{
                background: "rgba(0, 229, 255, 0.1)",
                border: "1px solid rgba(0, 229, 255, 0.2)",
                color: "#00E5FF",
              }}
            >
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{ background: "#00E5FF" }}
              />
              Free Forever
            </div>

            <h2
              className="font-bold text-white mb-3"
              style={{ fontSize: "clamp(28px, 3.5vw, 48px)", letterSpacing: "-0.03em", lineHeight: 1.1 }}
            >
              Start building.
              <br />
              <span style={{
                background: "linear-gradient(135deg, #00E5FF, #0EA5E9)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}>
                Pay when you scale.
              </span>
            </h2>
            <p className="text-base mb-10 max-w-md" style={{ color: "#94A3B8", lineHeight: "1.6" }}>
              Everything you need to get production infrastructure running — completely free for your first environment.
            </p>

            {/* Feature grid */}
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-10">
              {freeTierFeatures.map((feat) => (
                <div key={feat} className="flex items-center gap-3">
                  <span
                    className="flex items-center justify-center w-5 h-5 rounded-full shrink-0"
                    style={{
                      background: "rgba(16,185,129,0.15)",
                      border: "1px solid rgba(16,185,129,0.25)",
                    }}
                  >
                    <Check size={11} className="text-emerald-400" />
                  </span>
                  <span className="text-sm" style={{ color: "#94A3B8" }}>{feat}</span>
                </div>
              ))}
            </div>

            {/* CTA */}
            <div className="flex flex-col sm:flex-row items-start gap-4">
              <Link
                href="/login"
                className="inline-flex items-center gap-2 px-7 py-3.5 rounded-xl font-bold text-sm text-black transition-all duration-200"
                style={{
                  background: "#00E5FF",
                  boxShadow: "0 0 30px rgba(0,229,255,0.45)",
                }}
              >
                Deploy your first environment
                <ArrowRight size={16} />
              </Link>
            </div>
            <p className="mt-4 text-xs" style={{ color: "#475569" }}>
              When you&apos;re ready to scale: multi-environment, team access, and priority support.
            </p>
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════
          WAITLIST
      ════════════════════════════════════════════════════════ */}
      <section
        id="waitlist"
        className="py-28 px-6"
        style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}
      >
        <div className="max-w-[1100px] mx-auto">
          <div className="max-w-[520px] mx-auto text-center">
            <div
              className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold mb-6"
              style={{
                background: "rgba(0, 229, 255, 0.06)",
                border: "1px solid rgba(0, 229, 255, 0.15)",
                color: "#00E5FF",
              }}
            >
              <span
                className="w-1.5 h-1.5 rounded-full animate-pulse-glow"
                style={{ background: "#10B981" }}
              />
              200+ founders waiting
            </div>

            <h2
              className="font-bold text-white mb-4"
              style={{ fontSize: "clamp(28px, 3.5vw, 44px)", letterSpacing: "-0.03em", lineHeight: 1.1 }}
            >
              Join the waitlist.
              <br />
              Skip the line.
            </h2>
            <p className="text-sm mb-10" style={{ color: "#94A3B8", lineHeight: "1.7" }}>
              Get priority access, a free 30-minute infrastructure review, and founding-member pricing locked forever.
            </p>
            <WaitlistForm />
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════
          FOOTER
      ════════════════════════════════════════════════════════ */}
      <footer
        className="py-10 px-6"
        style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}
      >
        <div className="max-w-[1100px] mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          {/* Logo */}
          <div className="flex items-center gap-2">
            <div
              className="flex items-center justify-center w-6 h-6 rounded-md"
              style={{ background: "rgba(0,229,255,0.1)", border: "1px solid rgba(0,229,255,0.2)" }}
            >
              <span style={{ color: "#00E5FF", fontSize: "10px", fontWeight: 700 }}>IR</span>
            </div>
            <span className="text-sm font-semibold text-white">InfraReady</span>
          </div>

          {/* Links */}
          <div className="flex items-center gap-6">
            <a
              href="mailto:hello@infraready.io"
              className="text-xs transition-colors duration-150 hover:text-white"
              style={{ color: "#475569" }}
            >
              hello@infraready.io
            </a>
            <span className="text-xs" style={{ color: "#475569" }}>
              &copy; 2026 InfraReady
            </span>
            <span className="text-xs" style={{ color: "#475569" }}>
              Built by a solo founder
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}

// ─── Sub-components (server-renderable) ───────────────────────────────────────

function FeatureCard({
  Icon,
  title,
  desc,
}: {
  Icon: React.ComponentType<{ size?: number; className?: string }>;
  title: string;
  desc: string;
}) {
  return (
    <>
      {/* Icon */}
      <div
        className="flex items-center justify-center w-10 h-10 rounded-xl mb-5 transition-all duration-300"
        style={{
          background: "rgba(0, 229, 255, 0.08)",
          border: "1px solid rgba(0, 229, 255, 0.15)",
        }}
      >
        <Icon size={18} className="text-[#00E5FF]" />
      </div>

      <h3 className="text-white font-bold text-[15px] mb-2.5" style={{ letterSpacing: "-0.02em" }}>
        {title}
      </h3>
      <p className="text-sm leading-relaxed" style={{ color: "#94A3B8" }}>
        {desc}
      </p>
    </>
  );
}

function HeroTerminal({ wide = false }: { wide?: boolean }) {
  return (
    <div
      className={`rounded-2xl overflow-hidden font-mono text-xs ${wide ? "w-full max-w-2xl" : "w-[440px]"}`}
      style={{
        background: "rgba(0,0,0,0.85)",
        border: "1px solid rgba(0, 229, 255, 0.14)",
        boxShadow: "0 0 60px rgba(0,229,255,0.08), 0 40px 80px rgba(0,0,0,0.5)",
      }}
    >
      {/* Title bar */}
      <div
        className="flex items-center gap-1.5 px-4 py-3"
        style={{
          borderBottom: "1px solid rgba(0, 229, 255, 0.08)",
          background: "rgba(0, 229, 255, 0.02)",
        }}
      >
        <div className="w-2.5 h-2.5 rounded-full" style={{ background: "rgba(255,95,87,0.7)" }} />
        <div className="w-2.5 h-2.5 rounded-full" style={{ background: "rgba(254,188,46,0.7)" }} />
        <div className="w-2.5 h-2.5 rounded-full" style={{ background: "rgba(40,200,64,0.7)" }} />
        <span className="ml-3 text-[11px]" style={{ color: "#475569" }}>deploy.log</span>
        <span
          className="ml-auto text-[10px] font-semibold px-2 py-0.5 rounded-full"
          style={{
            background: "rgba(16,185,129,0.1)",
            border: "1px solid rgba(16,185,129,0.2)",
            color: "#10B981",
          }}
        >
          LIVE
        </span>
      </div>

      {/* Log lines */}
      <div className="p-5 space-y-1.5">
        <p>
          <span style={{ color: "#475569" }}>$</span>{" "}
          <span style={{ color: "#94A3B8" }}>tofu apply --auto-approve</span>
        </p>
        <p style={{ color: "#94A3B8" }}>
          <span style={{ color: "#475569" }}>Plan:</span> 14 to add, 0 to change, 0 to destroy.
        </p>
        <p style={{ color: "#94A3B8" }}>aws_vpc.this: Creating...</p>
        <p style={{ color: "#94A3B8" }}>
          aws_vpc.this: Creation complete after 2s{" "}
          <span style={{ color: "#00E5FF" }}>[id=vpc-0a3f9e12d4b87c651]</span>
        </p>
        <p style={{ color: "#94A3B8" }}>aws_subnet.public[0]: Creating...</p>
        <p style={{ color: "#94A3B8" }}>
          aws_subnet.public[0]: Creation complete after 1s{" "}
          <span style={{ color: "#00E5FF" }}>[id=subnet-04d1a2b3c5]</span>
        </p>
        <p style={{ color: "#94A3B8" }}>aws_rds_cluster.this: Creating...</p>
        <p style={{ color: "#94A3B8" }}>
          aws_rds_cluster.this: Creation complete after 8m32s{" "}
          <span style={{ color: "#00E5FF" }}>[id=infraready-prod]</span>
        </p>
        <p style={{ color: "#94A3B8" }}>aws_ecs_cluster.this: Creating...</p>
        <p style={{ color: "#94A3B8" }}>
          aws_ecs_cluster.this: Creation complete after 4s{" "}
          <span style={{ color: "#00E5FF" }}>[id=arn:aws:ecs:us-east-1:...]</span>
        </p>
        <div className="pt-2" style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
          <p className="font-bold" style={{ color: "#10B981" }}>
            Apply complete! Resources: 14 added, 0 changed, 0 destroyed.
          </p>
          <p style={{ color: "#10B981" }}>
            Infrastructure ready in 18m 42s{" "}
            <span style={{ color: "#00E5FF" }}>&#10003;</span>
          </p>
        </div>
      </div>
    </div>
  );
}
