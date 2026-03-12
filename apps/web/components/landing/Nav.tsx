"use client";

import Link from "next/link";

interface NavProps {
  isAuthenticated: boolean;
}

export function Nav({ isAuthenticated }: NavProps) {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 h-16 bg-[#0a0a0a] border-b border-[#27272a] flex items-center">
      <div className="max-w-[1100px] mx-auto px-6 w-full flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 group">
          <span className="text-[#f97316] text-lg leading-none select-none">⚡</span>
          <span className="font-bold text-white text-[15px] tracking-tight">InfraReady</span>
        </Link>

        {/* Right side */}
        <div className="flex items-center gap-4">
          <span className="hidden sm:block text-sm text-[#71717a]">
            hello@infraready.io
          </span>
          {isAuthenticated && (
            <Link
              href="/projects"
              className="px-4 py-2 rounded-md text-sm font-semibold text-white bg-[#f97316] hover:bg-orange-400 transition-colors duration-200"
            >
              Dashboard →
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
