"use client";

import { useState } from "react";
import { Github, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { usePostHog } from "posthog-js/react";

export default function LoginButton() {
  const [loading, setLoading] = useState(false);
  const posthog = usePostHog();

  async function handleGitHubLogin() {
    setLoading(true);
    posthog?.capture("login_clicked", { provider: "github" });
    const supabase = createClient();
    const next = new URLSearchParams(window.location.search).get("next") ?? "/projects";
    await supabase.auth.signInWithOAuth({
      provider: "github",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
        scopes: "read:user user:email repo",
      },
    });
    // signInWithOAuth redirects the browser — no need to setLoading(false)
  }

  return (
    <button
      onClick={handleGitHubLogin}
      disabled={loading}
      className="btn-primary w-full flex items-center justify-center gap-2.5 py-2.5"
    >
      {loading ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : (
        <Github className="w-4 h-4" />
      )}
      {loading ? "Redirecting..." : "Continue with GitHub"}
    </button>
  );
}
