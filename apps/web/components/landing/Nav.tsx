"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Zap, Menu, X } from "lucide-react";

interface NavProps {
  isAuthenticated: boolean;
}

const NAV_LINKS = [
  { label: "Features", href: "#features" },
  { label: "How it works", href: "#how-it-works" },
  { label: "AWS Credits", href: "#aws-credits" },
  { label: "Pricing", href: "#free-tier" },
];

export function Nav({ isAuthenticated }: NavProps) {
  const pathname = usePathname();
  const isLanding = pathname === "/";
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header
      className="fixed top-4 left-0 right-0 z-50 flex justify-center px-4"
      style={{ pointerEvents: "none" }}
    >
      <div className="w-full max-w-[1000px]" style={{ pointerEvents: "auto" }}>
        {/* Main nav bar */}
        <nav
          className="flex items-center justify-between gap-4 px-5 py-3 rounded-2xl"
          style={{
            background: "rgba(0, 0, 0, 0.75)",
            border: "1px solid rgba(0, 229, 255, 0.12)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            boxShadow: "0 0 40px rgba(0, 229, 255, 0.05), 0 1px 0 rgba(255,255,255,0.04) inset",
          }}
        >
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 group shrink-0">
            <div
              className="flex items-center justify-center w-7 h-7 rounded-lg"
              style={{
                background: "rgba(0, 229, 255, 0.1)",
                border: "1px solid rgba(0, 229, 255, 0.25)",
              }}
            >
              <Zap size={14} className="text-[#00E5FF]" fill="#00E5FF" />
            </div>
            <span className="font-bold text-white text-[15px] tracking-tight">
              InfraReady
            </span>
          </Link>

          {/* Desktop nav links */}
          <div className="hidden md:flex items-center gap-6 flex-1 justify-center">
            {isLanding &&
              NAV_LINKS.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  className="text-sm text-[#94A3B8] hover:text-white transition-colors duration-150"
                >
                  {link.label}
                </a>
              ))}
            <Link
              href="/templates"
              className="text-sm transition-colors duration-150"
              style={{ color: pathname === "/templates" ? "#00E5FF" : "#94A3B8" }}
            >
              Templates
            </Link>
          </div>

          {/* Desktop right actions */}
          <div className="hidden md:flex items-center gap-3 shrink-0">
            {isAuthenticated ? (
              <Link
                href="/projects"
                className="px-4 py-2 rounded-xl text-sm font-semibold text-black transition-all duration-200"
                style={{ background: "#00E5FF", boxShadow: "0 0 20px rgba(0,229,255,0.4)" }}
              >
                Dashboard
              </Link>
            ) : (
              <>
                <Link
                  href="/login"
                  className="text-sm text-[#94A3B8] hover:text-white transition-colors duration-150"
                >
                  Sign in
                </Link>
                <Link
                  href="/login"
                  className="px-4 py-2 rounded-xl text-sm font-bold text-black transition-all duration-200"
                  style={{ background: "#00E5FF", boxShadow: "0 0 20px rgba(0,229,255,0.4)" }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.boxShadow = "0 0 30px rgba(0,229,255,0.65)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.boxShadow = "0 0 20px rgba(0,229,255,0.4)";
                  }}
                >
                  Start Free
                </Link>
              </>
            )}
          </div>

          {/* Mobile right: CTA + hamburger */}
          <div className="flex md:hidden items-center gap-2 shrink-0">
            {isAuthenticated ? (
              <Link
                href="/projects"
                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-black"
                style={{ background: "#00E5FF" }}
              >
                Dashboard
              </Link>
            ) : (
              <Link
                href="/login"
                className="px-3 py-1.5 rounded-lg text-xs font-bold text-black"
                style={{ background: "#00E5FF" }}
              >
                Start Free
              </Link>
            )}
            <button
              className="flex items-center justify-center w-8 h-8 rounded-lg transition-colors duration-150"
              style={{ color: "#94A3B8" }}
              onClick={() => setMobileOpen((v) => !v)}
              aria-label="Toggle menu"
            >
              {mobileOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
          </div>
        </nav>

        {/* Mobile dropdown */}
        {mobileOpen && (
          <div
            className="mt-2 rounded-2xl px-4 py-4 flex flex-col gap-1 md:hidden"
            style={{
              background: "rgba(0, 0, 0, 0.92)",
              border: "1px solid rgba(0, 229, 255, 0.12)",
              backdropFilter: "blur(20px)",
              WebkitBackdropFilter: "blur(20px)",
            }}
          >
            {isLanding &&
              NAV_LINKS.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileOpen(false)}
                  className="text-sm text-[#94A3B8] hover:text-white transition-colors duration-150 py-2.5 px-2 rounded-lg hover:bg-white/5"
                >
                  {link.label}
                </a>
              ))}
            <Link
              href="/templates"
              onClick={() => setMobileOpen(false)}
              className="text-sm py-2.5 px-2 rounded-lg hover:bg-white/5 transition-colors duration-150"
              style={{ color: pathname === "/templates" ? "#00E5FF" : "#94A3B8" }}
            >
              Templates
            </Link>
            {!isAuthenticated && (
              <Link
                href="/login"
                onClick={() => setMobileOpen(false)}
                className="text-sm text-[#94A3B8] hover:text-white transition-colors duration-150 py-2.5 px-2 rounded-lg hover:bg-white/5"
              >
                Sign in
              </Link>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
