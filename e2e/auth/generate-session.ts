/**
 * One-time script to capture a real Supabase session for E2E tests.
 * Run: npx ts-node e2e/auth/generate-session.ts
 *
 * A browser will open — log in with GitHub, then wait for it to complete.
 * The session will be saved to e2e/auth/session.json (gitignored).
 */
import { chromium } from "@playwright/test";
import { join } from "path";

(async () => {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto("https://infraready.io/login");
  console.log("Waiting for you to log in with GitHub...");

  await page.waitForURL("**/projects**", { timeout: 120_000 });
  console.log("Logged in! Saving session...");

  const sessionPath = join(__dirname, "session.json");
  await context.storageState({ path: sessionPath });
  console.log(`Session saved to ${sessionPath}`);

  await browser.close();
})();
