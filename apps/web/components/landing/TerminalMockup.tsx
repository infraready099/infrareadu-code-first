"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";

const LINES: { text: string; type: "cmd" | "info" | "success" | "done" | "live" }[] = [
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
  { text: "  Your app is live at https://your-app.infraready.io", type: "live" },
];

type LineType = (typeof LINES)[number]["type"];

const lineClass: Record<LineType, string> = {
  cmd: "text-slate-200",
  info: "text-slate-500",
  success: "text-sky-400",
  done: "text-emerald-400 font-semibold",
  live: "text-violet-400 font-semibold",
};

const linePrefix: Record<LineType, string> = {
  cmd: "",
  info: "",
  success: "",
  done: "",
  live: "",
};

function useTypingLines(lines: typeof LINES) {
  const [visibleCount, setVisibleCount] = useState(0);

  useEffect(() => {
    if (visibleCount >= lines.length) return;
    const prev = lines[visibleCount - 1];
    const delay = visibleCount === 0 ? 900 : prev?.type === "info" ? 950 : 420;
    const t = setTimeout(() => setVisibleCount((n) => n + 1), delay);
    return () => clearTimeout(t);
  }, [visibleCount, lines]);

  // Restart loop
  useEffect(() => {
    if (visibleCount < lines.length) return;
    const t = setTimeout(() => setVisibleCount(0), 5500);
    return () => clearTimeout(t);
  }, [visibleCount, lines.length]);

  return visibleCount;
}

export function TerminalMockup() {
  const visibleCount = useTypingLines(LINES);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [visibleCount]);

  return (
    <motion.div
      animate={{ y: [0, -8, 0] }}
      transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
      className="relative"
    >
      {/* Glow behind terminal */}
      <div
        className="absolute -inset-6 rounded-3xl pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 70% 60% at 50% 50%, rgba(14,165,233,0.10) 0%, rgba(99,102,241,0.06) 60%, transparent 80%)",
          filter: "blur(24px)",
        }}
        aria-hidden
      />

      <div className="relative rounded-2xl border border-white/[0.09] bg-[#070D1F]/90 overflow-hidden font-mono text-xs shadow-2xl shadow-sky-500/10 backdrop-blur-md">
        {/* Title bar */}
        <div className="flex items-center gap-1.5 px-4 py-3 border-b border-white/[0.07] bg-white/[0.025]">
          <div className="w-3 h-3 rounded-full bg-red-500/80" />
          <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
          <div className="w-3 h-3 rounded-full bg-green-500/80" />
          <span className="ml-3 text-slate-500 text-[11px]">deploy.log — infraready</span>
          <div className="ml-auto flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse inline-block" />
            <span className="text-emerald-400/80 text-[10px] font-semibold tracking-wide">LIVE</span>
          </div>
        </div>

        {/* Log area */}
        <div className="p-5 space-y-1.5 min-h-[280px] max-h-[280px] overflow-hidden">
          {LINES.slice(0, visibleCount).map((line, i) => {
            const isLast = i === visibleCount - 1;
            const isTyping = isLast && visibleCount < LINES.length;
            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.2 }}
                className={`flex items-start gap-2 leading-relaxed ${lineClass[line.type]}`}
              >
                {linePrefix[line.type]}
                <span className="break-all">{line.text}</span>
                {isTyping && (
                  <span className="inline-block w-[7px] h-[13px] bg-sky-400 opacity-90 animate-pulse ml-0.5 shrink-0 rounded-[1px]" />
                )}
              </motion.div>
            );
          })}
          <div ref={bottomRef} />
        </div>

        {/* Progress bar at bottom when running */}
        {visibleCount < LINES.length && visibleCount > 0 && (
          <div className="px-5 pb-4">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] text-slate-600 font-medium">Deploying</span>
              <span className="text-[10px] text-sky-400 font-semibold">
                {Math.round((visibleCount / LINES.length) * 100)}%
              </span>
            </div>
            <div className="h-0.5 w-full rounded-full bg-white/[0.05] overflow-hidden">
              <motion.div
                className="h-full rounded-full bg-gradient-to-r from-sky-500 to-violet-500"
                initial={{ width: "0%" }}
                animate={{ width: `${(visibleCount / LINES.length) * 100}%` }}
                transition={{ duration: 0.3, ease: "easeOut" }}
              />
            </div>
          </div>
        )}

        {/* Done state */}
        {visibleCount >= LINES.length && (
          <div className="px-5 pb-4 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse inline-block shrink-0" />
            <span className="text-[10px] text-emerald-400 font-semibold tracking-wide">
              INFRASTRUCTURE READY
            </span>
          </div>
        )}
      </div>
    </motion.div>
  );
}
