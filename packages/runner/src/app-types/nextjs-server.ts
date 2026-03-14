import type { AppTypeHandler } from "./index";

export const nextjsServerHandler: AppTypeHandler = {
  id:                "nextjs",
  label:             "Next.js (server-rendered)",
  deploymentTarget:  "ecs",
  defaultPort:       3000,
  defaultCpu:        512,
  defaultMemory:     1024,

  detectFromFiles(files) {
    const names = files.map(f => f.toLowerCase());
    const has = (s: string) => names.some(n => n.includes(s));
    if (!has("next.config")) return 0;
    return 80;
  },

  generateDockerfile() {
    return `FROM node:20-alpine AS base
WORKDIR /app

FROM base AS deps
COPY package*.json ./
RUN npm ci

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM base AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
CMD ["node", "server.js"]
`;
  },
};
