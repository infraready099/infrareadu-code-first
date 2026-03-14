/**
 * App Type Registry
 *
 * Each handler knows everything about one application type:
 * - How to detect it from repo files
 * - Where to deploy it (ECS vs S3/CloudFront)
 * - What port it listens on
 * - What Dockerfile to generate if none exists
 * - What build command to run (for static sites)
 * - Where the build output lives
 *
 * Adding a new app type = add one file + register it here. No other changes.
 */

export type DeploymentTarget = "ecs" | "static";

export interface AppTypeHandler {
  /** Unique identifier — matches AppType in terraform-generator.ts */
  id: string;
  /** Human-readable display name */
  label: string;
  /** Where the built artifact goes */
  deploymentTarget: DeploymentTarget;
  /** Default container port (ECS only) */
  defaultPort: number;
  /** Default Fargate CPU units (ECS only) */
  defaultCpu: number;
  /** Default Fargate memory MB (ECS only) */
  defaultMemory: number;
  /**
   * Returns a confidence score 0–100 based on files found in the repo root.
   * Higher score = better match. Registry picks the highest score.
   */
  detectFromFiles(files: string[]): number;
  /**
   * Generate a Dockerfile for this app type.
   * Returns null if the app requires a user-provided Dockerfile (e.g. Java with non-standard structure).
   */
  generateDockerfile?(): string;
  /** npm/yarn/pnpm build command for static sites */
  buildCommand?: string;
  /** Directory containing built output (relative to repo root) */
  outputDirectory?: string;
}

// ─── Registry ────────────────────────────────────────────────────────────────

import { nodejsHandler }      from "./nodejs";
import { nextjsServerHandler } from "./nextjs-server";
import { nextjsStaticHandler } from "./nextjs-static";
import { pythonHandler }       from "./python";
import { javaHandler }         from "./java";
import { reactSpaHandler }     from "./react-spa";
import { staticHtmlHandler }   from "./static-html";

export const APP_TYPE_REGISTRY: AppTypeHandler[] = [
  staticHtmlHandler,   // check first — most specific static signal
  nextjsStaticHandler, // next.js with output:'export' — before nextjsServer
  nextjsServerHandler, // next.js server-rendered
  reactSpaHandler,     // CRA / Vite
  pythonHandler,
  javaHandler,
  nodejsHandler,       // fallback for any package.json app
];

/**
 * Detect the best-matching handler for a repo given its file list.
 * Returns the handler with the highest confidence score, or nodejsHandler as fallback.
 */
export function detectHandler(files: string[]): AppTypeHandler {
  let bestHandler: AppTypeHandler = nodejsHandler;
  let bestScore = 0;

  for (const handler of APP_TYPE_REGISTRY) {
    const score = handler.detectFromFiles(files);
    if (score > bestScore) {
      bestScore = score;
      bestHandler = handler;
    }
  }

  return bestHandler;
}

/** Returns true if the file list contains a Dockerfile at the repo root */
export function hasDockerfile(files: string[]): boolean {
  return files.some(f => f.toLowerCase() === "dockerfile" || f.toLowerCase() === "dockerfile.prod");
}

/** Look up a handler by its id (e.g. "nodejs", "python", "nextjs-server"). */
export function getHandlerById(id: string): AppTypeHandler | undefined {
  return APP_TYPE_REGISTRY.find(h => h.id === id);
}
