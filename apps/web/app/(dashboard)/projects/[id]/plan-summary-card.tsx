"use client";

import { useState } from "react";
import { Plus, Minus, RefreshCw, Loader2, Rocket } from "lucide-react";

interface ModulePlan {
  toAdd:     number;
  toChange:  number;
  toDestroy: number;
}

interface PlanSummaryCardProps {
  planSummary: Record<string, ModulePlan>;
  projectId:   string;
  deploymentId: string;
  /** Called after the user confirms and a deploy is queued. Passes the new deploymentId. */
  onDeployStarted: (newDeploymentId: string) => void;
}

export function PlanSummaryCard({ planSummary, projectId, deploymentId, onDeployStarted }: PlanSummaryCardProps) {
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  const modules = Object.entries(planSummary);
  const totals = modules.reduce(
    (acc, [, m]) => ({
      toAdd:     acc.toAdd     + m.toAdd,
      toChange:  acc.toChange  + m.toChange,
      toDestroy: acc.toDestroy + m.toDestroy,
    }),
    { toAdd: 0, toChange: 0, toDestroy: 0 }
  );

  const hasChanges = totals.toAdd > 0 || totals.toChange > 0 || totals.toDestroy > 0;

  async function confirmDeploy() {
    setLoading(true);
    setError(null);
    try {
      // Fetch the plan deployment to get config + modules
      const res = await fetch(`/api/plan/${deploymentId}`);
      if (!res.ok) throw new Error("Could not load plan details");
      const plan = await res.json();

      const deployRes = await fetch("/api/deploy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          modules: plan.modules,
          config:  plan.config,
        }),
      });

      if (!deployRes.ok) {
        const data = await deployRes.json();
        throw new Error(data.error ?? "Failed to start deployment");
      }

      const { deploymentId: newId } = await deployRes.json();
      onDeployStarted(newId);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-6 rounded-xl border border-orange-500/30 bg-orange-950/20 p-5">
      <h3 className="text-sm font-semibold text-orange-300 mb-4 uppercase tracking-wide">
        Plan Summary — Review before deploying
      </h3>

      <div className="space-y-2 mb-5">
        {modules.map(([mod, plan]) => (
          <div key={mod} className="flex items-center justify-between text-sm">
            <span className="font-mono text-gray-400">{mod}</span>
            <div className="flex items-center gap-4">
              {plan.toAdd > 0 && (
                <span className="flex items-center gap-1 text-emerald-400">
                  <Plus className="w-3 h-3" />
                  {plan.toAdd} add
                </span>
              )}
              {plan.toChange > 0 && (
                <span className="flex items-center gap-1 text-yellow-400">
                  <RefreshCw className="w-3 h-3" />
                  {plan.toChange} change
                </span>
              )}
              {plan.toDestroy > 0 && (
                <span className="flex items-center gap-1 text-red-400">
                  <Minus className="w-3 h-3" />
                  {plan.toDestroy} destroy
                </span>
              )}
              {plan.toAdd === 0 && plan.toChange === 0 && plan.toDestroy === 0 && (
                <span className="text-gray-600">no changes</span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Totals bar */}
      <div className="flex items-center gap-6 text-xs text-gray-500 mb-5 py-3 border-t border-orange-500/20">
        <span className="text-emerald-400 font-medium">+{totals.toAdd} add</span>
        <span className="text-yellow-400 font-medium">~{totals.toChange} change</span>
        <span className="text-red-400 font-medium">-{totals.toDestroy} destroy</span>
      </div>

      {!hasChanges && (
        <p className="text-sm text-gray-500 mb-4">
          Infrastructure is already up to date — no changes will be made.
        </p>
      )}

      {error && (
        <p className="text-sm text-red-400 mb-3">{error}</p>
      )}

      <button
        onClick={confirmDeploy}
        disabled={loading}
        className="btn-primary flex items-center gap-2 text-sm"
      >
        {loading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Starting deployment...
          </>
        ) : (
          <>
            <Rocket className="w-4 h-4" />
            {hasChanges ? "Confirm & Deploy" : "Deploy (no changes)"}
          </>
        )}
      </button>
    </div>
  );
}
