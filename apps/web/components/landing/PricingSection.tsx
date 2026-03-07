"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Check } from "lucide-react";

const tiers = [
  {
    name: "Starter",
    monthly: 29,
    annual: 23,
    description: "Perfect for solo founders shipping their first product.",
    features: [
      "1 environment",
      "Core 5 modules (VPC, ECS, RDS, S3, Security)",
      "Real-time deployment logs",
      "SOC2-ready baseline",
      "Community support",
      "AWS Activate compatible",
    ],
    cta: "Start deploying",
    featured: false,
  },
  {
    name: "Pro",
    monthly: 99,
    annual: 79,
    description: "For teams scaling beyond their first product.",
    features: [
      "Unlimited environments",
      "All 11 modules (incl. WAF, KMS, Macie)",
      "Multi-region deployments",
      "Priority email support",
      "SOC2-ready + audit exports",
      "Custom domain mapping",
      "Team access controls",
    ],
    cta: "Start Pro trial",
    featured: true,
    badge: "Most Popular",
  },
  {
    name: "Enterprise",
    monthly: null,
    annual: null,
    description: "Custom compliance, dedicated support, and SLAs.",
    features: [
      "Everything in Pro",
      "Custom OpenTofu modules",
      "Landing Zone (AWS Organizations)",
      "Dedicated Slack channel",
      "SOC2 Type II audit reports",
      "HIPAA / FedRAMP guidance",
      "Custom SLA & MSA",
    ],
    cta: "Talk to us",
    featured: false,
  },
];

const item = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: "easeOut" } },
};

export function PricingSection() {
  const [annual, setAnnual] = useState(false);

  return (
    <section id="pricing" className="relative py-28 px-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-16">
          <span className="text-xs font-semibold uppercase tracking-widest text-sky-400 mb-4 block">
            Pricing
          </span>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-[#F0F9FF] mb-4">
            Simple, transparent pricing
          </h2>
          <p className="text-base sm:text-lg text-slate-400 max-w-xl mx-auto mb-8">
            No per-resource fees. No AWS markup. You pay us once — AWS charges go directly to your account.
          </p>

          {/* Billing toggle */}
          <div className="inline-flex items-center gap-3 bg-white/[0.04] border border-white/[0.08] rounded-full px-2 py-1.5">
            <button
              onClick={() => setAnnual(false)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all duration-200 ${
                !annual
                  ? "bg-sky-500 text-white shadow-lg shadow-sky-500/20"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => setAnnual(true)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all duration-200 flex items-center gap-2 ${
                annual
                  ? "bg-sky-500 text-white shadow-lg shadow-sky-500/20"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Annual
              <span className="text-xs bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded-full font-semibold">
                -20%
              </span>
            </button>
          </div>
        </div>

        {/* Cards */}
        <motion.div
          variants={{
            hidden: {},
            show: { transition: { staggerChildren: 0.1 } },
          }}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true }}
          className="grid grid-cols-1 md:grid-cols-3 gap-6"
        >
          {tiers.map((tier) => (
            <motion.div key={tier.name} variants={item}>
              {tier.featured ? (
                /* Gradient border wrapper for Pro */
                <div className="relative rounded-2xl p-px bg-gradient-to-b from-sky-500/60 to-violet-500/60 h-full shadow-xl shadow-sky-500/10">
                  <div className="rounded-2xl bg-[#04091A] p-8 h-full flex flex-col relative overflow-hidden">
                    {/* Glow inside */}
                    <div className="absolute inset-0 pointer-events-none" style={{
                      background: "radial-gradient(ellipse 80% 60% at 50% 0%, rgba(14,165,233,0.06) 0%, transparent 70%)"
                    }} />
                    {tier.badge && (
                      <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-sky-500/15 border border-sky-500/30 text-sky-400 text-xs font-semibold mb-6 self-start">
                        <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />
                        {tier.badge}
                      </div>
                    )}
                    <PricingCardContent tier={tier} annual={annual} />
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl bg-white/[0.03] border border-white/[0.07] p-8 h-full flex flex-col hover:border-white/[0.12] hover:bg-white/[0.05] transition-all duration-300">
                  <PricingCardContent tier={tier} annual={annual} />
                </div>
              )}
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

function PricingCardContent({
  tier,
  annual,
}: {
  tier: (typeof tiers)[0];
  annual: boolean;
}) {
  const price = annual ? tier.annual : tier.monthly;

  return (
    <>
      <div className="mb-6">
        <h3 className="text-xl font-bold text-[#F0F9FF] mb-2">{tier.name}</h3>
        <p className="text-slate-400 text-sm leading-relaxed">{tier.description}</p>
      </div>

      <div className="mb-8">
        {price !== null ? (
          <div className="flex items-end gap-1">
            <span className="text-4xl font-bold text-[#F0F9FF]">${price}</span>
            <span className="text-slate-400 mb-1.5">/mo</span>
            {annual && (
              <span className="text-xs text-emerald-400 mb-2 ml-1 font-medium">billed annually</span>
            )}
          </div>
        ) : (
          <div className="text-4xl font-bold text-[#F0F9FF]">Custom</div>
        )}
      </div>

      <ul className="space-y-3 mb-8 flex-1">
        {tier.features.map((f) => (
          <li key={f} className="flex items-start gap-2.5 text-sm text-slate-300">
            <Check className="w-4 h-4 text-sky-400 mt-0.5 shrink-0" />
            {f}
          </li>
        ))}
      </ul>

      <button
        className={`w-full py-3 rounded-xl font-semibold text-sm transition-all duration-200 ${
          tier.featured
            ? "bg-sky-500 hover:bg-sky-400 text-white shadow-lg shadow-sky-500/25 animate-glow-pulse"
            : "border border-white/10 hover:border-white/20 text-slate-300 hover:text-white hover:bg-white/[0.04]"
        }`}
      >
        {tier.cta}
      </button>
    </>
  );
}
