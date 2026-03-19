import Link from "next/link";
import { Check, X, ArrowRight } from "lucide-react";

export const metadata = {
  title: "Pricing — InfraReady",
};

const tiers = [
  {
    name: "Free",
    price: "$0",
    period: "/mo",
    tagline: "Get started, no credit card",
    cta: "Start Free",
    ctaHref: "/login",
    featured: false,
    features: [
      "1 project",
      "1 environment",
      "Community support",
      "OpenTofu modules included",
      "Real-time deploy logs",
    ],
    missing: [
      "Multiple environments",
      "Compliance modules",
      "Priority support",
      "Preview environments",
      "SSO / SAML",
    ],
  },
  {
    name: "Starter",
    price: "$49",
    period: "/mo",
    tagline: "For solo founders shipping fast",
    cta: "Start Starter",
    ctaHref: "/login",
    featured: false,
    features: [
      "3 projects",
      "1 environment per project",
      "Email support",
      "OpenTofu modules included",
      "Real-time deploy logs",
      "AWS cost estimator",
    ],
    missing: [
      "Preview environments",
      "Compliance modules",
      "SSO / SAML",
    ],
  },
  {
    name: "Pro",
    price: "$149",
    period: "/mo",
    tagline: "For teams of 2–10 moving to production",
    cta: "Start Pro",
    ctaHref: "/login",
    featured: true,
    features: [
      "10+ projects",
      "Multi-environment (dev / staging / prod)",
      "Preview environments",
      "SOC 2-ready compliance modules",
      "Priority support",
      "AWS cost estimator",
      "OpenTofu modules included",
      "Real-time deploy logs",
    ],
    missing: [
      "SSO / SAML",
      "Dedicated support",
    ],
  },
  {
    name: "Enterprise",
    price: "Custom",
    period: "",
    tagline: "For teams with compliance and audit requirements",
    cta: "Talk to us",
    ctaHref: "mailto:kay@infraready.io",
    featured: false,
    features: [
      "Unlimited projects",
      "SSO / SAML",
      "Audit logs",
      "HIPAA modules",
      "SLA guarantee",
      "Dedicated support",
      "Custom module development",
      "VPC peering support",
    ],
    missing: [],
  },
];

export default function PricingPage() {
  return (
    <div
      className="min-h-screen text-white flex flex-col items-center px-6 py-24"
      style={{ background: "#0a0a0a" }}
    >
      {/* Header */}
      <div className="text-center mb-16 max-w-2xl">
        <p
          className="text-[11px] font-semibold uppercase tracking-widest mb-4"
          style={{ color: "#00E5FF" }}
        >
          Pricing
        </p>
        <h1
          className="font-bold text-white mb-4"
          style={{ fontSize: "clamp(28px, 4vw, 48px)", letterSpacing: "-0.03em", lineHeight: 1.1 }}
        >
          Simple pricing.{" "}
          <span
            style={{
              background: "linear-gradient(135deg, #00E5FF 0%, #0EA5E9 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          >
            You own the infra.
          </span>
        </h1>
        <p className="text-base leading-relaxed" style={{ color: "#94A3B8" }}>
          No platform fees on top of your AWS bill. You pay InfraReady to deploy and manage — your cloud costs go directly to AWS.
        </p>
      </div>

      {/* Tier cards */}
      <div className="w-full max-w-[1100px] grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-16">
        {tiers.map((tier) => (
          <div
            key={tier.name}
            className="relative flex flex-col rounded-2xl overflow-hidden"
            style={
              tier.featured
                ? {
                    background: "rgba(0,229,255,0.04)",
                    border: "1px solid rgba(0,229,255,0.25)",
                    boxShadow: "0 0 40px rgba(0,229,255,0.08)",
                  }
                : {
                    background: "rgba(255,255,255,0.025)",
                    border: "1px solid rgba(255,255,255,0.07)",
                  }
            }
          >
            {tier.featured && (
              <div
                className="text-center py-1.5 text-[10px] font-bold uppercase tracking-widest"
                style={{ background: "#00E5FF", color: "#0a0a0a" }}
              >
                Most popular
              </div>
            )}

            <div className="p-6 flex flex-col flex-1">
              {/* Name + price */}
              <p
                className="text-xs font-bold uppercase tracking-widest mb-3"
                style={{ color: tier.featured ? "#00E5FF" : "#64748B" }}
              >
                {tier.name}
              </p>
              <div className="flex items-end gap-1 mb-2">
                <span
                  className="font-black"
                  style={{ fontSize: "clamp(28px, 3vw, 36px)", letterSpacing: "-0.04em", color: "#F1F5F9" }}
                >
                  {tier.price}
                </span>
                {tier.period && (
                  <span className="text-sm mb-1" style={{ color: "#64748B" }}>
                    {tier.period}
                  </span>
                )}
              </div>
              <p className="text-xs leading-relaxed mb-6" style={{ color: "#64748B" }}>
                {tier.tagline}
              </p>

              {/* CTA */}
              <Link
                href={tier.ctaHref}
                className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-sm font-bold transition-all duration-200 mb-8"
                style={
                  tier.featured
                    ? { background: "#00E5FF", color: "#0a0a0a", boxShadow: "0 0 20px rgba(0,229,255,0.35)" }
                    : {
                        background: "rgba(255,255,255,0.06)",
                        color: "#CBD5E1",
                        border: "1px solid rgba(255,255,255,0.08)",
                      }
                }
              >
                {tier.cta}
                <ArrowRight size={14} />
              </Link>

              {/* Features included */}
              <ul className="space-y-2.5 flex-1">
                {tier.features.map((f) => (
                  <li key={f} className="flex items-start gap-2.5">
                    <span
                      className="flex items-center justify-center w-4 h-4 rounded-full shrink-0 mt-0.5"
                      style={{ background: "rgba(16,185,129,0.12)", border: "1px solid rgba(16,185,129,0.2)" }}
                    >
                      <Check size={9} className="text-emerald-400" />
                    </span>
                    <span className="text-xs leading-relaxed" style={{ color: "#94A3B8" }}>
                      {f}
                    </span>
                  </li>
                ))}
                {tier.missing.map((f) => (
                  <li key={f} className="flex items-start gap-2.5">
                    <span
                      className="flex items-center justify-center w-4 h-4 rounded-full shrink-0 mt-0.5"
                      style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}
                    >
                      <X size={9} style={{ color: "#334155" }} />
                    </span>
                    <span className="text-xs leading-relaxed" style={{ color: "#334155" }}>
                      {f}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ))}
      </div>

      {/* Footer note */}
      <p className="text-xs text-center mb-8" style={{ color: "#475569" }}>
        All plans deploy infrastructure directly into your own AWS account. You pay AWS for compute, storage, and data transfer — not us.
      </p>

      <Link href="/" className="text-sm transition-colors" style={{ color: "#475569" }}>
        ← Back to home
      </Link>
    </div>
  );
}
