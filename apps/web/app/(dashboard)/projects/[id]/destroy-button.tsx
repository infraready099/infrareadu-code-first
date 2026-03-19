"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Loader2 } from "lucide-react";
import { createBrowserClient } from "@supabase/ssr";

export function DestroyButton({ projectId }: { projectId: string }) {
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleDestroy() {
    setLoading(true);
    setError(null);
    try {
      // Send Bearer token so the API can verify identity — cookie auth is unreliable in client fetches
      const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      );
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      const res = await fetch("/api/destroy", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ projectId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to start destroy");
        setLoading(false);
        return;
      }
      router.push(`/projects/${projectId}?deployment=${data.deploymentId}`);
    } catch {
      setError("Network error — please try again");
      setLoading(false);
    }
  }

  // Error state — always visible regardless of confirming
  if (error) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-red-400 max-w-xs text-right">{error}</span>
        <button
          onClick={() => { setError(null); setConfirming(false); }}
          className="text-sm px-3 py-1.5 rounded bg-gray-700 hover:bg-gray-600 text-gray-200 transition-colors"
        >
          OK
        </button>
      </div>
    );
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-sm text-red-400">Destroy all AWS resources?</span>
        <button
          onClick={handleDestroy}
          disabled={loading}
          className="text-sm px-3 py-1.5 rounded bg-red-600 hover:bg-red-500 text-white font-medium transition-colors disabled:opacity-50 flex items-center gap-1.5"
        >
          {loading ? (
            <>
              <Loader2 className="w-3 h-3 animate-spin" />
              Starting...
            </>
          ) : (
            "Yes, destroy"
          )}
        </button>
        <button
          onClick={() => setConfirming(false)}
          disabled={loading}
          className="text-sm px-3 py-1.5 rounded bg-gray-700 hover:bg-gray-600 text-gray-200 transition-colors"
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      className="btn-secondary flex items-center gap-2 text-sm text-red-400 hover:text-red-300 border-red-900/50 hover:border-red-700"
    >
      <Trash2 className="w-4 h-4" />
      Destroy
    </button>
  );
}
