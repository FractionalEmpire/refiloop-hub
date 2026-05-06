import AppShell from "@/components/AppShell";
import { getCurrentUser } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

type SyncBatch = {
  id: number;
  synced_at: string;
  success: boolean;
  records_pushed: number | null;
  bd_ids_created: number | null;
  message: string | null;
};

type CallAttempt = {
  id: number;
  owner_id: number | null;
  entity_id: number | null;
  called_at: string;
  source: string | null;
  mojo_call_id: string | null;
  disposition: string | null;
  phone_number: string | null;
  notes: string | null;
  recording_url?: string | null;
  transcript?: string | null;
  call_duration_sec?: number | null;
};

type Target = {
  id: number;
  name: string | null;
  outreach_status: string | null;
  total_call_attempts: number | null;
  last_disposition: string | null;
  call_later_until?: string | null;
  next_eligible_date?: string | null;
  next_call_date?: string | null;
  parked_until?: string | null;
};

type DisplayCall = CallAttempt & {
  target_name: string;
  target_type: string;
  outreach_status: string | null;
  total_call_attempts: number | null;
  follow_up_date: string | null;
};

const MOJO_SOURCES = ["mojo", "mojo_sheet_push"];
const CONNECTED_DISPOSITIONS = [
  "Interested - Send Info",
  "Callback Requested",
  "Already Refinanced",
  "Too Early - Not Thinking About It",
  "In Process With Another Lender",
  "Converted - Deal Submitted",
];

async function safe<T>(task: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await task();
  } catch {
    return fallback;
  }
}

async function countCalls(fromIso: string): Promise<number> {
  const { count, error } = await supabase
    .from("call_attempts")
    .select("id", { count: "exact", head: true })
    .in("source", MOJO_SOURCES)
    .gte("called_at", fromIso);
  if (error) throw error;
  return count ?? 0;
}

async function countSyncs(fromIso: string): Promise<number> {
  const { count, error } = await supabase
    .from("sync_log")
    .select("id", { count: "exact", head: true })
    .eq("direction", "mojo_to_supabase")
    .gte("synced_at", fromIso);
  if (error) throw error;
  return count ?? 0;
}

async function fetchRecentCalls(): Promise<CallAttempt[]> {
  const base = "id,owner_id,entity_id,called_at,source,mojo_call_id,disposition,phone_number,notes,recording_url,transcript,call_duration_sec";
  const { data, error } = await supabase
    .from("call_attempts")
    .select(base)
    .in("source", MOJO_SOURCES)
    .order("called_at", { ascending: false })
    .limit(40);

  if (!error) return (data ?? []) as CallAttempt[];

  const fallback = "id,owner_id,entity_id,called_at,source,mojo_call_id,disposition,phone_number,notes,recording_url,call_duration_sec";
  const retry = await supabase
    .from("call_attempts")
    .select(fallback)
    .in("source", MOJO_SOURCES)
    .order("called_at", { ascending: false })
    .limit(40);
  if (retry.error) throw retry.error;
  return (retry.data ?? []) as CallAttempt[];
}

async function fetchSyncBatches(): Promise<SyncBatch[]> {
  const { data, error } = await supabase
    .from("sync_log")
    .select("id,synced_at,success,records_pushed,bd_ids_created,message")
    .eq("direction", "mojo_to_supabase")
    .order("synced_at", { ascending: false })
    .limit(10);
  if (error) throw error;
  return (data ?? []) as SyncBatch[];
}

async function fetchTargets(table: "owners" | "entities", ids: number[]): Promise<Map<number, Target>> {
  if (ids.length === 0) return new Map();
  const ownerFields = "id,name,outreach_status,total_call_attempts,last_disposition,call_later_until,next_eligible_date,parked_until";
  const entityFields = "id,name,outreach_status,total_call_attempts,last_disposition,next_call_date,parked_until";
  const { data, error } = await supabase
    .from(table)
    .select(table === "owners" ? ownerFields : entityFields)
    .in("id", ids);
  if (error) throw error;
  return new Map(((data ?? []) as unknown as Target[]).map((row) => [row.id, row]));
}

function startOfTodayIso() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date.toISOString();
}

function sevenDaysAgoIso() {
  const date = new Date();
  date.setDate(date.getDate() - 7);
  return date.toISOString();
}

function fmtCount(value: number | string | null | undefined) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n.toLocaleString() : "0";
}

function fmtDateTime(value: string | null | undefined) {
  if (!value) return "Unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function fmtDate(value: string | null | undefined) {
  if (!value) return "None";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "None";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(date);
}

function formatDisposition(value: string | null | undefined) {
  if (!value) return "Unknown";
  if (value === "Pushed to BD") return "Legacy BatchDialer push";
  if (value === "queued_mojo_sheet") return "Queued to Mojo";
  return value;
}

function statusColor(success: boolean) {
  return success ? "#3fb950" : "#f85149";
}

function isConnectedCall(call: DisplayCall) {
  const disposition = call.disposition ?? "";
  return Boolean(call.recording_url || call.transcript) || CONNECTED_DISPOSITIONS.includes(disposition);
}

function buildDisplayCalls(calls: CallAttempt[], owners: Map<number, Target>, entities: Map<number, Target>): DisplayCall[] {
  return calls.map((call) => {
    const owner = call.owner_id ? owners.get(call.owner_id) : null;
    const entity = call.entity_id ? entities.get(call.entity_id) : null;
    const target = owner ?? entity ?? null;
    return {
      ...call,
      target_name: target?.name ?? "Unknown",
      target_type: owner ? "owner" : entity ? "entity" : "unknown",
      outreach_status: target?.outreach_status ?? null,
      total_call_attempts: target?.total_call_attempts ?? null,
      follow_up_date:
        owner?.call_later_until ??
        owner?.next_eligible_date ??
        owner?.parked_until ??
        entity?.next_call_date ??
        entity?.parked_until ??
        null,
    };
  });
}

export default async function MojoStatsPage() {
  const user = getCurrentUser();
  if (!user) redirect("/login");

  const [callsToday, calls7d, syncsToday, syncBatches, rawCalls] = await Promise.all([
    safe(() => countCalls(startOfTodayIso()), 0),
    safe(() => countCalls(sevenDaysAgoIso()), 0),
    safe(() => countSyncs(startOfTodayIso()), 0),
    safe(fetchSyncBatches, []),
    safe(fetchRecentCalls, []),
  ]);

  const ownerIds = Array.from(new Set(rawCalls.map((call) => call.owner_id).filter(Boolean))) as number[];
  const entityIds = Array.from(new Set(rawCalls.map((call) => call.entity_id).filter(Boolean))) as number[];
  const [owners, entities] = await Promise.all([
    safe(() => fetchTargets("owners", ownerIds), new Map<number, Target>()),
    safe(() => fetchTargets("entities", entityIds), new Map<number, Target>()),
  ]);

  const calls = buildDisplayCalls(rawCalls, owners, entities);
  const connectedCalls = calls.filter(isConnectedCall).slice(0, 12);

  return (
    <AppShell user={user}>
      <div className="p-8 max-w-7xl">
        <div className="mb-8 flex items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold" style={{ color: "#e6edf3" }}>Mojo Stats</h1>
            <p className="mt-1 text-sm" style={{ color: "#8b949e" }}>
              Mojo results, reverse sync batches, and connected-call review for David.
            </p>
          </div>
          <a
            href="https://app991.mojosells.com/reports/session-report/"
            target="_blank"
            rel="noreferrer"
            className="rounded-md px-3 py-2 text-xs font-semibold"
            style={{ background: "#21262d", color: "#58a6ff", border: "1px solid #30363d" }}
          >
            Mojo session report
          </a>
        </div>

        <div className="grid grid-cols-4 gap-4 mb-6">
          {[
            { label: "Calls Today", value: callsToday, color: "#58a6ff" },
            { label: "Calls 7d", value: calls7d, color: "#3fb950" },
            { label: "Syncs Today", value: syncsToday, color: "#d29922" },
            { label: "Connected Reviews", value: connectedCalls.length, color: "#a371f7" },
          ].map((metric) => (
            <section key={metric.label} className="rounded-xl border p-4" style={{ background: "#161b22", borderColor: "#30363d" }}>
              <div className="text-2xl font-bold" style={{ color: metric.color }}>{fmtCount(metric.value)}</div>
              <div className="mt-1 text-xs" style={{ color: "#8b949e" }}>{metric.label}</div>
            </section>
          ))}
        </div>

        <section className="mb-6 rounded-xl border" style={{ background: "#161b22", borderColor: "#30363d" }}>
          <div className="border-b px-5 py-4" style={{ borderColor: "#30363d" }}>
            <h2 className="text-sm font-semibold" style={{ color: "#e6edf3" }}>Connected Call Review</h2>
            <p className="mt-1 text-xs" style={{ color: "#8b949e" }}>
              Connected or reviewable calls with recordings, transcripts, or meaningful dispositions.
            </p>
          </div>
          <div className="divide-y" style={{ borderColor: "#21262d" }}>
            {connectedCalls.length === 0 ? (
              <div className="px-5 py-6 text-sm" style={{ color: "#484f58" }}>
                No connected-call recordings or transcripts are available in Supabase yet.
              </div>
            ) : (
              connectedCalls.map((call) => (
                <article key={call.id} className="px-5 py-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-sm font-medium" style={{ color: "#e6edf3" }}>{call.target_name}</div>
                      <div className="mt-1 text-xs" style={{ color: "#8b949e" }}>
                        {fmtDateTime(call.called_at)} | {call.target_type} | {formatDisposition(call.disposition)}
                      </div>
                    </div>
                    {call.recording_url ? (
                      <a href={call.recording_url} target="_blank" rel="noreferrer" className="text-xs" style={{ color: "#58a6ff" }}>
                        Open recording
                      </a>
                    ) : (
                      <span className="text-xs" style={{ color: "#484f58" }}>No recording</span>
                    )}
                  </div>
                  <div className="mt-3 rounded-md p-3 text-xs leading-relaxed" style={{ background: "#0d1117", color: "#c9d1d9", border: "1px solid #30363d" }}>
                    {call.transcript || call.notes || "No transcript text captured yet."}
                  </div>
                </article>
              ))
            )}
          </div>
        </section>

        <div className="grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
          <section className="rounded-xl border" style={{ background: "#161b22", borderColor: "#30363d" }}>
            <div className="border-b px-5 py-4" style={{ borderColor: "#30363d" }}>
              <h2 className="text-sm font-semibold" style={{ color: "#e6edf3" }}>Reverse Sync Batches</h2>
            </div>
            <div className="divide-y" style={{ borderColor: "#21262d" }}>
              {syncBatches.length === 0 ? (
                <div className="px-5 py-6 text-sm" style={{ color: "#484f58" }}>No Mojo reverse sync batches yet.</div>
              ) : (
                syncBatches.map((batch) => (
                  <div key={batch.id} className="px-5 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs font-semibold" style={{ color: statusColor(batch.success) }}>
                        {batch.success ? "Success" : "Failed"}
                      </span>
                      <span className="text-xs" style={{ color: "#8b949e" }}>{fmtDateTime(batch.synced_at)}</span>
                    </div>
                    <div className="mt-1 text-xs" style={{ color: "#c9d1d9" }}>
                      {fmtCount(batch.records_pushed)} rows pushed, {fmtCount(batch.bd_ids_created)} inserted
                    </div>
                    <div className="mt-1 text-xs" style={{ color: "#484f58" }}>{batch.message ?? "No message"}</div>
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="rounded-xl border" style={{ background: "#161b22", borderColor: "#30363d" }}>
            <div className="border-b px-5 py-4" style={{ borderColor: "#30363d" }}>
              <h2 className="text-sm font-semibold" style={{ color: "#e6edf3" }}>Recent Mojo Outcomes</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr style={{ color: "#8b949e", borderBottom: "1px solid #30363d" }}>
                    <th className="px-4 py-3 text-left text-xs font-medium">When</th>
                    <th className="px-4 py-3 text-left text-xs font-medium">Target</th>
                    <th className="px-4 py-3 text-left text-xs font-medium">Disposition</th>
                    <th className="px-4 py-3 text-left text-xs font-medium">Follow-up</th>
                    <th className="px-4 py-3 text-left text-xs font-medium">Attempts</th>
                  </tr>
                </thead>
                <tbody>
                  {calls.length === 0 ? (
                    <tr>
                      <td className="px-4 py-6 text-sm" style={{ color: "#484f58" }} colSpan={5}>
                        No Mojo call rows yet.
                      </td>
                    </tr>
                  ) : (
                    calls.slice(0, 16).map((call) => (
                      <tr key={call.id} style={{ borderBottom: "1px solid #21262d" }}>
                        <td className="px-4 py-3 text-xs" style={{ color: "#8b949e" }}>{fmtDateTime(call.called_at)}</td>
                        <td className="px-4 py-3">
                          <div className="text-xs font-medium" style={{ color: "#e6edf3" }}>{call.target_name}</div>
                          <div className="text-xs" style={{ color: "#484f58" }}>{call.phone_number ?? "Unknown phone"}</div>
                        </td>
                        <td className="px-4 py-3 text-xs" style={{ color: "#c9d1d9" }}>{formatDisposition(call.disposition)}</td>
                        <td className="px-4 py-3 text-xs" style={{ color: "#8b949e" }}>{fmtDate(call.follow_up_date)}</td>
                        <td className="px-4 py-3 text-xs" style={{ color: "#8b949e" }}>{fmtCount(call.total_call_attempts)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>
    </AppShell>
  );
}
