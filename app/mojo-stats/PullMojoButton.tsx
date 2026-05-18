"use client";

import { useEffect, useState } from "react";

type PullResult = {
  tone: "success" | "warning" | "error";
  title: string;
  message: string;
};

export default function PullMojoButton() {
  const [isPulling, setIsPulling] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [result, setResult] = useState<PullResult | null>(null);

  useEffect(() => {
    if (!isPulling) {
      setElapsedSeconds(0);
      return;
    }

    const intervalId = window.setInterval(() => {
      setElapsedSeconds((value) => value + 1);
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [isPulling]);

  const elapsedLabel =
    elapsedSeconds < 60
      ? `${elapsedSeconds}s`
      : `${Math.floor(elapsedSeconds / 60)}m ${String(elapsedSeconds % 60).padStart(2, "0")}s`;

  async function submitPull(event: React.MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    if (isPulling) return;

    const sourceForm = event.currentTarget.closest("form");
    const formData = new FormData(sourceForm ?? undefined);
    setResult(null);
    setIsPulling(true);

    try {
      const response = await fetch("/api/mojo/session-report/pull", {
        method: "POST",
        headers: { Accept: "application/json" },
        body: formData,
      });
      const payload = await response.json().catch(() => null) as {
        ok?: boolean;
        status?: string;
        pulled?: number;
        saved?: number;
        existing?: number;
        message?: string;
      } | null;

      if (!response.ok || !payload) {
        setResult({
          tone: "error",
          title: "Error",
          message: payload?.message || `Pull failed with HTTP ${response.status}.`,
        });
        return;
      }

      if (payload.status === "ok") {
        setResult({
          tone: "success",
          title: "Done",
          message: payload.message || `Pulled ${payload.pulled ?? 0} session rows and saved ${payload.saved ?? 0}.`,
        });
        return;
      }

      if (payload.status === "empty") {
        setResult({
          tone: "warning",
          title: "Done, but no rows returned",
          message: payload.message || "Mojo returned 0 session rows for this range.",
        });
        return;
      }

      setResult({
        tone: "error",
        title: "Error",
        message: payload.message || "The pull did not complete.",
      });
    } catch (error) {
      setResult({
        tone: "error",
        title: "Error",
        message: error instanceof Error ? error.message : "The pull failed before Hub received a result.",
      });
    } finally {
      setIsPulling(false);
    }
  }

  const resultColor =
    result?.tone === "success" ? "#3fb950" : result?.tone === "warning" ? "#d29922" : "#f85149";

  return (
    <div className="w-full">
      <button
        type="button"
        onClick={submitPull}
        disabled={isPulling}
        className="w-full rounded-md px-3 py-2 text-sm font-semibold"
        style={{ background: isPulling ? "#1f6feb99" : "#1f6feb", color: "#fff" }}
      >
        {isPulling ? "Pulling Mojo..." : "Pull Latest From Mojo"}
      </button>
      {(isPulling || result) && (
        <div className="mt-2 rounded-md border p-3 text-xs" style={{ borderColor: "#30363d", background: "#0d1117", color: "#8b949e" }}>
          <div className="mb-2 flex items-center justify-between gap-3">
            <span style={{ color: result ? resultColor : "#c9d1d9" }}>
              {result ? `${result.title}: ${result.message}` : "Opening Mojo, selecting the date range, then saving sessions to Supabase."}
            </span>
            {isPulling && <span className="shrink-0" style={{ color: "#58a6ff" }}>{elapsedLabel}</span>}
          </div>
          {isPulling && (
            <div className="overflow-hidden rounded-full" style={{ height: 6, background: "#010409", border: "1px solid #30363d" }}>
              <div className="h-full mojo-pull-progress" style={{ background: "#58a6ff" }} />
            </div>
          )}
          {isPulling ? (
            <div className="mt-2">
              Usual time is 60-120 seconds for one day. Larger ranges can take a few minutes. The result will stay here without moving the page.
            </div>
          ) : result?.tone === "success" ? (
            <div className="mt-2">The rows are saved in Supabase. Use Apply or refresh when you want to reload the table.</div>
          ) : null}
          <style jsx>{`
            .mojo-pull-progress {
              width: 35%;
              animation: mojoPull 1.1s ease-in-out infinite;
            }
            @keyframes mojoPull {
              0% { transform: translateX(-120%); }
              55% { transform: translateX(120%); }
              100% { transform: translateX(260%); }
            }
          `}</style>
        </div>
      )}
    </div>
  );
}
