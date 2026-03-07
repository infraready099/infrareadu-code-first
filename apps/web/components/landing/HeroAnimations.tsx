"use client";

import Link from "next/link";
import { motion } from "framer-motion";

interface HeroAnimationsProps {
  isAuthenticated: boolean;
}

export function HeroAnimations({ isAuthenticated }: HeroAnimationsProps) {
  return (
    <div className="flex flex-col items-center lg:items-start">
      {/* Announcement badge */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut", delay: 0.1 }}
        className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-sky-500/10 border border-sky-500/20 text-sky-400 text-sm font-medium mb-8"
      >
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
        Backed by OpenTofu · SOC2-ready from day one
      </motion.div>

      {/* H1 */}
      <motion.h1
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut", delay: 0.2 }}
        className="text-4xl sm:text-5xl lg:text-[64px] font-bold tracking-tight leading-[1.05] mb-6"
      >
        <span className="text-[#F0F9FF]">Deploy your AI-built app to</span>{" "}
        <span
          className="bg-clip-text text-transparent inline-block"
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
        className="text-base sm:text-lg text-slate-400 leading-relaxed max-w-xl mb-10"
      >
        Connect your GitHub repo and AWS account. InfraReady handles the VPC, ECS, RDS, and security baseline — using your own AWS credits. No DevOps. No Kubernetes.
      </motion.p>

      {/* CTAs */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut", delay: 0.5 }}
        className="flex flex-col sm:flex-row items-center gap-4 mb-10"
      >
        <Link
          href={isAuthenticated ? "/projects" : "/login"}
          className="w-full sm:w-auto px-7 py-3.5 rounded-xl font-semibold text-white text-sm bg-sky-500 hover:bg-sky-400 transition-all duration-200 shadow-lg shadow-sky-500/25 hover:shadow-sky-400/35 hover:scale-[1.02] active:scale-[0.98] text-center animate-glow-pulse"
        >
          {isAuthenticated ? "Go to Dashboard →" : "Deploy your first app →"}
        </Link>
        <a
          href="#how-it-works"
          className="w-full sm:w-auto px-7 py-3.5 rounded-xl font-semibold text-sm text-slate-300 border border-white/10 hover:border-white/20 hover:text-white transition-all duration-200 text-center hover:bg-white/[0.03]"
        >
          See how it works
        </a>
      </motion.div>

      {/* Social proof */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6, delay: 0.7 }}
        className="flex items-center gap-3"
      >
        <div className="flex -space-x-2">
          {[
            "bg-gradient-to-br from-sky-400 to-blue-600",
            "bg-gradient-to-br from-violet-400 to-purple-600",
            "bg-gradient-to-br from-emerald-400 to-green-600",
            "bg-gradient-to-br from-orange-400 to-red-500",
          ].map((gradient, i) => (
            <div
              key={i}
              className={`w-7 h-7 rounded-full ${gradient} border-2 border-[#04091A] flex items-center justify-center text-[10px] font-bold text-white`}
            >
              {["J", "S", "A", "M"][i]}
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
