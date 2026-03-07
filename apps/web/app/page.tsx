import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";
import { Nav } from "@/components/landing/Nav";
import { TerminalMockup } from "@/components/landing/TerminalMockup";
import { PricingSection } from "@/components/landing/PricingSection";
import { HeroAnimations } from "@/components/landing/HeroAnimations";
import { FeaturesGrid } from "@/components/landing/FeaturesGrid";
import { HowItWorks } from "@/components/landing/HowItWorks";

// ─── Auth check (server) ────────────────────────────────────────────────────
async function getUser() {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    return user;
  } catch {
    return null;
  }
}

// ─── Page ───────────────────────────────────────────────────────────────────
export default async function LandingPage() {
  const user = await getUser();
  const isAuthenticated = !!user;

  return (
    <div className="min-h-screen bg-[#04091A] text-[#F0F9FF] overflow-x-hidden">
      {/* ── Nav ── */}
      <Nav isAuthenticated={isAuthenticated} />

      {/* ── Hero ── */}
      <section className="relative min-h-screen flex flex-col items-center justify-center px-6 pt-24 pb-20">
        {/* Dot grid background */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: "radial-gradient(rgba(148,163,184,0.07) 1px, transparent 1px)",
            backgroundSize: "32px 32px",
          }}
        />
        {/* Radial sky glow */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(ellipse 80% 50% at 50% 0%, rgba(14,165,233,0.10) 0%, transparent 70%)",
          }}
        />
        {/* Bottom fade */}
        <div
          className="absolute bottom-0 left-0 right-0 h-48 pointer-events-none"
          style={{
            background: "linear-gradient(to bottom, transparent, #04091A)",
          }}
        />

        <div className="relative z-10 max-w-6xl mx-auto w-full">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            {/* Left: Copy */}
            <div className="text-center lg:text-left">
              <HeroAnimations isAuthenticated={isAuthenticated} />
            </div>

            {/* Right: Terminal */}
            <div className="relative hidden lg:block">
              <div className="absolute -inset-8 rounded-3xl pointer-events-none" style={{
                background: "radial-gradient(ellipse 60% 60% at 50% 50%, rgba(14,165,233,0.07) 0%, transparent 70%)"
              }} />
              <TerminalMockup />
            </div>
          </div>

          {/* Mobile terminal below */}
          <div className="mt-12 lg:hidden">
            <TerminalMockup />
          </div>
        </div>
      </section>

      {/* ── Logo bar ── */}
      <LogoBar />

      {/* ── How It Works ── */}
      <HowItWorks />

      {/* ── Features ── */}
      <FeaturesGrid />

      {/* ── Pricing ── */}
      <PricingSection />

      {/* ── CTA Banner ── */}
      <CTABanner />

      {/* ── Footer ── */}
      <Footer />
    </div>
  );
}

// ─── Logo Bar ────────────────────────────────────────────────────────────────
function LogoBar() {
  const logos = [
    "Y Combinator",
    "AWS Activate",
    "GitHub",
    "Vercel",
    "Stripe",
    "Supabase",
    "Y Combinator",
    "AWS Activate",
    "GitHub",
    "Vercel",
    "Stripe",
    "Supabase",
  ];

  return (
    <section className="py-16 border-y border-white/[0.05] overflow-hidden relative">
      <div
        className="absolute inset-y-0 left-0 w-24 pointer-events-none z-10"
        style={{ background: "linear-gradient(to right, #04091A, transparent)" }}
      />
      <div
        className="absolute inset-y-0 right-0 w-24 pointer-events-none z-10"
        style={{ background: "linear-gradient(to left, #04091A, transparent)" }}
      />
      <p className="text-center text-xs font-semibold uppercase tracking-widest text-slate-600 mb-8">
        Trusted by founders from
      </p>
      <div className="flex overflow-hidden">
        <div className="flex gap-16 animate-marquee whitespace-nowrap">
          {logos.map((logo, i) => (
            <span
              key={i}
              className="text-slate-500 font-semibold text-sm tracking-wide hover:text-slate-300 transition-colors duration-300 cursor-default"
            >
              {logo}
            </span>
          ))}
        </div>
        <div className="flex gap-16 animate-marquee2 whitespace-nowrap ml-16" aria-hidden>
          {logos.map((logo, i) => (
            <span
              key={i}
              className="text-slate-500 font-semibold text-sm tracking-wide cursor-default"
            >
              {logo}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── CTA Banner ──────────────────────────────────────────────────────────────
function CTABanner() {
  return (
    <section className="relative py-28 px-6 overflow-hidden">
      {/* Glow behind */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 80% 60% at 50% 50%, rgba(14,165,233,0.08) 0%, transparent 70%)",
        }}
      />
      <div className="relative z-10 max-w-3xl mx-auto text-center">
        <span className="text-xs font-semibold uppercase tracking-widest text-sky-400 mb-4 block">
          Ready to ship?
        </span>
        <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight mb-6">
          <span className="text-[#F0F9FF]">Stop fighting</span>{" "}
          <span
            className="bg-clip-text text-transparent"
            style={{
              backgroundImage: "linear-gradient(135deg, #38BDF8 0%, #67E8F9 40%, #A78BFA 100%)",
            }}
          >
            DevOps
          </span>
        </h2>
        <p className="text-lg text-slate-400 mb-10 max-w-xl mx-auto leading-relaxed">
          Your AWS Activate credits are waiting. Deploy your first production environment in 20 minutes — no DevOps hire required.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            href="/login"
            className="w-full sm:w-auto px-8 py-4 rounded-xl font-semibold text-white text-base bg-sky-500 hover:bg-sky-400 transition-all duration-200 shadow-lg shadow-sky-500/30 hover:shadow-sky-400/40 hover:scale-[1.02] active:scale-[0.98] animate-glow-pulse"
          >
            Get Started Free →
          </Link>
          <Link
            href="mailto:kay@infraready.io"
            className="w-full sm:w-auto px-8 py-4 rounded-xl font-semibold text-slate-300 text-base border border-white/10 hover:border-white/20 hover:text-white transition-all duration-200"
          >
            Talk to a founder
          </Link>
        </div>
        <p className="text-sm text-slate-600 mt-6">
          No credit card required · Connects to your own AWS account · Cancel anytime
        </p>
      </div>
    </section>
  );
}

// ─── Footer ──────────────────────────────────────────────────────────────────
function Footer() {
  return (
    <footer className="border-t border-white/[0.05] py-12 px-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-8">
          {/* Brand */}
          <div>
            <div className="flex items-center gap-2.5 mb-3">
              <div className="w-6 h-6 rounded-md bg-gradient-to-br from-sky-400 to-violet-500 flex items-center justify-center">
                <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
                  <path d="M7 1L12 4V10L7 13L2 10V4L7 1Z" stroke="white" strokeWidth="1.5" strokeLinejoin="round" />
                </svg>
              </div>
              <span className="font-bold text-[#F0F9FF] text-sm">InfraReady</span>
            </div>
            <p className="text-xs text-slate-600 max-w-[200px] leading-relaxed">
              Made for vibe coders. Built with OpenTofu.
            </p>
          </div>

          {/* Links */}
          <nav className="flex flex-wrap gap-x-8 gap-y-3">
            {[
              { label: "Features", href: "#features" },
              { label: "Pricing", href: "#pricing" },
              { label: "Docs", href: "https://docs.infraready.io" },
              { label: "GitHub", href: "https://github.com/infraready099" },
              { label: "Twitter", href: "https://twitter.com/infraready" },
              { label: "Privacy", href: "/privacy" },
            ].map((link) => (
              <Link
                key={link.label}
                href={link.href}
                className="text-sm text-slate-500 hover:text-slate-300 transition-colors duration-200"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="mt-8 pt-8 border-t border-white/[0.04] flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-slate-700">
            © 2025 InfraReady, Inc. All rights reserved.
          </p>
          <p className="text-xs text-slate-700">
            Powered by{" "}
            <span className="text-sky-600 font-medium">OpenTofu</span>
            {" · "}
            <span className="text-sky-600 font-medium">AWS</span>
          </p>
        </div>
      </div>
    </footer>
  );
}
