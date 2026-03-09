"use client";

import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Shield, Zap, GitBranch, DollarSign, Lock, RefreshCw } from "lucide-react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

// ─── Feature definitions ─────────────────────────────────────────────────────

interface Feature {
  icon: React.ElementType;
  title: string;
  description: string;
  color: string;
  glow: string;
  iconBg: string;
  span: string;  // tailwind col/row span classes
  accent?: string;
}

const features: Feature[] = [
  {
    icon: Zap,
    title: "Deploy in 20 minutes",
    description:
      "Connect your GitHub repo and AWS account. InfraReady provisions your entire production stack — VPC, ECS, RDS, S3, security baseline — automatically.",
    color: "text-sky-400",
    glow: "rgba(14,165,233,0.20)",
    iconBg: "bg-sky-400/10 border-sky-400/20",
    span: "col-span-1 md:col-span-2 row-span-1",
    accent: "from-sky-500/20 to-transparent",
  },
  {
    icon: Lock,
    title: "Your AWS account",
    description:
      "Infrastructure deploys into your own AWS account. No shared tenancy, no vendor lock-in. You own every resource.",
    color: "text-violet-400",
    glow: "rgba(167,139,250,0.18)",
    iconBg: "bg-violet-400/10 border-violet-400/20",
    span: "col-span-1 row-span-2",
  },
  {
    icon: Shield,
    title: "SOC2-ready baseline",
    description:
      "GuardDuty, CloudTrail, Config, and Security Hub enabled from day one. Audit-ready before your first customer.",
    color: "text-emerald-400",
    glow: "rgba(52,211,153,0.16)",
    iconBg: "bg-emerald-400/10 border-emerald-400/20",
    span: "col-span-1 row-span-1",
  },
  {
    icon: DollarSign,
    title: "Use AWS Activate credits",
    description:
      "You pay AWS directly. Apply your $10k–$100k AWS Activate credits immediately — we don't touch the billing.",
    color: "text-amber-400",
    glow: "rgba(251,191,36,0.15)",
    iconBg: "bg-amber-400/10 border-amber-400/20",
    span: "col-span-1 row-span-1",
  },
  {
    icon: GitBranch,
    title: "OpenTofu-native",
    description:
      "Built on open-source OpenTofu — no BSL license risk. Readable IaC you can export, modify, and own forever.",
    color: "text-cyan-400",
    glow: "rgba(34,211,238,0.16)",
    iconBg: "bg-cyan-400/10 border-cyan-400/20",
    span: "col-span-1 row-span-1",
  },
  {
    icon: RefreshCw,
    title: "Real-time deploy logs",
    description:
      "Watch every OpenTofu plan and apply step stream live. Full visibility into what's being created in your account.",
    color: "text-pink-400",
    glow: "rgba(244,114,182,0.16)",
    iconBg: "bg-pink-400/10 border-pink-400/20",
    span: "col-span-1 md:col-span-2 row-span-1",
    accent: "from-pink-500/10 to-transparent",
  },
];

// ─── Component ────────────────────────────────────────────────────────────────

export function FeaturesGrid() {
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!sectionRef.current) return;
    const cards = sectionRef.current.querySelectorAll<HTMLElement>(".bento-card");

    gsap.fromTo(
      cards,
      { opacity: 0, y: 36 },
      {
        opacity: 1,
        y: 0,
        duration: 0.55,
        stagger: 0.08,
        ease: "power2.out",
        scrollTrigger: {
          trigger: sectionRef.current,
          start: "top 78%",
          once: true,
        },
      }
    );

    return () => {
      ScrollTrigger.getAll().forEach((t) => t.kill());
    };
  }, []);

  return (
    <section id="features" ref={sectionRef} className="py-28 px-6 relative">
      {/* Subtle section glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 70% 50% at 50% 60%, rgba(99,102,241,0.05) 0%, transparent 70%)",
        }}
        aria-hidden
      />

      <div className="max-w-6xl mx-auto relative">
        {/* Section header */}
        <div className="text-center mb-14">
          <motion.span
            whileInView={{ opacity: 1, y: 0 }}
            initial={{ opacity: 0, y: 12 }}
            transition={{ duration: 0.4 }}
            viewport={{ once: true }}
            className="text-xs font-semibold uppercase tracking-widest text-sky-400 mb-3 block"
          >
            Why InfraReady
          </motion.span>
          <motion.h2
            whileInView={{ opacity: 1, y: 0 }}
            initial={{ opacity: 0, y: 16 }}
            transition={{ duration: 0.5, delay: 0.08 }}
            viewport={{ once: true }}
            className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-[#F0F9FF]"
          >
            Everything you need.{" "}
            <span
              className="bg-clip-text text-transparent"
              style={{ backgroundImage: "linear-gradient(135deg, #38BDF8 0%, #A78BFA 100%)" }}
            >
              Nothing you don&apos;t.
            </span>
          </motion.h2>
        </div>

        {/* Bento grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 grid-rows-auto gap-4 auto-rows-fr">
          {features.map((f) => {
            const Icon = f.icon;
            return (
              <BentoCard key={f.title} feature={f} Icon={Icon} />
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ─── Bento card ───────────────────────────────────────────────────────────────

function BentoCard({
  feature,
  Icon,
}: {
  feature: Feature;
  Icon: React.ElementType;
}) {
  const cardRef = useRef<HTMLDivElement>(null);

  function handleMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    const el = cardRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    el.style.setProperty("--mouse-x", `${x}%`);
    el.style.setProperty("--mouse-y", `${y}%`);
  }

  return (
    <div
      ref={cardRef}
      onMouseMove={handleMouseMove}
      className={`bento-card group relative rounded-2xl border border-white/[0.07] bg-white/[0.025] backdrop-blur-sm overflow-hidden
        hover:border-white/[0.13] hover:bg-white/[0.04] transition-all duration-300 cursor-default
        ${feature.span} p-6 flex flex-col`}
      style={
        {
          "--glow": feature.glow,
        } as React.CSSProperties
      }
    >
      {/* Spotlight gradient that follows cursor */}
      <div
        className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
        style={{
          background:
            "radial-gradient(300px circle at var(--mouse-x, 50%) var(--mouse-y, 50%), var(--glow), transparent 70%)",
        }}
        aria-hidden
      />

      {/* Wide card top accent gradient */}
      {feature.accent && (
        <div
          className={`absolute inset-x-0 top-0 h-px bg-gradient-to-r ${feature.accent}`}
          aria-hidden
        />
      )}

      {/* Icon */}
      <div
        className={`relative w-10 h-10 rounded-xl border ${feature.iconBg} flex items-center justify-center mb-5 shrink-0`}
      >
        <div
          className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"
          style={{ boxShadow: `0 0 20px ${feature.glow}` }}
          aria-hidden
        />
        <Icon className={`w-4.5 h-4.5 ${feature.color}`} size={18} />
      </div>

      {/* Copy */}
      <h3 className="text-sm font-semibold text-[#F0F9FF] mb-2 leading-snug">{feature.title}</h3>
      <p className="text-sm text-slate-500 leading-relaxed flex-1">{feature.description}</p>
    </div>
  );
}
