import type { AppTypeHandler } from "./index";

/**
 * React SPA (Create React App or Vite).
 * Builds to static files → deploys to S3 + CloudFront.
 * No server needed.
 */
export const reactSpaHandler: AppTypeHandler = {
  id:                "react-spa",
  label:             "React SPA (Vite / CRA)",
  deploymentTarget:  "static",
  defaultPort:       0,
  defaultCpu:        0,
  defaultMemory:     0,

  detectFromFiles(files) {
    const names = files.map(f => f.toLowerCase());
    const has = (s: string) => names.some(n => n.includes(s));
    if (!has("package.json")) return 0;
    // Vite
    if (has("vite.config")) return 85;
    // CRA
    if (names.some(n => n === "src/index.tsx" || n === "src/index.jsx" || n === "src/app.tsx" || n === "src/app.jsx")) {
      if (!has("next.config") && !has("server.js") && !has("app.js")) return 75;
    }
    return 0;
  },

  // Build command depends on tool — we default to npm run build which works for both CRA and Vite
  buildCommand:    "npm ci && npm run build",
  // Vite outputs to dist/, CRA outputs to build/ — we default to dist, wizard can override
  outputDirectory: "dist",
};
