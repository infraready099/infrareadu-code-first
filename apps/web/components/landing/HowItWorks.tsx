"use client";

import { Github, Cloud, Rocket } from "lucide-react";

const steps = [
  {
    num: "01",
    icon: Github,
    title: "Connect your repo",
    description: "Paste your GitHub repo URL. We detect your app type and set smart defaults for port, CPU, and memory.",
    color: "text-sky-400",
    border: "border-sky-500/20",
    bg: "bg-sky-500/10",
  },
  {
    num: "02",
    icon: Cloud,
    title: "Link your AWS account",
    description: "Run a one-click CloudFormation stack. Creates a least-privilege IAM role — takes 90 seconds.",
    color: "text-violet-400",
    border: "border-violet-500/20",
    bg: "bg-violet-500/10",
  },
  {
    num: "03",
    icon: Rocket,
    title: "Deploy infrastructure",
    description: "Pick a tier, click deploy. InfraReady runs OpenTofu and streams real-time logs until your stack is live.",
    color: "text-emerald-400",
    border: "border-emerald-500/20",
    bg: "bg-emerald-500/10",
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="py-24 px-6 relative">
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: "radial-gradient(ellipse 60% 40% at 50% 50%, rgba(14,165,233,0.04) 0%, transparent 70%)",
        }}
      />
      <div className="relative max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <span className="text-xs font-semibold uppercase tracking-widest text-sky-400 mb-3 block">
            How it works
          </span>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-[#F0F9FF]">
            Three steps to production
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 relative">
          {/* Connector line on desktop */}
          <div className="hidden md:block absolute top-10 left-[calc(16.67%+16px)] right-[calc(16.67%+16px)] h-px bg-gradient-to-r from-sky-500/20 via-violet-500/20 to-emerald-500/20" />

          {steps.map((step) => {
            const Icon = step.icon;
            return (
              <div key={step.num} className="relative flex flex-col items-center text-center p-8">
                <div className={`relative w-16 h-16 rounded-2xl ${step.bg} border ${step.border} flex items-center justify-center mb-6 z-10`}>
                  <Icon className={`w-6 h-6 ${step.color}`} />
                  <span className="absolute -top-2 -right-2 text-[10px] font-bold text-slate-600 bg-[#04091A] px-1">
                    {step.num}
                  </span>
                </div>
                <h3 className="text-base font-semibold text-[#F0F9FF] mb-3">{step.title}</h3>
                <p className="text-sm text-slate-500 leading-relaxed">{step.description}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
