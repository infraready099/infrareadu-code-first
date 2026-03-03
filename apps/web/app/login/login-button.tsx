"use client";

import { useState } from "react";
import { Github, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export default function LoginButton() {
  const [loading, setLoading] = useState(false);

  async function handleGitHubLogin() {
    setLoading(true);
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: "github",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
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
