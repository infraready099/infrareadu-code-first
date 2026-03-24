import { test, expect } from "@playwright/test";

test.describe("POST /api/waitlist", () => {
  test("valid signup returns 2xx", async ({ request }) => {
    const res = await request.post("https://infraready.io/api/waitlist", {
      data: { name: "E2E Test User", email: `e2e+${Date.now()}@test-infraready.io` },
    });
    expect([200, 201]).toContain(res.status());
    const body = await res.json();
    expect(body.ok ?? body.duplicate).toBeTruthy();
  });

  test("missing email returns 400", async ({ request }) => {
    const res = await request.post("https://infraready.io/api/waitlist", {
      data: { name: "No Email" },
    });
    expect(res.status()).toBe(400);
  });

  test("invalid email format returns 400", async ({ request }) => {
    const res = await request.post("https://infraready.io/api/waitlist", {
      data: { name: "Bad Email", email: "not-an-email" },
    });
    expect(res.status()).toBe(400);
  });

  test("missing name returns 400", async ({ request }) => {
    const res = await request.post("https://infraready.io/api/waitlist", {
      data: { email: `e2e+noname+${Date.now()}@test-infraready.io` },
    });
    expect(res.status()).toBe(400);
  });

  test("empty body returns 400", async ({ request }) => {
    const res = await request.post("https://infraready.io/api/waitlist", {
      data: {},
    });
    expect(res.status()).toBe(400);
  });
});
