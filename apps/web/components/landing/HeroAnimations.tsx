"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { useEffect, useRef } from "react";
import gsap from "gsap";

interface HeroAnimationsProps {
  isAuthenticated: boolean;
}

export function HeroAnimations({ isAuthenticated }: HeroAnimationsProps) {
  const orbRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!orbRef.current) return;
    const tl = gsap.timeline({ repeat: -1, yoyo: true });
    tl.to(orbRef.current, {
      scale: 1.15,
      opacity: 0.7,
      duration: 4,
      ease: "sine.inOut",
    }).to(orbRef.current, {
      scale: 0.95,
      opacity: 0.4,
      duration: 4,
      ease: "sine.inOut",
    });
    return () => {
      tl.kill();
    };
  }, []);

  return (
    <div className="flex flex-col items-center lg:items-start relative">
      {/* Large animated gradient orb — hero atmosphere */}
      <div
        ref={orbRef}
        className="pointer-events-none absolute -top-40 -left-32 w-[600px] h-[600px] rounded-full opacity-50"
        style={{
          background:
            "radial-gradient(circle, rgba(14,165,233,0.18) 0%, rgba(99,102,241,0.10) 45%, transparent 70%)",
          filter: "blur(64px)",
        }}
        aria-hidden
      />

      {/* Announcement badge */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut", delay: 0.1 }}
        className="relative inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-sky-500/10 border border-sky-500/20 text-sky-400 text-sm font-medium mb-8"
      >
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
        Backed by OpenTofu · SOC2-ready from day one
      </motion.div>

      {/* H1 */}
      <motion.h1
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: "easeOut", delay: 0.2 }}
        className="relative text-4xl sm:text-5xl lg:text-[68px] font-bold tracking-tight leading-[1.04] mb-6"
      >
        <span className="text-[#F0F9FF]">Deploy your AI-built</span>
        <br />
        <span className="text-[#F0F9FF]">app to </span>
        <span
          className="bg-clip-text text-transparent"
          style={{
            backgroundImage: "linear-gradient(135deg, #38BDF8 0%, #67E8F9 40%, #A78BFA 100%)",
          }}
        >
          AWS.
        </span>
        <br />
        <span className="text-[#F0F9FF]">In </span>
        <span
          className="bg-clip-text text-transparent"
          style={{
            backgroundImage: "linear-gradient(135deg, #38BDF8 0%, #67E8F9 40%, #A78BFA 100%)",
          }}
        >
          20 minutes.
        </span>
      </motion.h1>

      {/* Subheadline */}
      <motion.p
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut", delay: 0.35 }}
        className="relative text-base sm:text-lg text-slate-400 leading-relaxed max-w-xl mb-10"
      >
        Connect your GitHub repo and AWS account. InfraReady handles the VPC, ECS, RDS, and security
        baseline — using your own AWS credits. No DevOps. No Kubernetes.
      </motion.p>

      {/* CTAs */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut", delay: 0.5 }}
        className="relative flex flex-col sm:flex-row items-center gap-4 mb-10"
      >
        <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
          <Link
            href={isAuthenticated ? "/projects" : "/login"}
            className="flex items-center justify-center gap-2 px-7 py-3.5 rounded-xl font-semibold text-white text-sm bg-sky-500 hover:bg-sky-400 transition-colors duration-200 shadow-lg shadow-sky-500/30 hover:shadow-sky-400/40 animate-glow-pulse whitespace-nowrap"
          >
            {isAuthenticated ? "Go to Dashboard" : "Deploy your first app"}
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="shrink-0">
              <path d="M2 7h10M8 3l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
        </motion.div>
        <motion.a
          href="#how-it-works"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.97 }}
          className="flex items-center justify-center px-7 py-3.5 rounded-xl font-semibold text-sm text-slate-300 border border-white/10 hover:border-white/20 hover:text-white hover:bg-white/[0.03] transition-all duration-200"
        >
          See how it works
        </motion.a>
      </motion.div>

      {/* Social proof */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6, delay: 0.7 }}
        className="relative flex items-center gap-3"
      >
        <div className="flex -space-x-2">
          {[
            { gradient: "from-sky-400 to-blue-600", letter: "J" },
            { gradient: "from-violet-400 to-purple-600", letter: "S" },
            { gradient: "from-emerald-400 to-green-600", letter: "A" },
            { gradient: "from-orange-400 to-red-500", letter: "M" },
          ].map(({ gradient, letter }, i) => (
            <div
              key={i}
              className={`w-7 h-7 rounded-full bg-gradient-to-br ${gradient} border-2 border-[#04091A] flex items-center justify-center text-[10px] font-bold text-white shrink-0`}
            >
              {letter}
            </div>
          ))}
        </div>
        <p className="text-sm text-slate-500">
          Join{" "}
          <span className="text-slate-300 font-semibold">200+ founders</span>{" "}
          who stopped fighting DevOps
        </p>
      </motion.div>
    </div>
  );
}
