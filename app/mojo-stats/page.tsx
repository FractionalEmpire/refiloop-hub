import AppShell from "@/components/AppShell";
import { getCurrentUser } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

type SearchParams = {
  start?: string;
  end?: string;
  agent?: string;
  disposition?: string;
  asset?: string;
};

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
  agent_name: string;
  target_name: string;
  target_type: string;
  outreach_status: string | null;
  total_call_attempts: number | null;
  follow_up_date: string | null;
};

type SessionSummary = {
  id: string;
  date: string;
  agent: string;
  calls: number;
  connected: number;
  recordings: number;
  talk_seconds: number;
  top_dispositions: string;
};

type MojoRecording = {
  id: number;
  mojo_call_id: string;
  agent_name: string | null;
  contact_name: string | null;
  called_at: string | null;
  disposition: string | null;
  duration: string | null;
  recording_url: string | null;
  transcript: string | null;
  source_url: string | null;
};

const MOJO_SOURCES = ["mojo", "mojo_sheet_push"];
const CONNECTED_DISPOSITIONS = [
  "Interested - Send Info",
  "Callback Requested",
  "Already Refinanced",
  "Too Early - Not Thinking About It",
  "In Process With Another Lender",
  "Converted - Deal Submitted",
  "Contact",
  "DNC Contact",
];

const ASSET_OPTIONS = [
  { value: "all", label: "All rows" },
  { value: "connected", label: "Connected/reviewable" },
  { value: "recordings", label: "Has recording" },
  { value: "transcripts", label: "Has transcript" },
];

async function safe<T>(task: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await task();
  } catch {
    return fallback;
  }
}

function inputDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function defaultStartDate() {
  const date = new Date();
  date.setDate(date.getDate() - 30);
  return inputDate(date);
}

function normalizeFilters(params: SearchParams) {
  const end = params.end || inputDate(new Date());
  return {
    start: params.start || defaultStartDate(),
    end,
    agent: params.agent || "all",
    disposition: params.disposition || "all",
    asset: params.asset || "all",
  };
}

function startIso(value: string) {
  return `${value}T00:00:00.000Z`;
}

function endIso(value: string) {
  return `${value}T23:59:59.999Z`;
}

async function fetchCalls(filters: ReturnType<typeof normalizeFilters>): Promise<CallAttempt[]> {
  const base = "id,owner_id,entity_id,called_at,source,mojo_call_id,disposition,phone_number,notes,recording_url,transcript,call_duration_sec";
  const query = supabase
    .from("call_attempts")
    .select(base)
    .in("source", MOJO_SOURCES)
    .gte("called_at", startIso(filters.start))
    .lte("called_at", endIso(filters.end))
    .order("called_at", { ascending: false })
    .limit(250);

  if (filters.disposition !== "all") query.eq("disposition", filters.disposition);
  if (filters.asset === "recordings") query.not("recording_url", "is", null);
  if (filters.asset === "transcripts") query.not("transcript", "is", null);

  const { data, error } = await query;
  if (!error) return (data ?? []) as CallAttempt[];

  const fallback = supabase
    .from("call_attempts")
    .select("id,owner_id,entity_id,called_at,source,mojo_call_id,disposition,phone_number,notes,recording_url,call_duration_sec")
    .in("source", MOJO_SOURCES)
    .gte("called_at", startIso(filters.start))
    .lte("called_at", endIso(filters.end))
    .order("called_at", { ascending: false })
    .limit(250);

  if (filters.disposition !== "all") fallback.eq("disposition", filters.disposition);
  if (filters.asset === "recordings") fallback.not("recording_url", "is", null);

  const retry = await fallback;
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

async function fetchRecordings(filters: ReturnType<typeof normalizeFilters>): Promise<MojoRecording[]> {
  const query = supabase
    .from("mojo_call_recordings")
    .select("id,mojo_call_id,agent_name,contact_name,called_at,disposition,duration,recording_url,transcript,source_url")
    .gte("called_at", startIso(filters.start))
    .lte("called_at", endIso(filters.end))
    .order("called_at", { ascending: false })
    .limit(200);
  if (filters.disposition !== "all") query.eq("disposition", filters.disposition);
  if (filters.agent !== "all") query.eq("agent_name", filters.agent);
  if (filters.asset === "recordings") query.not("recording_url", "is", null);
  if (filters.asset === "transcripts") query.not("transcript", "is", null);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as MojoRecording[];
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

function fmtDuration(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0m";
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return remainder === 0 ? `${minutes}m` : `${minutes}m ${remainder}s`;
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

function extractAgent(notes: string | null | undefined) {
  const match = (notes ?? "").match(/Agent:\s*([^\n]+)/i);
  return match?.[1]?.trim() || "All Agents";
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
      agent_name: extractAgent(call.notes),
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

function unique(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter(Boolean) as string[])).sort((a, b) => a.localeCompare(b));
}

function buildSessionSummaries(calls: DisplayCall[]): SessionSummary[] {
  const buckets = new Map<string, SessionSummary>();
  for (const call of calls) {
    const dateKey = call.called_at.slice(0, 10);
    const key = `${dateKey}:${call.agent_name}`;
    const existing = buckets.get(key) ?? {
      id: key,
      date: dateKey,
      agent: call.agent_name,
      calls: 0,
      connected: 0,
      recordings: 0,
      talk_seconds: 0,
      top_dispositions: "",
    };
    existing.calls += 1;
    if (isConnectedCall(call)) existing.connected += 1;
    if (call.recording_url) existing.recordings += 1;
    existing.talk_seconds += Number(call.call_duration_sec ?? 0);
    const dispositions = existing.top_dispositions ? existing.top_dispositions.split(", ") : [];
    if (call.disposition && !dispositions.includes(call.disposition)) dispositions.push(call.disposition);
    existing.top_dispositions = dispositions.slice(0, 3).join(", ");
    buckets.set(key, existing);
  }
  return Array.from(buckets.values()).sort((a, b) => (a.date === b.date ? a.agent.localeCompare(b.agent) : b.date.localeCompare(a.date)));
}

export default async function MojoStatsPage({ searchParams = {} }: { searchParams?: SearchParams }) {
  const user = getCurrentUser();
  if (!user) redirect("/login");

  const filters = normalizeFilters(searchParams);

  const [syncBatches, rawCalls, recordings] = await Promise.all([
    safe(fetchSyncBatches, []),
    safe(() => fetchCalls(filters), []),
    safe(() => fetchRecordings(filters), []),
  ]);

  const ownerIds = Array.from(new Set(rawCalls.map((call) => call.owner_id).filter(Boolean))) as number[];
  const entityIds = Array.from(new Set(rawCalls.map((call) => call.entity_id).filter(Boolean))) as number[];
  const [owners, entities] = await Promise.all([
    safe(() => fetchTargets("owners", ownerIds), new Map<number, Target>()),
    safe(() => fetchTargets("entities", entityIds), new Map<number, Target>()),
  ]);

  const allCalls = buildDisplayCalls(rawCalls, owners, entities);
  const calls = allCalls.filter((call) => {
    if (filters.agent !== "all" && call.agent_name !== filters.agent) return false;
    if (filters.asset === "connected" && !isConnectedCall(call)) return false;
    return true;
  });
  const sessions = buildSessionSummaries(calls);
  const agentOptions = unique([
    ...allCalls.map((call) => call.agent_name).filter((agent) => agent !== "All Agents"),
    ...sessions.map((session) => session.agent).filter((agent) => agent !== "All Agents"),
    ...recordings.map((recording) => recording.agent_name || "All Agents").filter((agent) => agent !== "All Agents"),
  ]);
  const dispositionOptions = unique([
    ...allCalls.map((call) => call.disposition),
    ...recordings.map((recording) => recording.disposition),
  ]);
  const connectedCalls = calls.filter(isConnectedCall);
  const transcriptCount = calls.filter((call) => call.transcript).length + recordings.filter((recording) => recording.transcript).length;
  const recordingCount = calls.filter((call) => call.recording_url).length + recordings.filter((recording) => recording.recording_url).length;
  const recordingReviewItems = recordings.filter((recording) => recording.recording_url).slice(0, 20);
  const latestSync = syncBatches[0]?.synced_at ?? null;

  return (
    <AppShell user={user}>
      <div className="p-8 max-w-7xl">
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold" style={{ color: "#e6edf3" }}>Mojo Stats</h1>
            <p className="mt-1 text-sm" style={{ color: "#8b949e" }}>
              Session results, call outcomes, and recording review from Supabase.
            </p>
          </div>
        </div>

        <div className="mb-6 rounded-lg border px-4 py-3 text-sm" style={{ background: "#10243a", borderColor: "#1f6feb", color: "#c9d1d9" }}>
          <span className="font-semibold" style={{ color: "#58a6ff" }}>Data source:</span> Supabase (Mojo session + recording sync).{" "}
          <span className="font-semibold" style={{ color: "#58a6ff" }}>Auto-sync:</span> VPS cron every 30 minutes.{" "}
          <span className="font-semibold" style={{ color: "#58a6ff" }}>Last sync:</span> {latestSync ? fmtDateTime(latestSync) : "No sync logged yet"}.{" "}
          <span className="font-semibold" style={{ color: "#58a6ff" }}>Loaded range:</span> {filters.start} to {filters.end}.
        </div>

        <form className="mb-6 grid grid-cols-6 gap-3 rounded-lg border p-4" style={{ background: "#161b22", borderColor: "#30363d" }}>
          <label className="text-xs" style={{ color: "#8b949e" }}>
            Start
            <input name="start" type="date" defaultValue={filters.start} className="mt-1 w-full rounded-md px-3 py-2 text-sm outline-none" style={{ background: "#0d1117", color: "#e6edf3", border: "1px solid #30363d" }} />
          </label>
          <label className="text-xs" style={{ color: "#8b949e" }}>
            End
            <input name="end" type="date" defaultValue={filters.end} className="mt-1 w-full rounded-md px-3 py-2 text-sm outline-none" style={{ background: "#0d1117", color: "#e6edf3", border: "1px solid #30363d" }} />
          </label>
          <label className="text-xs" style={{ color: "#8b949e" }}>
            Agent
            <select name="agent" defaultValue={filters.agent} className="mt-1 w-full rounded-md px-3 py-2 text-sm outline-none" style={{ background: "#0d1117", color: "#e6edf3", border: "1px solid #30363d" }}>
              <option value="all">All Agents</option>
              {agentOptions.map((agent) => <option key={agent} value={agent}>{agent}</option>)}
            </select>
          </label>
          <label className="text-xs" style={{ color: "#8b949e" }}>
            Disposition
            <select name="disposition" defaultValue={filters.disposition} className="mt-1 w-full rounded-md px-3 py-2 text-sm outline-none" style={{ background: "#0d1117", color: "#e6edf3", border: "1px solid #30363d" }}>
              <option value="all">All Results</option>
              {dispositionOptions.map((disposition) => <option key={disposition} value={disposition}>{formatDisposition(disposition)}</option>)}
            </select>
          </label>
          <label className="text-xs" style={{ color: "#8b949e" }}>
            View
            <select name="asset" defaultValue={filters.asset} className="mt-1 w-full rounded-md px-3 py-2 text-sm outline-none" style={{ background: "#0d1117", color: "#e6edf3", border: "1px solid #30363d" }}>
              {ASSET_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <div className="flex items-end gap-2">
            <button className="w-full rounded-md px-3 py-2 text-sm font-semibold" style={{ background: "#238636", color: "#fff" }}>Apply</button>
            <a href="/mojo-stats" className="rounded-md px-3 py-2 text-sm font-semibold" style={{ background: "#21262d", color: "#8b949e", border: "1px solid #30363d" }}>Reset</a>
          </div>
        </form>

        <div className="mb-6 grid grid-cols-4 gap-4">
          {[
            { label: "Mojo outcomes", value: calls.length, color: "#58a6ff" },
            { label: "Session rows", value: sessions.length, color: "#3fb950" },
            { label: "Recordings", value: recordingCount, color: "#d29922" },
            { label: "Transcripts", value: transcriptCount, color: "#a371f7" },
          ].map((metric) => (
            <section key={metric.label} className="rounded-lg border p-4" style={{ background: "#161b22", borderColor: "#30363d" }}>
              <div className="text-2xl font-bold" style={{ color: metric.color }}>{fmtCount(metric.value)}</div>
              <div className="mt-1 text-xs" style={{ color: "#8b949e" }}>{metric.label}</div>
            </section>
          ))}
        </div>

        <section className="mb-6 rounded-lg border" style={{ background: "#161b22", borderColor: "#30363d" }}>
          <div className="border-b px-5 py-4" style={{ borderColor: "#30363d" }}>
            <h2 className="text-sm font-semibold" style={{ color: "#e6edf3" }}>Latest Sync Logs (Last 5)</h2>
            <p className="mt-1 text-xs" style={{ color: "#8b949e" }}>Most recent Mojo-to-Supabase sync runs.</p>
          </div>
          <div className="divide-y" style={{ borderColor: "#21262d" }}>
            {syncBatches.length === 0 ? (
              <div className="px-5 py-6 text-sm" style={{ color: "#484f58" }}>No sync logs yet.</div>
            ) : (
              syncBatches.slice(0, 5).map((batch) => (
                <div key={batch.id} className="px-5 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs font-semibold" style={{ color: statusColor(batch.success) }}>{batch.success ? "Success" : "Failed"}</span>
                    <span className="text-xs" style={{ color: "#8b949e" }}>{fmtDateTime(batch.synced_at)}</span>
                  </div>
                  <div className="mt-1 text-xs" style={{ color: "#c9d1d9" }}>{fmtCount(batch.records_pushed)} rows pushed, {fmtCount(batch.bd_ids_created)} inserted</div>
                  <div className="mt-1 text-xs" style={{ color: "#484f58" }}>{batch.message ?? "No message"}</div>
                </div>
              ))
            )}
          </div>
        </section>

        <div className="grid gap-6 xl:grid-cols-[1fr_0.9fr]">
          <section className="rounded-lg border" style={{ background: "#161b22", borderColor: "#30363d" }}>
            <div className="border-b px-5 py-4" style={{ borderColor: "#30363d" }}>
              <h2 className="text-sm font-semibold" style={{ color: "#e6edf3" }}>Session Results</h2>
              <p className="mt-1 text-xs" style={{ color: "#8b949e" }}>Supabase-derived daily summaries from Mojo call attempts.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr style={{ color: "#8b949e", borderBottom: "1px solid #30363d" }}>
                    {["Date", "Agent", "Calls", "Connected", "Recordings", "Talk", "Notes"].map((header) => (
                      <th key={header} className="px-4 py-3 text-left text-xs font-medium">{header}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sessions.length === 0 ? (
                    <tr><td className="px-4 py-6 text-sm" style={{ color: "#484f58" }} colSpan={7}>No session summaries for this filter yet.</td></tr>
                  ) : sessions.slice(0, 20).map((row) => (
                    <tr key={row.id} style={{ borderBottom: "1px solid #21262d" }}>
                      <td className="px-4 py-3 text-xs" style={{ color: "#8b949e" }}>{fmtDate(row.date)}</td>
                      <td className="px-4 py-3 text-xs" style={{ color: "#e6edf3" }}>{row.agent}</td>
                      <td className="px-4 py-3 text-xs" style={{ color: "#c9d1d9" }}>{row.calls}</td>
                      <td className="px-4 py-3 text-xs" style={{ color: "#c9d1d9" }}>{row.connected}</td>
                      <td className="px-4 py-3 text-xs" style={{ color: "#c9d1d9" }}>{row.recordings}</td>
                      <td className="px-4 py-3 text-xs" style={{ color: "#8b949e" }}>{fmtDuration(row.talk_seconds)}</td>
                      <td className="px-4 py-3 text-xs" style={{ color: "#8b949e" }}>{row.top_dispositions || "None"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-lg border" style={{ background: "#161b22", borderColor: "#30363d" }}>
            <div className="border-b px-5 py-4" style={{ borderColor: "#30363d" }}>
              <h2 className="text-sm font-semibold" style={{ color: "#e6edf3" }}>Call Recording Review</h2>
              <p className="mt-1 text-xs" style={{ color: "#8b949e" }}>Audio URLs from Supabase; transcripts are pending.</p>
            </div>
            <div className="divide-y" style={{ borderColor: "#21262d" }}>
              {recordingReviewItems.length === 0 ? (
                <div className="px-5 py-6 text-sm" style={{ color: "#484f58" }}>No recording rows for this filter yet.</div>
              ) : (
                recordingReviewItems.map((item) => {
                  const href = item.recording_url;
                  return (
                    <article key={item.mojo_call_id} className="px-5 py-4">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <div className="text-sm font-medium" style={{ color: "#e6edf3" }}>{item.contact_name || "Unknown Contact"}</div>
                          <div className="mt-1 text-xs" style={{ color: "#8b949e" }}>
                            {fmtDateTime(item.called_at)} | {item.agent_name || "All Agents"} | {formatDisposition(item.disposition)} | {item.duration || "0m"}
                          </div>
                        </div>
                        {href ? <a href={href} target="_blank" rel="noreferrer" className="text-xs" style={{ color: "#58a6ff" }}>Open audio</a> : <span className="text-xs" style={{ color: "#484f58" }}>No audio</span>}
                      </div>
                      <div className="mt-3 rounded-md p-3 text-xs" style={{ background: "#0d1117", color: "#8b949e", border: "1px solid #30363d" }}>
                        {item.transcript || "Transcript not available in Supabase yet."}
                      </div>
                    </article>
                  );
                })
              )}
            </div>
          </section>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[0.75fr_1.25fr]">
          <section className="rounded-lg border" style={{ background: "#161b22", borderColor: "#30363d" }}>
            <div className="border-b px-5 py-4" style={{ borderColor: "#30363d" }}>
              <h2 className="text-sm font-semibold" style={{ color: "#e6edf3" }}>Reverse Sync Batches</h2>
            </div>
            <div className="divide-y" style={{ borderColor: "#21262d" }}>
              {syncBatches.length === 0 ? (
                <div className="px-5 py-6 text-sm" style={{ color: "#484f58" }}>No Mojo reverse sync batches yet.</div>
              ) : syncBatches.map((batch) => (
                <div key={batch.id} className="px-5 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs font-semibold" style={{ color: statusColor(batch.success) }}>{batch.success ? "Success" : "Failed"}</span>
                    <span className="text-xs" style={{ color: "#8b949e" }}>{fmtDateTime(batch.synced_at)}</span>
                  </div>
                  <div className="mt-1 text-xs" style={{ color: "#c9d1d9" }}>{fmtCount(batch.records_pushed)} rows pushed, {fmtCount(batch.bd_ids_created)} inserted</div>
                  <div className="mt-1 text-xs" style={{ color: "#484f58" }}>{batch.message ?? "No message"}</div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-lg border" style={{ background: "#161b22", borderColor: "#30363d" }}>
            <div className="border-b px-5 py-4" style={{ borderColor: "#30363d" }}>
              <h2 className="text-sm font-semibold" style={{ color: "#e6edf3" }}>Mojo Call Outcomes</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr style={{ color: "#8b949e", borderBottom: "1px solid #30363d" }}>
                    {["When", "Agent", "Target", "Disposition", "Follow-up", "Attempts"].map((header) => (
                      <th key={header} className="px-4 py-3 text-left text-xs font-medium">{header}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {calls.length === 0 ? (
                    <tr><td className="px-4 py-6 text-sm" style={{ color: "#484f58" }} colSpan={6}>No Mojo call rows for this filter.</td></tr>
                  ) : calls.slice(0, 40).map((call) => (
                    <tr key={call.id} style={{ borderBottom: "1px solid #21262d" }}>
                      <td className="px-4 py-3 text-xs" style={{ color: "#8b949e" }}>{fmtDateTime(call.called_at)}</td>
                      <td className="px-4 py-3 text-xs" style={{ color: "#8b949e" }}>{call.agent_name}</td>
                      <td className="px-4 py-3">
                        <div className="text-xs font-medium" style={{ color: "#e6edf3" }}>{call.target_name}</div>
                        <div className="text-xs" style={{ color: "#484f58" }}>{call.phone_number ?? "Unknown phone"}</div>
                      </td>
                      <td className="px-4 py-3 text-xs" style={{ color: "#c9d1d9" }}>{formatDisposition(call.disposition)}</td>
                      <td className="px-4 py-3 text-xs" style={{ color: "#8b949e" }}>{fmtDate(call.follow_up_date)}</td>
                      <td className="px-4 py-3 text-xs" style={{ color: "#8b949e" }}>{fmtCount(call.total_call_attempts)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>
    </AppShell>
  );
}
