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
  X,
} from "lucide-react";
import { createServerClient } from "@/lib/supabase/server";
import { Nav } from "@/components/landing/Nav";
import { WaitlistForm } from "@/components/landing/WaitlistForm";
import { HeroBackground } from "@/components/landing/HeroBackground";
import { TiltCard } from "@/components/landing/TiltCard";

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
  "AWS",
  "GitHub",
  "OpenTofu",
  "Terraform",
  "Cursor",
  "Claude AI",
  "Supabase",
  "Vercel",
  "Docker",
  "Kubernetes",
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
                key={i}
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
