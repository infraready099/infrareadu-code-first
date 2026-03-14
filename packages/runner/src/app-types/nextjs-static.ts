import type { AppTypeHandler } from "./index";

/**
 * Next.js with `output: 'export'` in next.config — produces static HTML/CSS/JS.
 * Deploys to S3 + CloudFront, not ECS. No server needed.
 *
 * Detection: next.config.* present AND repo explicitly marked as static
 * (the wizard asks the user to confirm this since we can't reliably detect
 * `output: 'export'` from file listing alone).
 */
export const nextjsStaticHandler: AppTypeHandler = {
  id:                "nextjs-static",
  label:             "Next.js (static export)",
  deploymentTarget:  "static",
  defaultPort:       0, // no port — static site
  defaultCpu:        0,
  defaultMemory:     0,

  detectFromFiles(files) {
    // Lower confidence than nextjs-server — wizard must confirm static export
    const names = files.map(f => f.toLowerCase());
    const has = (s: string) => names.some(n => n.includes(s));
    if (!has("next.config")) return 0;
    // Only return a score if there's an explicit signal (out/ dir already exists)
    if (names.some(n => n === "out/" || n === "out")) return 70;
    return 0; // Let wizard decide between static and server
  },

  buildCommand:    "npm ci && npm run build",
  outputDirectory: "out",
};
