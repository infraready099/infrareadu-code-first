"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FlaskConical, Loader2 } from "lucide-react";
import { createBrowserClient } from "@supabase/ssr";

export function TestDeployButton({ projectId }: { projectId: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleTestDeploy() {
    setLoading(true);
    setError(null);
    try {
      const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      );
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      const res = await fetch("/api/test-deploy", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ projectId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to start test deploy");
        setLoading(false);
        return;
      }
      // Navigate to the deploy deployment's log so the user can watch it
      router.push(`/projects/${projectId}?deployment=${data.deployDeploymentId}`);
      router.refresh();
    } catch {
      setError("Network error — please try again");
      setLoading(false);
    }
  }

  if (error) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-red-400 max-w-xs text-right">{error}</span>
        <button
          onClick={() => setError(null)}
          className="text-sm px-3 py-1.5 rounded bg-gray-700 hover:bg-gray-600 text-gray-200 transition-colors"
        >
          OK
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={handleTestDeploy}
      disabled={loading}
      title="Deploy infrastructure then automatically destroy it — useful for testing"
      className="btn-secondary flex items-center gap-2 text-sm text-violet-400 hover:text-violet-300 border-violet-900/50 hover:border-violet-700 disabled:opacity-50"
    >
      {loading ? (
        <>
          <Loader2 className="w-4 h-4 animate-spin" />
          Queuing...
        </>
      ) : (
        <>
          <FlaskConical className="w-4 h-4" />
          Test Deploy
        </>
      )}
    </button>
  );
}
