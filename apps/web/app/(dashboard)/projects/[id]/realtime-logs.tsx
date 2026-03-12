"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Loader2 } from "lucide-react";

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

const levelClass: Record<string, string> = {
  success: "success",
  error:   "error",
  warn:    "warn",
  info:    "info",
};

export function RealtimeLogs({ deploymentId, initialLogs, initialStatus }: RealtimeLogsProps) {
  const [logs, setLogs]     = useState<LogLine[]>(initialLogs);
  const [status, setStatus] = useState(initialStatus);
  const bottomRef           = useRef<HTMLDivElement>(null);
  const supabase            = createClient();

  const isLive = status === "queued" || status === "running";

  // On mount, fetch current state in case we missed updates before subscribing
  useEffect(() => {
    if (!isLive) return;
    supabase
      .from("deployments")
      .select("logs, status")
      .eq("id", deploymentId)
      .single()
      .then(({ data }) => {
        if (data) {
          setLogs((data.logs as LogLine[]) ?? []);
          setStatus(data.status as string);
        }
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deploymentId]);

  // Subscribe to realtime updates on this deployment row
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

  // Auto-scroll to bottom as new logs arrive
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  return (
    <>
      <div className="deploy-log">
        {logs.length === 0 ? (
          <div className="flex items-center justify-center text-gray-600 min-h-[120px]">
            {isLive ? "Waiting for deployment to start..." : "No log output yet."}
          </div>
        ) : (
          logs.map((line, i) => (
            <div key={i} className={`deploy-log-line ${levelClass[line.level] ?? "info"}`}>
              <span className="text-gray-600 select-none shrink-0 tabular-nums">
                {line.ts ? new Date(line.ts).toISOString().replace("T", " ").slice(11, 19) : ""}
              </span>
              <span>{line.msg}</span>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {isLive && (
        <p className="mt-3 text-xs text-sky-400 flex items-center gap-1.5">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          Live — updating automatically
        </p>
      )}
    </>
  );
}
