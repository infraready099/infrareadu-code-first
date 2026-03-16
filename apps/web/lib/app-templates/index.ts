/**
 * App Template types and registry — web app copy.
 *
 * Authoritative source: packages/runner/src/app-templates/registry.ts
 * registry.ts here is a copy. When templates change in the runner, copy the file again.
 *
 * TODO: extract to @infraready/app-templates shared package when we have a first paying customer.
 */

export type { AppTemplate, TemplateCategory, TemplateEnvVar, TemplateVolume } from "./registry";
export { APP_TEMPLATES, getTemplate, getTemplatesByCategory, getAvailableCategories } from "./registry";
