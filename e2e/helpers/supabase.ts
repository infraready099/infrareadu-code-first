import { readFileSync, existsSync } from "fs";
import { join } from "path";

export function getSessionToken(): string {
  const sessionPath = join(__dirname, "../auth/session.json");
  if (!existsSync(sessionPath)) {
    throw new Error("No session.json found. Run: npx ts-node e2e/auth/generate-session.ts");
  }
  const state = JSON.parse(readFileSync(sessionPath, "utf-8"));
  const cookie = state.cookies?.find(
    (c: { name: string }) => c.name.startsWith("sb-") && c.name.endsWith("-auth-token")
  );
  if (!cookie) throw new Error("No Supabase auth cookie found in session.json");
  let parsed: { access_token?: string };
  try {
    parsed = JSON.parse(decodeURIComponent(cookie.value));
  } catch {
    // Some versions store as base64
    const decoded = Buffer.from(cookie.value, "base64").toString("utf-8");
    parsed = JSON.parse(decoded);
  }
  if (!parsed.access_token) {
    throw new Error("access_token missing from Supabase auth cookie — session.json may be stale. Re-run generate-session.ts");
  }
  return parsed.access_token;
}
