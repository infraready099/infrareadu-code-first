/**
 * App Type Registry
 *
 * Each handler knows everything about one application type:
 * - How to detect it from repo files
 * - Where to deploy it (ECS vs S3/CloudFront vs CodeBuild/mobile)
 * - What port it listens on
 * - What Dockerfile to generate if none exists
 * - What build command to run (for static sites)
 * - Where the build output lives
 * - What CodeBuild buildspec to generate (for mobile apps)
 *
 * Adding a new app type = add one file + register it here. No other changes.
 */

export type DeploymentTarget = "ecs" | "static" | "mobile";

/**
 * Mobile-specific configuration. Only present when deploymentTarget === "mobile".
 * Consumers (runner, terraform-generator) read these fields to parameterize the
 * codebuild module and Secrets Manager secrets.
 */
export interface MobileConfig {
  /** Target platform(s) to build. */
  platform: "ios" | "android" | "both";
  /** Mobile framework in use. Determines which buildspec variant is generated. */
  framework: "expo" | "react-native" | "flutter";
  /** iOS bundle identifier (e.g. com.example.app). Maps to BUNDLE_ID env var. */
  bundleId?: string;
  /** Android package name (e.g. com.example.app). Maps to PACKAGE_NAME env var. */
  packageName?: string;
  /** Expo build profile (e.g. "production", "preview"). Defaults to "production". */
  buildProfile?: string;
}

export interface AppTypeHandler {
  /** Unique identifier — matches AppType in terraform-generator.ts */
  id: string;
  /** Human-readable display name */
  label: string;
  /** Where the built artifact goes */
  deploymentTarget: DeploymentTarget;
  /** Default container port (ECS only; 0 for static and mobile) */
  defaultPort: number;
  /** Default Fargate CPU units (ECS only; 0 for static and mobile) */
  defaultCpu: number;
  /** Default Fargate memory MB (ECS only; 0 for static and mobile) */
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
  /**
   * Mobile-specific configuration. Present only when deploymentTarget === "mobile".
   * The runner sets this after detection / user override so buildspec generation
   * has access to platform and framework details.
   */
  mobileConfig?: MobileConfig;
  /**
   * Generate an AWS CodeBuild buildspec.yml string for mobile apps.
   * Only implemented by handlers with deploymentTarget === "mobile".
   */
  generateBuildspec?(): string;
}

// ─── Registry ────────────────────────────────────────────────────────────────

import { nodejsHandler }      from "./nodejs";
import { nextjsServerHandler } from "./nextjs-server";
import { nextjsStaticHandler } from "./nextjs-static";
import { pythonHandler }       from "./python";
import { javaHandler }         from "./java";
import { reactSpaHandler }     from "./react-spa";
import { staticHtmlHandler }   from "./static-html";
import { mobileHandler }       from "./mobile";

export const APP_TYPE_REGISTRY: AppTypeHandler[] = [
  mobileHandler,       // HIGHEST priority — mobile repos contain package.json too,
                       // so check before any web handler to avoid false positives
  staticHtmlHandler,   // most specific static signal
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

/** Look up a handler by its id (e.g. "nodejs", "python", "nextjs-server", "mobile"). */
export function getHandlerById(id: string): AppTypeHandler | undefined {
  return APP_TYPE_REGISTRY.find(h => h.id === id);
}
