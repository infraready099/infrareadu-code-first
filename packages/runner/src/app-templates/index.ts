/**
 * App Templates — barrel export
 */

export type {
  AppTemplate,
  TemplateCategory,
  TemplateEnvVar,
  TemplateVolume,
} from "./registry";

export {
  APP_TEMPLATES,
  getTemplate,
  getTemplatesByCategory,
  getAvailableCategories,
} from "./registry";
