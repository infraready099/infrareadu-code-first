"use client";

import { useEffect, useState } from "react";

const LINES = [
  { text: "$ infraready deploy --repo github.com/you/your-app", type: "cmd" },
  { text: "  Connecting to AWS account 123456789012...", type: "info" },
  { text: "✓ AWS connection established", type: "success" },
  { text: "  Creating VPC (10.0.0.0/16)...", type: "info" },
  { text: "✓ VPC + subnets + NAT gateway ready", type: "success" },
  { text: "  Launching ECS Fargate cluster...", type: "info" },
  { text: "✓ ECS cluster + task definitions configured", type: "success" },
  { text: "  Provisioning RDS PostgreSQL 16...", type: "info" },
  { text: "✓ RDS Multi-AZ ready (encrypted at rest)", type: "success" },
  { text: "  Configuring Security Baseline...", type: "info" },
  { text: "✓ GuardDuty, CloudTrail, Config, SecurityHub enabled", type: "success" },
  { text: "✓ Infrastructure ready in 18m 42s", type: "done" },
  { text: "🚀 Your app is live at https://your-app.infraready.io", type: "live" },
];

export function TerminalMockup() {
  const [visibleLines, setVisibleLines] = useState(0);

  useEffect(() => {
    if (visibleLines >= LINES.length) return;
    const delay = visibleLines === 0 ? 800 : LINES[visibleLines - 1].type === "info" ? 900 : 400;
    const timer = setTimeout(() => {
      setVisibleLines((v) => v + 1);
    }, delay);
    return () => clearTimeout(timer);
  }, [visibleLines]);

  // Restart animation after completion
  useEffect(() => {
    if (visibleLines < LINES.length) return;
    const timer = setTimeout(() => {
      setVisibleLines(0);
    }, 6000);
    return () => clearTimeout(timer);
  }, [visibleLines]);

  return (
    <div className="rounded-xl border border-white/[0.08] bg-black/50 overflow-hidden font-mono text-xs shadow-2xl shadow-sky-500/10 backdrop-blur-sm">
      {/* Title bar */}
      <div className="flex items-center gap-1.5 px-4 py-3 border-b border-white/[0.07] bg-white/[0.02]">
        <div className="w-3 h-3 rounded-full bg-red-500/70" />
        <div className="w-3 h-3 rounded-full bg-yellow-500/70" />
        <div className="w-3 h-3 rounded-full bg-green-500/70" />
        <span className="ml-3 text-slate-500 text-[11px]">deploy.log — infraready</span>
        <div className="ml-auto flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-emerald-400/80 text-[10px] font-medium">LIVE</span>
        </div>
      </div>
      {/* Log lines */}
      <div className="p-5 space-y-1.5 min-h-[260px]">
        {LINES.slice(0, visibleLines).map((line, i) => (
          <div
            key={i}
            className={`flex items-start gap-2 transition-all duration-300 ${
              line.type === "cmd"
                ? "text-slate-300"
                : line.type === "info"
                ? "text-slate-500"
                : line.type === "success"
                ? "text-sky-400"
                : line.type === "done"
                ? "text-emerald-400 font-semibold text-sm"
                : "text-violet-400 font-semibold text-sm"
            }`}
          >
            <span>{line.text}</span>
            {i === visibleLines - 1 && visibleLines < LINES.length && (
              <span className="inline-block w-2 h-4 bg-sky-400 opacity-80 animate-pulse ml-0.5 align-text-bottom shrink-0" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
