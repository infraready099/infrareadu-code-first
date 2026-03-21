import { test, expect } from "@playwright/test";

test.describe("Landing page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("page title contains InfraReady", async ({ page }) => {
    await expect(page).toHaveTitle(/InfraReady/i);
  });

  test("hero heading is visible", async ({ page }) => {
    const hero = page.getByRole("heading", { level: 1 });
    await expect(hero).toBeVisible();
  });

  test("Sign in nav link exists", async ({ page }) => {
    const signIn = page.getByRole("link", { name: /sign in/i });
    await expect(signIn).toBeVisible();
    await expect(signIn).toHaveAttribute("href", /login/);
  });

  test("Get Early Access CTA is visible", async ({ page }) => {
    const cta = page.getByRole("button", { name: /get early access/i }).first();
    await expect(cta).toBeVisible();
  });

  test("waitlist form has name and email inputs", async ({ page }) => {
    const nameInput = page.getByPlaceholder(/your name/i).first();
    const emailInput = page.getByPlaceholder(/your@email/i).first();
    await expect(nameInput).toBeVisible();
    await expect(emailInput).toBeVisible();
  });

  test("How it works section has 3 steps", async ({ page }) => {
    await expect(page.getByText(/how it works/i).first()).toBeVisible();
    await expect(page.getByText("01").first()).toBeVisible();
    await expect(page.getByText("02").first()).toBeVisible();
    await expect(page.getByText("03").first()).toBeVisible();
  });

  test("features section mentions key selling points", async ({ page }) => {
    await expect(page.getByText(/one-click deploy/i).first()).toBeVisible();
    await expect(page.getByText(/you own the code/i)).toBeVisible();
    await expect(page.getByText(/SOC2/i).first()).toBeVisible();
  });

  test("no console errors on load", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    expect(errors).toHaveLength(0);
  });

  test("page has no failed network requests", async ({ page }) => {
    const failed: string[] = [];
    // Exclude Next.js RSC prefetch requests — these are background hints, not user-facing failures
    page.on("requestfailed", (req) => {
      if (!req.url().includes("_rsc=")) failed.push(req.url());
    });
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    expect(failed).toHaveLength(0);
  });

  test("mobile layout renders without overflow", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/");
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    const viewportWidth = await page.evaluate(() => window.innerWidth);
    expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 5); // 5px tolerance
  });
});
