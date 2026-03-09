"use client";

import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Github, Cloud, Rocket } from "lucide-react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

interface Step {
  num: string;
  icon: React.ElementType;
  title: string;
  description: string;
  color: string;
  glow: string;
  iconBg: string;
  border: string;
  connectorColor: string;
}

const steps: Step[] = [
  {
    num: "01",
    icon: Github,
    title: "Connect your repo",
    description:
      "Paste your GitHub repo URL. We detect your app type and set smart defaults for port, CPU, and memory automatically.",
    color: "text-sky-400",
    glow: "rgba(14,165,233,0.25)",
    iconBg: "bg-sky-500/10",
    border: "border-sky-500/25",
    connectorColor: "from-sky-500/40 to-violet-500/40",
  },
  {
    num: "02",
    icon: Cloud,
    title: "Link your AWS account",
    description:
      "Run a one-click CloudFormation stack that creates a least-privilege IAM role in your account. Takes 90 seconds.",
    color: "text-violet-400",
    glow: "rgba(167,139,250,0.22)",
    iconBg: "bg-violet-500/10",
    border: "border-violet-500/25",
    connectorColor: "from-violet-500/40 to-emerald-500/40",
  },
  {
    num: "03",
    icon: Rocket,
    title: "Deploy infrastructure",
    description:
      "Pick a tier, click deploy. InfraReady runs OpenTofu and streams real-time logs until your full stack is live.",
    color: "text-emerald-400",
    glow: "rgba(52,211,153,0.22)",
    iconBg: "bg-emerald-500/10",
    border: "border-emerald-500/25",
    connectorColor: "",
  },
];

export function HowItWorks() {
  const sectionRef = useRef<HTMLElement>(null);
  const lineRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!sectionRef.current) return;

    // Animate the connector line drawing in
    if (lineRef.current) {
      gsap.fromTo(
        lineRef.current,
        { scaleX: 0, transformOrigin: "left center" },
        {
          scaleX: 1,
          duration: 1.2,
          ease: "power2.out",
          scrollTrigger: {
            trigger: sectionRef.current,
            start: "top 72%",
            once: true,
          },
        }
      );
    }

    // Stagger animate cards
    const cards = sectionRef.current.querySelectorAll<HTMLElement>(".step-card");
    gsap.fromTo(
      cards,
      { opacity: 0, y: 40 },
      {
        opacity: 1,
        y: 0,
        duration: 0.6,
        stagger: 0.15,
        ease: "power2.out",
        scrollTrigger: {
          trigger: sectionRef.current,
          start: "top 75%",
          once: true,
        },
      }
    );

    return () => {
      ScrollTrigger.getAll().forEach((t) => t.kill());
    };
  }, []);

  return (
    <section id="how-it-works" ref={sectionRef} className="py-28 px-6 relative overflow-hidden">
      {/* Background glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 60% 50% at 50% 50%, rgba(14,165,233,0.05) 0%, transparent 70%)",
        }}
        aria-hidden
      />

      <div className="relative max-w-6xl mx-auto">
        {/* Section header */}
        <div className="text-center mb-20">
          <motion.span
            whileInView={{ opacity: 1, y: 0 }}
            initial={{ opacity: 0, y: 12 }}
            transition={{ duration: 0.4 }}
            viewport={{ once: true }}
            className="text-xs font-semibold uppercase tracking-widest text-sky-400 mb-3 block"
          >
            How it works
          </motion.span>
          <motion.h2
            whileInView={{ opacity: 1, y: 0 }}
            initial={{ opacity: 0, y: 16 }}
            transition={{ duration: 0.5, delay: 0.08 }}
            viewport={{ once: true }}
            className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-[#F0F9FF]"
          >
            Three steps to production
          </motion.h2>
        </div>

        {/* Steps */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 relative">
          {/* Gradient connector line (desktop only) */}
          <div
            className="hidden md:block absolute top-[52px] left-[calc(16.67%+20px)] right-[calc(16.67%+20px)] h-px z-0"
            aria-hidden
          >
            <div
              ref={lineRef}
              className="w-full h-full"
              style={{
                background:
                  "linear-gradient(to right, rgba(14,165,233,0.35), rgba(167,139,250,0.35), rgba(52,211,153,0.35))",
              }}
            />
          </div>

          {steps.map((step, idx) => {
            const Icon = step.icon;
            return (
              <div key={step.num} className="step-card relative flex flex-col items-center text-center">
                {/* Numbered circle */}
                <div className="relative mb-8 z-10">
                  {/* Outer glow ring */}
                  <div
                    className="absolute inset-0 rounded-full"
                    style={{ boxShadow: `0 0 32px ${step.glow}`, borderRadius: "50%" }}
                    aria-hidden
                  />
                  {/* Circle */}
                  <div
                    className={`w-[104px] h-[104px] rounded-full ${step.iconBg} border ${step.border} flex flex-col items-center justify-center gap-1 backdrop-blur-sm relative`}
                  >
                    {/* Number label */}
                    <span className={`text-[10px] font-bold tracking-[0.2em] ${step.color} opacity-60`}>
                      {step.num}
                    </span>
                    {/* Icon */}
                    <Icon className={`w-6 h-6 ${step.color}`} />
                  </div>

                  {/* Mobile connector — vertical line between steps */}
                  {idx < steps.length - 1 && (
                    <div
                      className="md:hidden absolute top-full left-1/2 -translate-x-1/2 w-px h-8 mt-1"
                      style={{
                        background: `linear-gradient(to bottom, ${step.glow}, transparent)`,
                      }}
                      aria-hidden
                    />
                  )}
                </div>

                {/* Glassmorphism card */}
                <div className="relative w-full rounded-2xl border border-white/[0.07] bg-white/[0.025] backdrop-blur-sm p-6 flex flex-col items-center text-center hover:border-white/[0.12] hover:bg-white/[0.04] transition-all duration-300 group">
                  {/* Top accent line */}
                  <div
                    className="absolute inset-x-0 top-0 h-px rounded-t-2xl"
                    style={{
                      background: `linear-gradient(to right, transparent, ${step.glow}, transparent)`,
                    }}
                    aria-hidden
                  />

                  <h3 className="text-base font-semibold text-[#F0F9FF] mb-3">{step.title}</h3>
                  <p className="text-sm text-slate-500 leading-relaxed">{step.description}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
