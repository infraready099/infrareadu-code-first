import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  baseURL: "https://infraready.io",
  timeout: 30_000,
  retries: process.env.CI ? 2 : 1,
  workers: process.env.CI ? 1 : 2,
  reporter: [["html", { open: "never", outputFolder: "playwright-report" }], ["list"]],
  use: {
    baseURL: "https://infraready.io",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "unauthenticated",
      use: { ...devices["Desktop Chrome"], baseURL: "https://infraready.io" },
      testMatch: [
        "**/landing.spec.ts",
        "**/login.spec.ts",
        "**/pricing.spec.ts",
        "**/waitlist-api.spec.ts",
      ],
    },
    {
      name: "authenticated",
      use: {
        ...devices["Desktop Chrome"],
        storageState: "auth/session.json",
      },
      testMatch: [
        "**/projects-list.spec.ts",
        "**/new-project-wizard.spec.ts",
        "**/project-detail.spec.ts",
        "**/api/**",
      ],
    },
  ],
});
