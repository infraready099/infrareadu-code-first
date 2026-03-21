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
  try {
    const parsed = JSON.parse(decodeURIComponent(cookie.value));
    return parsed.access_token as string;
  } catch {
    // Some versions store as base64
    const decoded = Buffer.from(cookie.value, "base64").toString("utf-8");
    const parsed = JSON.parse(decoded);
    return parsed.access_token as string;
  }
}
