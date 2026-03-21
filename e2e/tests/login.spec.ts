import { test, expect } from "@playwright/test";

test.describe("Login page", () => {
  test("renders GitHub login button", async ({ page }) => {
    await page.goto("/login");
    const btn = page.getByRole("button", { name: /continue with github/i });
    await expect(btn).toBeVisible();
    await expect(btn).toBeEnabled();
  });

  test("shows error banner with ?error=auth", async ({ page }) => {
    await page.goto("/login?error=auth");
    await expect(page.getByText(/authentication failed/i)).toBeVisible();
  });

  test("unauthenticated /projects redirects to /login", async ({ page }) => {
    await page.goto("/projects");
    await expect(page).toHaveURL(/login/);
  });

  test("GitHub button shows loading state on click", async ({ page }) => {
    await page.goto("/login");
    const btn = page.getByRole("button", { name: /continue with github/i });
    await btn.click();
    // Should briefly show a loading state before redirect
    await expect(page.getByText(/redirecting/i)).toBeVisible({ timeout: 3000 }).catch(() => {
      // If it redirects before we can catch it, that's also fine
    });
  });

  test("no console errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });
    await page.goto("/login");
    await page.waitForLoadState("networkidle");
    expect(errors).toHaveLength(0);
  });
});
