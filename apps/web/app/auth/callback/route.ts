import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const { searchParams, origin } = req.nextUrl;
  const code = searchParams.get("code");

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=auth`);
  }

  const supabase = await createServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    console.error("OAuth callback error:", error.message);
    return NextResponse.redirect(`${origin}/login?error=auth`);
  }

  const next = searchParams.get("next") ?? "/projects";
  // Only allow relative paths to prevent open redirect
  const destination = next.startsWith("/") ? next : "/projects";
  return NextResponse.redirect(`${origin}${destination}`);
}
