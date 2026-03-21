"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";

interface LogLine {
  ts:    string;
  level: "info" | "success" | "error" | "warn";
  msg:   string;
}

interface RealtimeLogsProps {
  deploymentId:   string;
  initialLogs:    LogLine[];
  initialStatus:  string;
}

export function RealtimeLogs({ deploymentId, initialLogs, initialStatus }: RealtimeLogsProps) {
  const [logs, setLogs]     = useState<LogLine[]>(initialLogs);
  const [status, setStatus] = useState(initialStatus);
  const bottomRef           = useRef<HTMLDivElement>(null);
  // Memoize the client so it's created once per component mount, not every render.
  // If recreated on every render it would be a new object reference — causing the
  // realtime subscription effect to re-run and pile up duplicate channel subscriptions.
  const supabase            = useMemo(() => createClient(), []);

  const isLive    = status === "queued" || status === "deploying" || status === "running" || status === "destroying";
  const isFailed  = status === "failed";
  const isSuccess = status === "success";

  const statusRef   = useRef(status);
  statusRef.current = status;
  // Track whether the user has scrolled away from the bottom so we don't
  // hijack their scroll position while they're reading earlier log lines.
  const containerRef = useRef<HTMLDivElement>(null);

  const fetchLatest = async () => {
    const { data } = await supabase
      .from("deployments")
      .select("logs, status")
      .eq("id", deploymentId)
      .single();
    if (data) {
      setLogs((data.logs as LogLine[]) ?? []);
      setStatus(data.status as string);
    }
  };

  // Fetch immediately on mount to catch up with any missed updates
  useEffect(() => {
    fetchLatest();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deploymentId]);

  // Poll every 3s while live — reliable fallback if realtime WebSocket is slow
  useEffect(() => {
    const interval = setInterval(() => {
      const live = ["queued", "deploying", "running", "destroying"].includes(statusRef.current);
      if (!live) {
        clearInterval(interval);
        return;
      }
      fetchLatest();
    }, 3000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deploymentId]);

  // Realtime subscription as bonus fast-path on top of polling
  useEffect(() => {
    if (!isLive) return;

    const channel = supabase
      .channel(`deployment:${deploymentId}`)
      .on(
        "postgres_changes",
        {
          event:  "UPDATE",
          schema: "public",
          table:  "deployments",
          filter: `id=eq.${deploymentId}`,
        },
        (payload) => {
          const row = payload.new as { logs: LogLine[]; status: string };
          setLogs(row.logs ?? []);
          setStatus(row.status);
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [deploymentId, isLive, supabase]);

  // Auto-scroll to bottom as new logs arrive, but only if the user hasn't scrolled up
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    // Only auto-scroll if the user is within 80px of the bottom
    if (distanceFromBottom < 80) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs]);

  return (
    <>
      <div className="deploy-log" ref={containerRef}>
        {logs.length === 0 ? (
          <div className="flex items-center justify-center text-gray-600 min-h-[160px] text-sm">
            {isLive ? (
              <span className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-orange-500" />
                Waiting for deployment to start...
              </span>
            ) : "No logs available."}
          </div>
        ) : (
          logs.map((line, i) => {
            const time = line.ts
              ? new Date(line.ts).toISOString().replace("T", " ").slice(11, 19)
              : "";
            // Split multi-line messages into separate visual rows
            const lines = line.msg.split("\n");
            return lines.map((text, j) => (
              <div key={`${i}-${j}`} className={`deploy-log-line ${line.level}`}>
                <span className="ts">{j === 0 ? time : ""}</span>
                <span className="msg">{text}</span>
              </div>
            ));
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Status footer */}
      {isLive && (
        <p className="mt-3 text-xs text-orange-400 flex items-center gap-1.5">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          Live — updating automatically
        </p>
      )}

      {isFailed && (
        <div className="mt-3 flex items-center gap-2 text-sm font-medium text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-2.5">
          <XCircle className="w-4 h-4 shrink-0" />
          Deployment failed — check the error lines above for details
        </div>
      )}

      {isSuccess && (
        <div className="mt-3 flex items-center gap-2 text-sm font-medium text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-4 py-2.5">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          Deployment complete — your infrastructure is live
        </div>
      )}
    </>
  );
}
