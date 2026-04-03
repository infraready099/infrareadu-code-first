"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw } from "lucide-react";
import { usePostHog } from "posthog-js/react";

interface DeployAgainButtonProps {
  projectId: string;
}

export function DeployAgainButton({ projectId }: DeployAgainButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const router = useRouter();
  const posthog = usePostHog();

  async function deployAgain() {
    setLoading(true);
    setError(null);
    try {
      // Fetch the last deploy's modules + config (same endpoint used by Preview Changes)
      const cfgRes = await fetch(`/api/plan/config/${projectId}`);
      if (!cfgRes.ok) {
        const d = await cfgRes.json();
        throw new Error(d.error ?? "Could not load previous deployment config");
      }
      const { modules, config } = await cfgRes.json();

      // Fire a new deploy with the same parameters — AWS role + external ID are
      // stored on the project row server-side, no need to pass them here.
      const deployRes = await fetch("/api/deploy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, modules, config }),
      });

      if (!deployRes.ok) {
        const d = await deployRes.json();
        throw new Error(d.error ?? "Failed to start deployment");
      }

      const { deploymentId } = await deployRes.json();
      posthog?.capture("deploy_again_clicked", { project_id: projectId });
      router.push(`/projects/${projectId}?deployment=${deploymentId}`);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <button
        onClick={deployAgain}
        disabled={loading}
        className="btn-secondary flex items-center gap-2 text-sm"
      >
        {loading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Starting...
          </>
        ) : (
          <>
            <RefreshCw className="w-4 h-4" />
            Deploy Again
          </>
        )}
      </button>
      {error && <p className="text-xs text-red-400 mt-1 max-w-[200px]">{error}</p>}
    </div>
  );
}
