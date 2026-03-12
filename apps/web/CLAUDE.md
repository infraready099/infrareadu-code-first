# apps/web — Next.js Frontend

## Stack
Next.js 15 App Router, TypeScript, Tailwind CSS, Supabase Auth, GSAP, Lenis

## Key Routes
- `/` → redirects based on auth
- `/login` → GitHub OAuth via Supabase
- `/projects` → list projects from Supabase
- `/projects/new` → 3-step wizard (repo → IAM role → configure)
- `/projects/[id]` → realtime deployment logs

## Rules
- Dynamic import Lenis: `const { ReactLenis } = await import('lenis/react')` (prevents SSR crash)
- GSAP: use `useGSAP({ scope: ref })` from `@gsap/react`
- Lenis + ScrollTrigger: share RAF — see `lessons-learned.md`
- No Barba.js — use `next-transition-router` for page transitions
