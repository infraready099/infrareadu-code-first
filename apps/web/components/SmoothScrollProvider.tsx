"use client";

import { useEffect } from "react";

// Dynamic import inside useEffect — lenis accesses globalThis at module init
// and crashes during Next.js SSR. This ensures it only runs in the browser.
export function SmoothScrollProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
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
  }, []);

  return <>{children}</>;
}
