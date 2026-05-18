"use client";

import { useMemo, useState } from "react";

export type SessionResultRow = {
  result: string;
  calls: number;
  talk_seconds: number;
  dial_seconds: number | null;
};

export type SessionSummary = {
  id: string;
  date: string;
  agent: string;
  type: string;
  list_name: string;
  calls: number;
  appointments: number;
  leads: number;
  dial_seconds: number | null;
  recordings: number;
  talk_seconds: number;
  pause_seconds: number | null;
  start_at: string | null;
  end_at: string | null;
  result_rows: SessionResultRow[];
};

function fmtMojoDate(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
  }).format(date);
}

function fmtClock(value: string | null | undefined) {
  if (!value) return "-";
  if (/^\d{1,2}:\d{2}\s?(AM|PM)$/i.test(value.trim()) || value.trim() === "-") return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function fmtHms(seconds: number | null | undefined) {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return "-";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

function sumNullable(values: Array<number | null | undefined>) {
  const present = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (present.length === 0) return null;
  return present.reduce((sum, value) => sum + value, 0);
}

export default function SessionResultsTable({ sessions }: { sessions: SessionSummary[] }) {
  const initialOpen = useMemo(() => new Set(sessions.slice(0, 1).map((session) => session.id)), [sessions]);
  const [openRows, setOpenRows] = useState<Set<string>>(initialOpen);
  const totals = {
    calls: sessions.reduce((sum, session) => sum + session.calls, 0),
    appointments: sessions.reduce((sum, session) => sum + session.appointments, 0),
    leads: sessions.reduce((sum, session) => sum + session.leads, 0),
    dialSeconds: sumNullable(sessions.map((session) => session.dial_seconds)),
    talkSeconds: sumNullable(sessions.map((session) => session.talk_seconds)),
    pauseSeconds: sumNullable(sessions.map((session) => session.pause_seconds)),
    agent: new Set(sessions.map((session) => session.agent).filter(Boolean)).size === 1 ? sessions[0]?.agent : "All Agents",
  };

  function toggle(id: string) {
    setOpenRows((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr style={{ color: "#8b949e", borderBottom: "1px solid #30363d" }}>
            {["", "Date", "Agent", "Type", "Gr / List", "Calls", "Appts", "Leads", "Dial Time", "Talk Time", "Pause Dur", "Start", "End"].map((header) => (
              <th key={header} className="px-4 py-3 text-left text-xs font-medium">{header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sessions.length === 0 ? (
            <tr><td className="px-4 py-6 text-sm" style={{ color: "#484f58" }} colSpan={13}>No session summaries for this filter yet.</td></tr>
          ) : (
            <>
              {sessions.slice(0, 20).flatMap((row) => {
                const isOpen = openRows.has(row.id);
                return [
                  <tr key={`${row.id}:summary`} style={{ borderBottom: "1px solid #21262d" }}>
                <td className="px-4 py-3 text-xs">
                  <button
                    type="button"
                    onClick={() => toggle(row.id)}
                    className="h-6 w-6 rounded text-xs font-semibold"
                    style={{ background: "#0d1117", color: "#58a6ff", border: "1px solid #30363d" }}
                    aria-label={isOpen ? "Collapse session row" : "Expand session row"}
                  >
                    {isOpen ? "v" : ">"}
                  </button>
                </td>
                <td className="px-4 py-3 text-xs" style={{ color: "#8b949e" }}>{fmtMojoDate(row.date)}</td>
                <td className="px-4 py-3 text-xs" style={{ color: "#e6edf3" }}>{row.agent}</td>
                <td className="px-4 py-3 text-xs" style={{ color: "#c9d1d9" }}>{row.type}</td>
                <td className="px-4 py-3 text-xs" style={{ color: "#c9d1d9" }}>{row.list_name}</td>
                <td className="px-4 py-3 text-xs" style={{ color: "#c9d1d9" }}>{row.calls}</td>
                <td className="px-4 py-3 text-xs" style={{ color: "#c9d1d9" }}>{row.appointments}</td>
                <td className="px-4 py-3 text-xs" style={{ color: "#c9d1d9" }}>{row.leads}</td>
                <td className="px-4 py-3 text-xs" style={{ color: "#8b949e" }}>{fmtHms(row.dial_seconds)}</td>
                <td className="px-4 py-3 text-xs" style={{ color: "#8b949e" }}>{fmtHms(row.talk_seconds)}</td>
                <td className="px-4 py-3 text-xs" style={{ color: "#8b949e" }}>{fmtHms(row.pause_seconds)}</td>
                <td className="px-4 py-3 text-xs" style={{ color: "#8b949e" }}>{fmtClock(row.start_at)}</td>
                <td className="px-4 py-3 text-xs" style={{ color: "#8b949e" }}>{fmtClock(row.end_at)}</td>
              </tr>,
              isOpen ? (
                <tr key={`${row.id}:details`} style={{ background: "#0d1117", borderBottom: "1px solid #21262d" }}>
                  <td className="px-4 py-4" />
                  <td className="px-4 py-4" colSpan={12}>
                    <div className="mb-3 text-xs font-semibold" style={{ color: "#c9d1d9" }}>
                      Group/List Dialed: {row.list_name}
                    </div>
                    <table className="w-full max-w-xl text-xs">
                      <thead>
                        <tr style={{ color: "#8b949e", borderBottom: "1px solid #30363d" }}>
                          <th className="py-2 pr-4 text-left font-medium">Result</th>
                          <th className="py-2 pr-4 text-left font-medium">Total Calls</th>
                          <th className="py-2 pr-4 text-left font-medium">Talk Time</th>
                          <th className="py-2 pr-4 text-left font-medium">Dial Time</th>
                        </tr>
                      </thead>
                      <tbody>
                        {row.result_rows.map((result) => (
                          <tr key={`${row.id}:${result.result}`} style={{ color: "#58a6ff" }}>
                            <td className="py-2 pr-4">{result.result}</td>
                            <td className="py-2 pr-4">{result.calls}</td>
                            <td className="py-2 pr-4">{fmtHms(result.talk_seconds)}</td>
                            <td className="py-2 pr-4">{fmtHms(result.dial_seconds)}</td>
                          </tr>
                        ))}
                        <tr style={{ background: "#161b22", color: "#58a6ff" }}>
                          <td className="py-2 pr-4 font-semibold">TOTAL</td>
                          <td className="py-2 pr-4">{row.calls}</td>
                          <td className="py-2 pr-4">{fmtHms(row.talk_seconds)}</td>
                          <td className="py-2 pr-4">{fmtHms(row.dial_seconds)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </td>
                </tr>
              ) : null,
                ];
              })}
              <tr style={{ background: "#0d1117", borderTop: "1px solid #30363d" }}>
                <td className="px-4 py-3 text-xs" />
                <td className="px-4 py-3 text-xs font-semibold" style={{ color: "#e6edf3" }}>Total</td>
                <td className="px-4 py-3 text-xs" style={{ color: "#e6edf3" }}>{totals.agent}</td>
                <td className="px-4 py-3 text-xs" style={{ color: "#8b949e" }}>-</td>
                <td className="px-4 py-3 text-xs" style={{ color: "#8b949e" }}>-</td>
                <td className="px-4 py-3 text-xs font-semibold" style={{ color: "#e6edf3" }}>{totals.calls}</td>
                <td className="px-4 py-3 text-xs" style={{ color: "#c9d1d9" }}>{totals.appointments}</td>
                <td className="px-4 py-3 text-xs" style={{ color: "#c9d1d9" }}>{totals.leads}</td>
                <td className="px-4 py-3 text-xs" style={{ color: "#8b949e" }}>{fmtHms(totals.dialSeconds)}</td>
                <td className="px-4 py-3 text-xs" style={{ color: "#8b949e" }}>{fmtHms(totals.talkSeconds)}</td>
                <td className="px-4 py-3 text-xs" style={{ color: "#8b949e" }}>{fmtHms(totals.pauseSeconds)}</td>
                <td className="px-4 py-3 text-xs" style={{ color: "#8b949e" }}>-</td>
                <td className="px-4 py-3 text-xs" style={{ color: "#8b949e" }}>-</td>
              </tr>
            </>
          )}
        </tbody>
      </table>
    </div>
  );
}
