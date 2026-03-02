# InfraReady.io — Project Context

## What We're Building
InfraReady.io is a one-click infrastructure deployment platform for solo founders, vibe coders, and early-stage startups. Users connect their GitHub repo and AWS account — InfraReady deploys their entire production infrastructure automatically using OpenTofu (open-source Terraform).

**Domain:** infraready.io (registered on Dynadot)
**Tagline:** "Your AI-built app, deployed to your own AWS in 20 minutes. No DevOps. No Kubernetes."
**Mission:** Every founder who builds with AI deserves infrastructure as powerful as the code they wrote.

## Founder
- Kay — solo founder, non-technical background, learning fast
- Role: CEO, product vision, customer discovery
- My role (Claude): CTO / Technical Co-Founder

## Target Customer (ICP)
1. **Vibe coders** — built with Cursor/Claude/Bolt, stuck on localhost
2. **Solo founders** — have AWS Activate credits they can't use
3. **Early-stage startups** — need SOC2-ready infra, can't afford DevOps engineer

## Core Architecture
- **Model:** BYOC (Bring Your Own Cloud) — infra deploys INTO customer's AWS account
- **IaC Engine:** OpenTofu (not Terraform — cleaner license, stronger community)
- **Structure:** Terraform Landing Zone pattern with 5 opinionated modules
- **Modules:** VPC, RDS, ECS, S3+CloudFront, Security Baseline (IAM)
- **Frontend:** Next.js
- **Backend:** Node.js API + AWS Lambda
- **Auth:** Supabase Auth
- **DB (our own):** Supabase (PostgreSQL)
- **Payments:** Stripe
- **Email:** Resend

## Pricing
- Starter: $29/mo (1 environment)
- Pro: $99/mo (multi-environment)
- Enterprise: Custom (SOC2, compliance, teams)

## Competitive Position
- Railway / Render: Managed cloud — they OWN your infra. We don't.
- Porter: BYOA but requires Kubernetes expertise — we don't
- Stacktape: Proprietary syntax — we use standard OpenTofu
- Spacelift: Enterprise only — we target startups

## Key Differentiators
1. Customer owns all infrastructure (no vendor lock-in)
2. OpenTofu-native (open source, no BSL license risk)
3. SOC2-ready from day one
4. Minimal IAM (least-privilege, not full admin)
5. AWS Activate credits integration

## Current Status
- Smoke test landing page deployed on Vercel
- DNS setup in progress (Dynadot → infraready.io)
- Pre-product, customer discovery phase
- Goal: 5 design partner conversations before writing product code

## Build Sequence (MVP)
1. 5 OpenTofu modules (VPC, RDS, ECS, S3+CloudFront, Security)
2. GitHub OAuth connection
3. AWS cross-account IAM role setup (one CloudFormation bootstrap)
4. Deployment job runner (AWS Lambda or ECS task)
5. Real-time deployment status UI
6. Stripe billing

## Current Phase
**Week 1-2:** Customer discovery — NO product code yet.
Talk to 5 solo founders about their AWS pain before writing a single line of product code.

## Important Decisions
- Use OpenTofu, NOT Terraform
- Deploy to CUSTOMER'S AWS account, NOT our servers
- Start AWS-only, add GCP/Azure later
- Prioritize SOC2 compliance angle
- Target vibe coders graduating from Render/Railway

## Files
- Landing page: infraready-smoketest.html (smoke test, deployed to Vercel)
- Domain: infraready.io on Dynadot
