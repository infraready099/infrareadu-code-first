"use client";

import { Shield, Zap, GitBranch, DollarSign, Lock, RefreshCw } from "lucide-react";

const features = [
  {
    icon: Zap,
    title: "Deploy in 20 minutes",
    description: "Connect your GitHub repo and AWS account. InfraReady provisions your entire stack automatically.",
    color: "text-sky-400",
    bg: "bg-sky-400/10",
  },
  {
    icon: Lock,
    title: "Your AWS account",
    description: "Infrastructure deploys into your own AWS account. No vendor lock-in, no shared tenancy.",
    color: "text-violet-400",
    bg: "bg-violet-400/10",
  },
  {
    icon: Shield,
    title: "SOC2-ready baseline",
    description: "GuardDuty, CloudTrail, Config, and Security Hub enabled from day one.",
    color: "text-emerald-400",
    bg: "bg-emerald-400/10",
  },
  {
    icon: DollarSign,
    title: "Use AWS Activate credits",
    description: "You pay AWS directly for resources. Apply your $10k–$100k AWS Activate credits immediately.",
    color: "text-amber-400",
    bg: "bg-amber-400/10",
  },
  {
    icon: GitBranch,
    title: "OpenTofu-native",
    description: "Built on open-source OpenTofu — no BSL license risk, readable IaC you own and can export.",
    color: "text-cyan-400",
    bg: "bg-cyan-400/10",
  },
  {
    icon: RefreshCw,
    title: "Real-time deploy logs",
    description: "Watch every Tofu plan and apply step as it runs. Full visibility into what's being created.",
    color: "text-pink-400",
    bg: "bg-pink-400/10",
  },
];

export function FeaturesGrid() {
  return (
    <section id="features" className="py-24 px-6 relative">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <span className="text-xs font-semibold uppercase tracking-widest text-sky-400 mb-3 block">
            Why InfraReady
          </span>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-[#F0F9FF]">
            Everything you need.{" "}
            <span
              className="bg-clip-text text-transparent"
              style={{ backgroundImage: "linear-gradient(135deg, #38BDF8 0%, #A78BFA 100%)" }}
            >
              Nothing you don&apos;t.
            </span>
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {features.map((f) => {
            const Icon = f.icon;
            return (
              <div
                key={f.title}
                className="p-6 rounded-2xl border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/[0.1] transition-all duration-200 group"
              >
                <div className={`w-9 h-9 rounded-xl ${f.bg} flex items-center justify-center mb-4`}>
                  <Icon className={`w-4 h-4 ${f.color}`} />
                </div>
                <h3 className="text-sm font-semibold text-[#F0F9FF] mb-2">{f.title}</h3>
                <p className="text-sm text-slate-500 leading-relaxed">{f.description}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
