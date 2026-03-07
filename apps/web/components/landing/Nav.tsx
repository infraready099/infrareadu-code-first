"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";

interface NavProps {
  isAuthenticated: boolean;
}

export function Nav({ isAuthenticated }: NavProps) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handler, { passive: true });
    return () => window.removeEventListener("scroll", handler);
  }, []);

  return (
    <motion.header
      initial={{ opacity: 0, y: -16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled
          ? "bg-[#04091A]/90 backdrop-blur-xl border-b border-white/[0.06] shadow-lg shadow-black/20"
          : "bg-transparent"
      }`}
    >
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5 group">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-sky-400 to-violet-500 flex items-center justify-center shadow-lg shadow-sky-500/20 group-hover:shadow-sky-500/40 transition-shadow duration-300">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M7 1L12 4V10L7 13L2 10V4L7 1Z" stroke="white" strokeWidth="1.5" strokeLinejoin="round" />
              <path d="M7 1V7M2 4L7 7M12 4L7 7" stroke="white" strokeWidth="1" strokeOpacity="0.6" />
            </svg>
          </div>
          <span className="font-bold text-[#F0F9FF] text-[15px] tracking-tight">InfraReady</span>
        </Link>

        {/* Center nav links */}
        <nav className="hidden md:flex items-center gap-8">
          {["Features", "Pricing", "Docs"].map((link) => (
            <Link
              key={link}
              href={link === "Docs" ? "https://docs.infraready.io" : `#${link.toLowerCase()}`}
              className="text-sm text-slate-400 hover:text-[#F0F9FF] transition-colors duration-200 font-medium"
            >
              {link}
            </Link>
          ))}
        </nav>

        {/* Right CTAs */}
        <div className="flex items-center gap-3">
          {isAuthenticated ? (
            <Link
              href="/projects"
              className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-sky-500 hover:bg-sky-400 transition-colors duration-200 shadow-lg shadow-sky-500/20"
            >
              Dashboard →
            </Link>
          ) : (
            <>
              <Link
                href="/login"
                className="hidden sm:block px-4 py-2 rounded-lg text-sm font-medium text-slate-300 hover:text-white border border-white/10 hover:border-white/20 transition-all duration-200"
              >
                Sign in
              </Link>
              <Link
                href="/login"
                className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-sky-500 hover:bg-sky-400 transition-colors duration-200 shadow-lg shadow-sky-500/20"
              >
                Get Started Free
              </Link>
            </>
          )}
        </div>
      </div>
    </motion.header>
  );
}
