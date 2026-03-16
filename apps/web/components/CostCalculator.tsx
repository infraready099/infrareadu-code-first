"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { ArrowRight, TrendingDown } from "lucide-react";

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

interface SaasItem {
  id: string;
  label: string;
  saasCost: number;
  awsCost: number;
  saasProvider: string;
  awsProvider: string;
}

const SAAS_ITEMS: SaasItem[] = [
  {
    id: "n8n",
    label: "n8n",
    saasCost: 50,
    awsCost: 24,
    saasProvider: "n8n Cloud",
    awsProvider: "ECS + RDS",
  },
  {
    id: "vercel",
    label: "Vercel Pro",
    saasCost: 20,
    awsCost: 5,
    saasProvider: "Vercel",
    awsProvider: "S3 + CloudFront",
  },
  {
    id: "render",
    label: "Render",
    saasCost: 25,
    awsCost: 15,
    saasProvider: "Render",
    awsProvider: "ECS Fargate",
  },
  {
    id: "ghost",
    label: "Ghost Pro",
    saasCost: 36,
    awsCost: 20,
    saasProvider: "Ghost",
    awsProvider: "ECS + RDS",
  },
  {
    id: "metabase",
    label: "Metabase Cloud",
    saasCost: 500,
    awsCost: 20,
    saasProvider: "Metabase",
    awsProvider: "ECS + RDS",
  },
  {
    id: "heroku",
    label: "Heroku",
    saasCost: 50,
    awsCost: 15,
    saasProvider: "Heroku",
    awsProvider: "ECS Fargate",
  },
];

// ---------------------------------------------------------------------------
// Animated number
// ---------------------------------------------------------------------------

function AnimatedNumber({ value, prefix = "$", suffix = "/mo" }: { value: number; prefix?: string; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const prevRef = useRef(0);

  useEffect(() => {
    const start = prevRef.current;
    const end = value;
    prevRef.current = value;
    if (start === end) return;

    const duration = 400;
    const startTime = performance.now();

    function step(now: number) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(start + (end - start) * eased);
      if (ref.current) {
        ref.current.textContent = `${prefix}${current.toLocaleString()}${suffix}`;
      }
      if (progress < 1) requestAnimationFrame(step);
    }

    requestAnimationFrame(step);
  }, [value, prefix, suffix]);

  return (
    <span ref={ref}>
      {prefix}{value.toLocaleString()}{suffix}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CostCalculator() {
  const [selected, setSelected] = useState<Set<string>>(
    new Set(["n8n", "vercel", "render", "ghost"])
  );

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const totalSaas = SAAS_ITEMS.filter((i) => selected.has(i.id)).reduce(
    (sum, i) => sum + i.saasCost,
    0
  );
  const totalAws = SAAS_ITEMS.filter((i) => selected.has(i.id)).reduce(
    (sum, i) => sum + i.awsCost,
    0
  );
  const savedMonthly = totalSaas - totalAws;
  const savedYearly = savedMonthly * 12;

  return (
    <div
      className="w-full max-w-3xl mx-auto rounded-2xl overflow-hidden"
      style={{
        background: "rgba(255,255,255,0.02)",
        border: "1px solid rgba(255,255,255,0.07)",
      }}
    >
      {/* Header */}
      <div
        className="px-8 py-6"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
      >
        <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: "#00E5FF" }}>
          Cost calculator
        </p>
        <h3 className="text-xl font-bold text-white tracking-tight">
          See how much you&apos;ll save
        </h3>
        <p className="text-sm mt-1" style={{ color: "#64748B" }}>
          Check the tools you currently pay for.
        </p>
      </div>

      {/* Table */}
      <div className="px-8 py-4">
        {/* Column labels */}
        <div className="grid grid-cols-[1fr_auto_auto] gap-x-6 mb-3">
          <span />
          <span className="text-xs font-semibold uppercase tracking-widest text-right w-24" style={{ color: "#475569" }}>SaaS</span>
          <span className="text-xs font-semibold uppercase tracking-widest text-right w-24" style={{ color: "#00E5FF" }}>Your AWS</span>
        </div>

        <div className="space-y-1">
          {SAAS_ITEMS.map((item) => {
            const isSelected = selected.has(item.id);
            return (
              <button
                key={item.id}
                onClick={() => toggle(item.id)}
                className="w-full grid grid-cols-[1fr_auto_auto] gap-x-6 items-center px-3 py-3 rounded-xl text-left transition-all duration-150"
                style={
                  isSelected
                    ? {
                        background: "rgba(0,229,255,0.04)",
                        border: "1px solid rgba(0,229,255,0.12)",
                      }
                    : {
                        background: "transparent",
                        border: "1px solid transparent",
                      }
                }
              >
                {/* Checkbox + label */}
                <div className="flex items-center gap-3">
                  <div
                    className="w-4 h-4 rounded flex items-center justify-center shrink-0 transition-all duration-150"
                    style={
                      isSelected
                        ? { background: "#00E5FF", border: "1px solid #00E5FF" }
                        : { background: "transparent", border: "1px solid rgba(255,255,255,0.15)" }
                    }
                  >
                    {isSelected && (
                      <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                        <path d="M1 4L3.5 6.5L9 1" stroke="#000" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </div>
                  <div>
                    <span className="text-sm font-medium" style={{ color: isSelected ? "#E2E8F0" : "#64748B" }}>
                      {item.label}
                    </span>
                    {isSelected && (
                      <span className="block text-xs" style={{ color: "#475569" }}>
                        {item.saasProvider} → {item.awsProvider}
                      </span>
                    )}
                  </div>
                </div>

                {/* SaaS cost */}
                <span
                  className="text-sm font-mono text-right w-24 tabular-nums"
                  style={{ color: isSelected ? "#94A3B8" : "#334155" }}
                >
                  ${item.saasCost}/mo
                </span>

                {/* AWS cost */}
                <span
                  className="text-sm font-mono font-semibold text-right w-24 tabular-nums transition-colors duration-150"
                  style={{ color: isSelected ? "#00E5FF" : "#334155" }}
                >
                  ~${item.awsCost}/mo
                </span>
              </button>
            );
          })}
        </div>

        {/* Totals */}
        <div
          className="grid grid-cols-[1fr_auto_auto] gap-x-6 items-center px-3 py-4 mt-3"
          style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}
        >
          <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: "#475569" }}>Total</span>
          <span className="text-sm font-bold font-mono text-right w-24 tabular-nums" style={{ color: "#94A3B8" }}>
            <AnimatedNumber value={totalSaas} />
          </span>
          <span className="text-sm font-bold font-mono text-right w-24 tabular-nums" style={{ color: "#00E5FF" }}>
            <AnimatedNumber value={totalAws} />
          </span>
        </div>
      </div>

      {/* Savings callout */}
      {savedMonthly > 0 && (
        <div
          className="mx-6 mb-6 rounded-xl p-5 flex flex-col sm:flex-row items-start sm:items-center gap-4"
          style={{
            background: "rgba(16,185,129,0.06)",
            border: "1px solid rgba(16,185,129,0.15)",
          }}
        >
          <div className="flex items-center gap-3 flex-1">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
              style={{
                background: "rgba(16,185,129,0.1)",
                border: "1px solid rgba(16,185,129,0.2)",
              }}
            >
              <TrendingDown className="w-5 h-5" style={{ color: "#10B981" }} />
            </div>
            <div>
              <p className="text-base font-bold" style={{ color: "#10B981" }}>
                Save <AnimatedNumber value={savedMonthly} /> (
                <AnimatedNumber value={savedYearly} prefix="$" suffix="/yr" />)
              </p>
              <p className="text-xs mt-0.5" style={{ color: "#475569" }}>
                With AWS Activate credits, your first year may be completely free.
              </p>
            </div>
          </div>
          <Link
            href="/login"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-black transition-all duration-200 shrink-0"
            style={{
              background: "#00E5FF",
              boxShadow: "0 0 24px rgba(0,229,255,0.35)",
            }}
          >
            Start saving
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      )}

      {savedMonthly <= 0 && selected.size === 0 && (
        <div className="px-8 pb-6 text-center">
          <p className="text-sm" style={{ color: "#334155" }}>
            Check the tools above to see your savings.
          </p>
        </div>
      )}
    </div>
  );
}
