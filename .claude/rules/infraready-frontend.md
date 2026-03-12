---
paths:
  - "apps/web/**/*.ts"
  - "apps/web/**/*.tsx"
---

# InfraReady Frontend Rules

- Use `lenis` npm package (not `@studio-freight/lenis` — deprecated)
- Import from `lenis/react`: `import { ReactLenis, useLenis } from "lenis/react"`
- GSAP: always `npm install gsap @gsap/react`, use `useGSAP({ scope: ref })` hook
- Lenis + GSAP ScrollTrigger: must share RAF — `lenis.on("scroll", ScrollTrigger.update)` + `gsap.ticker.lagSmoothing(0)`
- No Barba.js — incompatible with Next.js App Router. Use `next-transition-router` instead.
- Dynamic import Lenis to prevent SSR crash: `const { ReactLenis } = await import('lenis/react')`
- Register GSAP plugins once in `lib/gsap-config.ts`
