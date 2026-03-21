import { test, expect } from "@playwright/test";
import { getSessionToken } from "../../helpers/supabase";

test.describe("POST /api/test-deploy — auth & validation guards", () => {
  test("returns 401 without auth", async ({ request }) => {
    const res = await request.post("https://infraready.io/api/test-deploy", {
      data: { projectId: "00000000-0000-0000-0000-000000000000" },
    });
    expect(res.status()).toBe(401);
  });

  test("returns 400 with non-UUID projectId", async ({ request }) => {
    const token = getSessionToken();
    const res = await request.post("https://infraready.io/api/test-deploy", {
      headers: { Authorization: `Bearer ${token}` },
      data: { projectId: "not-a-uuid" },
    });
    expect(res.status()).toBe(400);
  });

  test("returns 404 for project not owned by user", async ({ request }) => {
    const token = getSessionToken();
    const res = await request.post("https://infraready.io/api/test-deploy", {
      headers: { Authorization: `Bearer ${token}` },
      data: { projectId: "00000000-0000-0000-0000-000000000001" },
    });
    expect(res.status()).toBe(404);
  });
});
