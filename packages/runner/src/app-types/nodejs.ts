import type { AppTypeHandler } from "./index";

export const nodejsHandler: AppTypeHandler = {
  id:                "nodejs",
  label:             "Node.js",
  deploymentTarget:  "ecs",
  defaultPort:       3000,
  defaultCpu:        256,
  defaultMemory:     512,

  detectFromFiles(files) {
    const names = files.map(f => f.toLowerCase());
    const has = (s: string) => names.some(n => n.includes(s));
    if (!has("package.json")) return 0;
    // Generic Node — lower score than specific handlers
    return 30;
  },

  generateDockerfile() {
    return `FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY . .
EXPOSE \${PORT:-3000}
CMD ["node", "index.js"]
`;
  },
};
