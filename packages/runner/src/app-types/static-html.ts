import type { AppTypeHandler } from "./index";

/**
 * Plain static site — HTML/CSS/JS, no build step needed.
 * Also handles Jekyll, Hugo, 11ty (which output to _site/ or public/).
 */
export const staticHtmlHandler: AppTypeHandler = {
  id:                "static-html",
  label:             "Static Site (HTML/CSS/JS)",
  deploymentTarget:  "static",
  defaultPort:       0,
  defaultCpu:        0,
  defaultMemory:     0,

  detectFromFiles(files) {
    const names = files.map(f => f.toLowerCase());
    const has = (s: string) => names.some(n => n.includes(s));
    // Pure static — index.html at root, no package.json, no backend files
    if (names.includes("index.html") && !has("package.json") && !has("requirements.txt") && !has("pom.xml")) {
      return 90;
    }
    // Jekyll / Hugo / 11ty
    if (has("_config.yml") || has("hugo.toml") || has(".eleventy.js")) return 85;
    return 0;
  },

  buildCommand:    undefined, // no build step — sync as-is
  outputDirectory: ".",
};
