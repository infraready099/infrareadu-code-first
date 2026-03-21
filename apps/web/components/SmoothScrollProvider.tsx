"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

// Dashboard routes use h-screen + overflow-y-auto on an inner container.
// Lenis attaches to window and intercepts wheel events before they reach
// that inner container — killing scroll entirely on dashboard pages.
// Skip Lenis on any route that uses the fixed-height sidebar shell.
const DASHBOARD_PREFIXES = ["/projects", "/templates", "/deployments", "/settings"];

export function SmoothScrollProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isDashboard = DASHBOARD_PREFIXES.some((p) => pathname?.startsWith(p));

  useEffect(() => {
    if (isDashboard) return;

    let cleanup: (() => void) | undefined;

    import("lenis").then(({ default: Lenis }) => {
      const lenis = new Lenis({
        duration: 1.2,
        easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
        smoothWheel: true,
        touchMultiplier: 2,
      });

      let rafId: number;
      function raf(time: number) {
        lenis.raf(time);
        rafId = requestAnimationFrame(raf);
      }
      rafId = requestAnimationFrame(raf);

      cleanup = () => {
        cancelAnimationFrame(rafId);
        lenis.destroy();
      };
    });

    return () => cleanup?.();
  }, [isDashboard]);

  return <>{children}</>;
}
