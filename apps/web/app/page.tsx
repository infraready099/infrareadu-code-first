import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";
import { Nav } from "@/components/landing/Nav";
import { WaitlistForm } from "@/components/landing/WaitlistForm";

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

// ─── Page ────────────────────────────────────────────────────────────────────
export default async function LandingPage() {
  const user = await getUser();
  const isAuthenticated = !!user;

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white overflow-x-hidden">
      <Nav isAuthenticated={isAuthenticated} />

      {/* ── Hero ── */}
      <section className="pt-40 pb-24 px-6">
        <div className="max-w-[1100px] mx-auto">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-[#71717a] mb-6">
            Infrastructure for builders
          </p>
          <h1
            className="font-extrabold text-white leading-[1.02] mb-6"
            style={{ fontSize: "clamp(40px, 6vw, 72px)", letterSpacing: "-0.04em" }}
          >
            Deploy production AWS<br className="hidden sm:block" /> infrastructure in minutes.
          </h1>
          <p className="text-[18px] text-[#a1a1aa] max-w-[560px] leading-relaxed mb-8">
            Connect your AWS account. Pick your stack. We handle the rest. You own every line of Terraform. Always.
          </p>

          <div className="flex flex-col sm:flex-row items-start gap-3 mb-6">
            <a
              href="#waitlist"
              className="px-6 py-3 rounded-md font-semibold text-white text-sm bg-[#f97316] hover:bg-orange-400 transition-colors duration-200"
            >
              Join the waitlist
            </a>
            <a
              href="#how-it-works"
              className="px-6 py-3 rounded-md font-semibold text-sm text-white border border-[#27272a] hover:bg-white/5 transition-colors duration-200"
            >
              See how it works
            </a>
          </div>

          <p className="text-[12px] text-[#52525b]">
            No credit card. No vendor lock-in. Your AWS, your code.
          </p>
        </div>
      </section>

      {/* ── Social Proof Bar ── */}
      <section className="border-y border-[#27272a] bg-[#111111]">
        <div className="max-w-[1100px] mx-auto px-6 h-12 flex items-center gap-4 overflow-hidden">
          <span className="text-[#52525b] text-xs whitespace-nowrap shrink-0">
            Works with the tools you already build with:
          </span>
          <div className="flex items-center gap-2 overflow-x-auto scrollbar-none">
            {["AWS", "GitHub", "OpenTofu", "Claude", "Cursor", "Vercel", "Supabase"].map((tool) => (
              <span
                key={tool}
                className="px-2.5 py-1 rounded text-xs text-[#a1a1aa] bg-[#0a0a0a] border border-[#27272a] whitespace-nowrap"
              >
                {tool}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── Problem / Solution ── */}
      <section className="py-24 px-6">
        <div className="max-w-[1100px] mx-auto">
          <h2
            className="font-bold text-white mb-12"
            style={{ fontSize: "clamp(28px, 3.5vw, 44px)", letterSpacing: "-0.03em" }}
          >
            You ship fast. Deployment stops you cold.
          </h2>

          <div className="grid md:grid-cols-2 gap-6">
            {/* Old way */}
            <div className="p-6 rounded-lg border border-[#27272a] bg-[#111111]">
              <p className="text-[#71717a] text-xs font-semibold uppercase tracking-widest mb-5">
                The old way
              </p>
              <ul className="space-y-3 font-mono text-sm">
                {[
                  "Read 400 pages of AWS docs",
                  "Spend 3 weeks configuring VPCs",
                  "Hire a DevOps engineer ($180K/yr)",
                  "Watch $40K in AWS credits expire",
                  "Pay Heroku $400/mo in desperation",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2.5">
                    <span className="text-red-400 shrink-0 mt-0.5">✗</span>
                    <span className="text-[#a1a1aa]">{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* New way */}
            <div className="p-6 rounded-lg border border-[#f97316]/30 bg-[#111111]">
              <p className="text-[#f97316] text-xs font-semibold uppercase tracking-widest mb-5">
                With InfraReady
              </p>
              <ul className="space-y-3 font-mono text-sm">
                {[
                  "Connect your AWS account (2 min)",
                  "Pick your modules",
                  "Click deploy",
                  "Use your AWS credits",
                  "Own your Terraform forever",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2.5">
                    <span className="text-[#f97316] shrink-0 mt-0.5">✓</span>
                    <span className="text-[#a1a1aa]">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ── How It Works ── */}
      <section id="how-it-works" className="py-24 px-6 border-t border-[#27272a]">
        <div className="max-w-[1100px] mx-auto">
          <h2
            className="font-bold text-white mb-16"
            style={{ fontSize: "clamp(28px, 3.5vw, 44px)", letterSpacing: "-0.03em" }}
          >
            How it works
          </h2>

          <div className="grid md:grid-cols-3 gap-10 mb-16">
            {[
              {
                num: "1",
                title: "Connect",
                desc: "Link your AWS account with one CloudFormation click. We get a scoped IAM role. You can revoke it any time.",
              },
              {
                num: "2",
                title: "Configure",
                desc: "Pick your modules. Set your options. We generate clean OpenTofu — no proprietary syntax.",
              },
              {
                num: "3",
                title: "Deploy",
                desc: "Watch your infrastructure deploy in real time. Every resource tracked. Every failure auto-retried and self-healed.",
              },
            ].map((step) => (
              <div key={step.num}>
                <div
                  className="font-thin text-[#f97316] leading-none mb-4 select-none"
                  style={{ fontSize: "64px", fontWeight: 200 }}
                  aria-hidden
                >
                  {step.num}
                </div>
                <h3 className="text-white font-semibold text-lg mb-2">{step.title}</h3>
                <p className="text-[#a1a1aa] text-sm leading-relaxed">{step.desc}</p>
              </div>
            ))}
          </div>

          {/* Terminal mockup */}
          <div className="rounded-lg border border-[#27272a] bg-black overflow-hidden font-mono text-xs max-w-2xl">
            <div className="flex items-center gap-1.5 px-4 py-3 border-b border-[#27272a] bg-[#111111]">
              <div className="w-2.5 h-2.5 rounded-full bg-[#ff5f57]" />
              <div className="w-2.5 h-2.5 rounded-full bg-[#febc2e]" />
              <div className="w-2.5 h-2.5 rounded-full bg-[#28c840]" />
              <span className="ml-3 text-[#52525b]">deploy.log</span>
            </div>
            <div className="p-5 space-y-1.5">
              <p>
                <span className="text-[#52525b]">$</span>{" "}
                <span className="text-[#a1a1aa]">tofu apply --auto-approve</span>
              </p>
              <p className="text-[#a1a1aa]">
                <span className="text-[#52525b]">Plan:</span> 14 to add, 0 to change, 0 to destroy.
              </p>
              <p className="text-[#a1a1aa]">
                aws_vpc.this: Creating...
              </p>
              <p className="text-[#a1a1aa]">
                aws_vpc.this: Creation complete after 2s{" "}
                <span className="text-[#28c840]">[id=vpc-0a3f9e12d4b87c651]</span>
              </p>
              <p className="text-[#a1a1aa]">
                aws_subnet.public[0]: Creating...
              </p>
              <p className="text-[#a1a1aa]">
                aws_subnet.public[0]: Creation complete after 1s{" "}
                <span className="text-[#28c840]">[id=subnet-04d1a2b3c5e6f7890]</span>
              </p>
              <p className="text-[#a1a1aa]">
                aws_subnet.public[1]: Creating...
              </p>
              <p className="text-[#a1a1aa]">
                aws_subnet.public[1]: Creation complete after 1s{" "}
                <span className="text-[#28c840]">[id=subnet-0b2c3d4e5f6a7b890]</span>
              </p>
              <p className="text-[#a1a1aa]">
                aws_db_subnet_group.this: Creating...
              </p>
              <p className="text-[#a1a1aa]">
                aws_db_subnet_group.this: Creation complete after 1s
              </p>
              <p className="text-[#a1a1aa]">
                aws_rds_cluster.this: Creating...
              </p>
              <p className="text-[#a1a1aa]">
                aws_rds_cluster.this: Creation complete after 8m32s{" "}
                <span className="text-[#28c840]">[id=infraready-prod]</span>
              </p>
              <p className="text-[#a1a1aa]">
                aws_ecs_cluster.this: Creating...
              </p>
              <p className="text-[#a1a1aa]">
                aws_ecs_cluster.this: Creation complete after 4s{" "}
                <span className="text-[#28c840]">[id=arn:aws:ecs:us-east-1:...]</span>
              </p>
              <p className="text-[#a1a1aa]">
                aws_ecs_service.app: Creating...
              </p>
              <p className="text-[#a1a1aa]">
                aws_ecs_service.app: Creation complete after 1m14s
              </p>
              <p className="mt-2 font-semibold text-[#28c840]">
                Apply complete! Resources: 14 added, 0 changed, 0 destroyed.
              </p>
              <p className="text-[#28c840]">
                Infrastructure ready in 18m 42s ✓
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Waitlist ── */}
      <section id="waitlist" className="py-24 px-6 border-t border-[#27272a]">
        <div className="max-w-[1100px] mx-auto">
          <div className="max-w-md">
            <h2
              className="font-bold text-white mb-3"
              style={{ fontSize: "clamp(28px, 3.5vw, 44px)", letterSpacing: "-0.03em" }}
            >
              Get early access
            </h2>
            <p className="text-[#a1a1aa] text-sm leading-relaxed mb-8">
              We&apos;re talking to 10 founders this month. Join the waitlist for a free 30-minute infrastructure review.
            </p>
            <WaitlistForm />
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-[#27272a] py-8 px-6">
        <div className="max-w-[1100px] mx-auto">
          <p className="text-[#52525b] text-xs">
            &copy; 2025 InfraReady &middot;{" "}
            <a href="mailto:hello@infraready.io" className="hover:text-[#a1a1aa] transition-colors">
              hello@infraready.io
            </a>{" "}
            &middot; Built by a solo founder
          </p>
        </div>
      </footer>
    </div>
  );
}
