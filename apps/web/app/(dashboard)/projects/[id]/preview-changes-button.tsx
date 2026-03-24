"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ClipboardList } from "lucide-react";

interface PreviewChangesButtonProps {
  projectId: string;
}

export function PreviewChangesButton({ projectId }: PreviewChangesButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);
  const router = useRouter();

  async function runPlan() {
    setLoading(true);
    setError(null);
    try {
      // Fetch the project's last successful deploy to get modules + config
      const res = await fetch(`/api/plan/config/${projectId}`);
      if (!res.ok) throw new Error("Could not load project config");
      const { modules, config } = await res.json();

      const planRes = await fetch("/api/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, modules, config }),
      });

      if (!planRes.ok) {
        const data = await planRes.json();
        throw new Error(data.error ?? "Failed to start plan");
      }

      const { deploymentId } = await planRes.json();
      router.push(`/projects/${projectId}?deployment=${deploymentId}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <button
        onClick={runPlan}
        disabled={loading}
        className="btn-secondary flex items-center gap-2 text-sm"
      >
        {loading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Planning...
          </>
        ) : (
          <>
            <ClipboardList className="w-4 h-4" />
            Preview Changes
          </>
        )}
      </button>
      {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
    </div>
  );
}
