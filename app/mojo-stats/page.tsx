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
  page?: string;
};

type SyncBatch = {
  id: number;
  synced_at: string;
  success: boolean;
  records_pushed: number | null;
  bd_ids_created: number | null;
  message: string | null;
};

type MojoPushHistoryItem = {
  id: number;
  owner_id: number;
  pushed_at: string;
  list_name: string | null;
  source: string | null;
  batch_id: string | null;
  selected_rows: number | null;
  imported_rows: number | null;
  push_status: string | null;
  error: string | null;
  display_name: string | null;
  row_status: string | null;
  reason: string | null;
  phone_count: number | null;
  email_count: number | null;
  loan_amount: string | null;
  maturity_date: string | null;
};

type MojoPushBatch = {
  key: string;
  pushed_at: string;
  list_name: string | null;
  batch_id: string | null;
  status: string;
  selected_rows: number;
  sent_rows: number;
  imported_rows: number;
  duplicate_rows: number;
  visible_rows: number;
  skipped_rows: number;
  failed_rows: number;
  names: string[];
  note: string;
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
  recording_id: number | null;
  recording_contact_name: string | null;
  recording_source_url: string | null;
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

type ChartRow = {
  label: string;
  value: number;
  color: string;
  note?: string;
};

const MOJO_SOURCES = ["mojo", "mojo_sheet_push", "batch_dialer_push"];
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
  date.setDate(1);
  date.setMonth(date.getMonth() - 1);
  return inputDate(date);
}

async function fetchLatestCallDate() {
  const [latestCall, latestRecording] = await Promise.all([
    supabase
      .from("call_attempts")
      .select("called_at")
      .in("source", MOJO_SOURCES)
      .order("called_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("mojo_call_recordings")
      .select("called_at")
      .order("called_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const candidates = [latestCall.data?.called_at, latestRecording.data?.called_at]
    .filter(Boolean)
    .map((value) => String(value));
  if (candidates.length === 0) return null;
  return candidates.sort((a, b) => b.localeCompare(a))[0].slice(0, 10);
}

function normalizeFilters(params: SearchParams, latestDate: string | null) {
  const end = params.end || latestDate || inputDate(new Date());
  return {
    start: params.start || defaultStartDate(),
    end,
    agent: params.agent || "all",
    disposition: params.disposition || "all",
    asset: params.asset || "all",
    page: params.page || "1",
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
    .limit(1000);

  if (filters.disposition !== "all") query.eq("disposition", filters.disposition);
  if (filters.asset === "recordings") query.not("recording_url", "is", null);

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

async function fetchMojoPushHistory(): Promise<MojoPushHistoryItem[]> {
  const { data, error } = await supabase
    .from("mojo_push_history")
    .select("id,owner_id,pushed_at,list_name,source,batch_id,selected_rows,imported_rows,push_status,error,display_name,row_status,reason,phone_count,email_count,loan_amount,maturity_date")
    .order("pushed_at", { ascending: false })
    .limit(500);
  if (error) throw error;
  return (data ?? []) as MojoPushHistoryItem[];
}

async function fetchRecordings(filters: ReturnType<typeof normalizeFilters>): Promise<MojoRecording[]> {
  const query = supabase
    .from("mojo_call_recordings")
    .select("id,mojo_call_id,agent_name,contact_name,called_at,disposition,duration,recording_url,transcript,source_url")
    .gte("called_at", startIso(filters.start))
    .lte("called_at", endIso(filters.end))
    .order("called_at", { ascending: false })
    .limit(1000);
  if (filters.disposition !== "all") query.eq("disposition", filters.disposition);
  if (filters.agent !== "all") query.eq("agent_name", filters.agent);
  if (filters.asset === "recordings") query.not("recording_url", "is", null);
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

function pushStatusColor(status: string | null | undefined) {
  const value = (status ?? "").trim().toLowerCase();
  if (value === "error" || value === "failed") return "#f85149";
  if (value === "skipped" || value === "held") return "#d29922";
  return "#3fb950";
}

function pushBatchKey(item: MojoPushHistoryItem) {
  return item.batch_id ?? `${item.list_name ?? "unknown-list"}:${item.pushed_at}`;
}

function buildMojoPushBatches(items: MojoPushHistoryItem[]): MojoPushBatch[] {
  const sorted = [...items].sort((a, b) => a.pushed_at.localeCompare(b.pushed_at));
  const seenByList = new Map<string, Set<number>>();
  const grouped = new Map<string, { items: MojoPushHistoryItem[]; duplicateOwnerIds: Set<number> }>();

  for (const item of sorted) {
    const key = pushBatchKey(item);
    const group = grouped.get(key) ?? { items: [], duplicateOwnerIds: new Set<number>() };
    const listKey = item.list_name ?? item.pushed_at.slice(0, 10);
    const seen = seenByList.get(listKey) ?? new Set<number>();
    if (item.owner_id && seen.has(item.owner_id)) group.duplicateOwnerIds.add(item.owner_id);
    group.items.push(item);
    grouped.set(key, group);
    if (item.owner_id && (item.row_status ?? item.push_status ?? "").toLowerCase() === "sent") {
      seen.add(item.owner_id);
    }
    seenByList.set(listKey, seen);
  }

  return Array.from(grouped.entries())
    .map(([key, group]) => {
      const rows = group.items;
      const latest = rows.reduce((winner, row) => (row.pushed_at > winner.pushed_at ? row : winner), rows[0]);
      const selected = Number(latest.selected_rows ?? rows.length);
      const imported = Number(latest.imported_rows ?? selected);
      const sentRows = rows.filter((row) => (row.row_status ?? row.push_status ?? "").toLowerCase() === "sent").length;
      const skippedRows = rows.filter((row) => (row.row_status ?? row.push_status ?? "").toLowerCase() === "skipped").length;
      const failedRows = rows.filter((row) => ["failed", "error"].includes((row.row_status ?? row.push_status ?? "").toLowerCase())).length;
      const duplicateRows = group.duplicateOwnerIds.size;
      const visibleRows = Math.max(0, sentRows - duplicateRows);
      const status = failedRows > 0 ? "failed" : skippedRows > 0 ? "partial" : "sent";
      const names = rows
        .map((row) => row.display_name)
        .filter(Boolean) as string[];
      const note = duplicateRows > 0
        ? `${fmtCount(sentRows)} sent to Mojo, ${fmtCount(visibleRows)} new visible contacts, ${fmtCount(duplicateRows)} already existed / kept old.`
        : `${fmtCount(sentRows)} sent to Mojo, ${fmtCount(visibleRows)} new visible contacts.`;

      return {
        key,
        pushed_at: latest.pushed_at,
        list_name: latest.list_name,
        batch_id: latest.batch_id,
        status,
        selected_rows: selected,
        sent_rows: sentRows,
        imported_rows: imported,
        duplicate_rows: duplicateRows,
        visible_rows: visibleRows,
        skipped_rows: skippedRows,
        failed_rows: failedRows,
        names,
        note,
      };
    })
    .sort((a, b) => b.pushed_at.localeCompare(a.pushed_at));
}

function chartRowsFromMap(map: Map<string, number>, palette: string[]): ChartRow[] {
  return Array.from(map.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([label, value], index) => ({
      label,
      value,
      color: palette[index % palette.length],
    }));
}

function chartRowsFromDateMap(map: Map<string, number>, palette: string[]): ChartRow[] {
  return Array.from(map.entries())
    .sort((a, b) => b[0].localeCompare(a[0]))
    .slice(0, 7)
    .map(([label, value], index) => ({
      label,
      value,
      color: palette[index % palette.length],
    }));
}

function ChartCard({
  title,
  subtitle,
  rows,
  emptyText,
}: {
  title: string;
  subtitle: string;
  rows: ChartRow[];
  emptyText: string;
}) {
  const peak = rows.reduce((max, row) => Math.max(max, row.value), 0);

  return (
    <section className="rounded-lg border" style={{ background: "#161b22", borderColor: "#30363d" }}>
      <div className="border-b px-5 py-4" style={{ borderColor: "#30363d" }}>
        <h2 className="text-sm font-semibold" style={{ color: "#e6edf3" }}>{title}</h2>
        <p className="mt-1 text-xs" style={{ color: "#8b949e" }}>{subtitle}</p>
      </div>
      <div className="px-5 py-4">
        {rows.length === 0 ? (
          <div className="py-8 text-center text-sm" style={{ color: "#484f58" }}>{emptyText}</div>
        ) : (
          <div className="space-y-2">
            {rows.map((row) => {
              const pct = peak > 0 ? Math.max(6, Math.round((row.value / peak) * 100)) : 0;
              return (
                <div key={row.label} className="flex items-center gap-3">
                  <span className="w-28 shrink-0 truncate text-xs" style={{ color: "#8b949e" }} title={row.label}>
                    {row.label}
                  </span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full" style={{ background: "#21262d" }}>
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: row.color }} />
                  </div>
                  <span className="w-12 shrink-0 text-right font-mono text-xs" style={{ color: "#e6edf3" }}>
                    {row.value.toLocaleString()}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

function RecentCallsCard({ calls }: { calls: DisplayCall[] }) {
  const recent = calls.slice(0, 5);

  return (
    <section className="rounded-lg border" style={{ background: "#161b22", borderColor: "#30363d" }}>
      <div className="border-b px-5 py-4" style={{ borderColor: "#30363d" }}>
        <h2 className="text-sm font-semibold" style={{ color: "#e6edf3" }}>Recent Mojo Outcomes</h2>
        <p className="mt-1 text-xs" style={{ color: "#8b949e" }}>Latest reviewable rows pulled into Hub.</p>
      </div>
      <div className="divide-y" style={{ borderColor: "#21262d" }}>
        {recent.length === 0 ? (
          <div className="px-5 py-6 text-sm" style={{ color: "#484f58" }}>No recent calls for this filter.</div>
        ) : (
          recent.map((call) => (
            <div key={call.id} className="px-5 py-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-xs font-semibold" style={{ color: "#e6edf3" }}>{call.target_name}</div>
                  <div className="truncate text-[11px]" style={{ color: "#8b949e" }}>
                    {call.agent_name} Â· {call.phone_number ?? "Unknown phone"}
                  </div>
                </div>
                <span className="text-xs" style={{ color: "#8b949e" }}>{fmtDateTime(call.called_at)}</span>
              </div>
              <div className="mt-1 text-xs" style={{ color: "#c9d1d9" }}>
                {formatDisposition(call.disposition)} Â· {fmtCount(call.total_call_attempts)} attempts
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

function extractAgent(notes: string | null | undefined) {
  const match = (notes ?? "").match(/Agent:\s*([^\n]+)/i);
  return match?.[1]?.trim() || "All Agents";
}

function normalizeKey(value: string | null | undefined) {
  return (value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(" ");
}

function buildRecordingMatcher(recordings: MojoRecording[]) {
  const byCallId = new Map<string, MojoRecording>();
  const byName = new Map<string, MojoRecording[]>();

  for (const recording of recordings) {
    if (recording.mojo_call_id) byCallId.set(recording.mojo_call_id, recording);

    const nameKey = normalizeKey(recording.contact_name);
    if (nameKey) {
      const existing = byName.get(nameKey) ?? [];
      existing.push(recording);
      byName.set(nameKey, existing);
    }
  }

  return { byCallId, byName };
}

function pickRecordingForCall(call: DisplayCall, recordings: ReturnType<typeof buildRecordingMatcher>) {
  if (call.mojo_call_id) {
    const exact = recordings.byCallId.get(call.mojo_call_id);
    if (exact) return exact;
  }

  const targetKey = normalizeKey(call.target_name);
  if (targetKey) {
    const nameMatch = recordings.byName.get(targetKey)?.[0];
    if (nameMatch) return nameMatch;
  }

  return null;
}

function parseDurationSeconds(value: string | null | undefined) {
  if (!value) return null;
  const parts = value.split(":").map((part) => Number(part));
  if (parts.some((part) => !Number.isFinite(part))) return null;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return null;
}

function isConnectedCall(call: DisplayCall) {
  // Exclude synthetic recording-only rows â they are not real connected calls,
  // they are recordings without a matching call_attempt. Counting them here
  // caused Connected === Recordings.
  if (call.source === "mojo_recording") return false;
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
      recording_id: null,
      recording_contact_name: null,
      recording_source_url: null,
    };
  });
}

function buildRecordingDisplayCalls(recordings: MojoRecording[]): DisplayCall[] {
  return recordings.map((recording) => ({
    id: -recording.id,
    owner_id: null,
    entity_id: null,
    called_at: recording.called_at ?? "",
    source: "mojo_recording",
    mojo_call_id: recording.mojo_call_id,
    disposition: recording.disposition,
    phone_number: null,
    notes: null,
    recording_url: recording.recording_url,
    transcript: recording.transcript,
    call_duration_sec: parseDurationSeconds(recording.duration),
    agent_name: recording.agent_name ?? "All Agents",
    target_name: recording.contact_name ?? "Unknown",
    target_type: "recording",
    outreach_status: null,
    total_call_attempts: null,
    follow_up_date: null,
    recording_id: recording.id,
    recording_contact_name: recording.contact_name,
    recording_source_url: recording.source_url,
  }));
}

function unique(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter(Boolean) as string[])).sort((a, b) => a.localeCompare(b));
}

function isNoContact(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase() === "no contact";
}

function isNoContactCall(call: DisplayCall) {
  return isNoContact(call.outreach_status) || isNoContact(call.disposition);
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

  const latestImportedDate = await safe(fetchLatestCallDate, null);
  const filters = normalizeFilters(searchParams, latestImportedDate);

  const [syncBatches, pushHistory, rawCalls, recordings] = await Promise.all([
    safe(fetchSyncBatches, []),
    safe(fetchMojoPushHistory, []),
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
  const recordingMatcher = buildRecordingMatcher(recordings);
  const enrichedCalls = allCalls.map((call) => {
    const recording = pickRecordingForCall(call, recordingMatcher);
    return {
      ...call,
      recording_url: call.recording_url ?? recording?.recording_url ?? null,
      recording_id: recording?.id ?? null,
      recording_contact_name: recording?.contact_name ?? null,
      recording_source_url: recording?.source_url ?? null,
    };
  });
  const usedRecordingIds = new Set(enrichedCalls.map((call) => call.recording_id).filter(Boolean));
  const recordingOnlyCalls = buildRecordingDisplayCalls(recordings.filter((recording) => !usedRecordingIds.has(recording.id)));
  const calls = [...enrichedCalls, ...recordingOnlyCalls].filter((call) => {
    if (filters.agent !== "all" && call.agent_name !== filters.agent) return false;
    if (filters.asset === "connected" && !isConnectedCall(call)) return false;
    if (isNoContactCall(call)) return false;
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
  const recordingCount = calls.filter((call) => call.recording_url).length;
  const pushBatches = buildMojoPushBatches(pushHistory);
  const latestSync = syncBatches[0]?.synced_at ?? null;
  const todayKey = inputDate(new Date());
  const callsToday = calls.filter((call) => call.called_at.slice(0, 10) === todayKey);
  const callsByDay = new Map<string, number>();
  const callsByDisposition = new Map<string, number>();
  const recordingsByAgent = new Map<string, number>();
  const pushOutcomes = new Map<string, number>();

  for (const call of calls) {
    const day = call.called_at.slice(0, 10);
    callsByDay.set(day, (callsByDay.get(day) ?? 0) + 1);
    const disposition = formatDisposition(call.disposition);
    callsByDisposition.set(disposition, (callsByDisposition.get(disposition) ?? 0) + 1);
    if (call.recording_url) {
      recordingsByAgent.set(call.agent_name, (recordingsByAgent.get(call.agent_name) ?? 0) + 1);
    }
  }

  for (const item of pushHistory) {
    const status = (item.push_status ?? item.row_status ?? "sent").trim().toLowerCase();
    const label = status === "sent" ? "sent" : status === "skipped" ? "skipped" : status === "failed" ? "failed" : status;
    pushOutcomes.set(label, (pushOutcomes.get(label) ?? 0) + 1);
  }

  const callsByDayRows = chartRowsFromDateMap(callsByDay, ["#1f6feb", "#2ea043", "#d29922", "#a371f7", "#f85149", "#58a6ff", "#3fb950"]);
  const callsByDispositionRows = chartRowsFromMap(callsByDisposition, ["#2ea043", "#1f6feb", "#d29922", "#a371f7", "#f85149"]);
  const recordingsByAgentRows = chartRowsFromMap(recordingsByAgent, ["#d29922", "#58a6ff", "#3fb950", "#a371f7", "#f85149"]);
  const pushOutcomeRows = chartRowsFromMap(pushOutcomes, ["#3fb950", "#d29922", "#f85149", "#8b949e", "#58a6ff"]);
  const pageSize = 20;
  const currentPage = Math.max(1, Number(filters.page ?? "1") || 1);
  const totalPages = Math.max(1, Math.ceil(calls.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const pagedCalls = calls.slice((safePage - 1) * pageSize, safePage * pageSize);

  return (
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
          {latestImportedDate && (
            <>
              {" "}
              <span className="font-semibold" style={{ color: "#58a6ff" }}>Latest imported call:</span> {latestImportedDate}.{" "}
              <a
                href={`/mojo-stats?start=${defaultStartDate()}&end=${latestImportedDate}&agent=${encodeURIComponent(filters.agent)}&disposition=${encodeURIComponent(filters.disposition)}&asset=${encodeURIComponent(filters.asset)}&page=1`}
                style={{ color: "#58a6ff", textDecoration: "underline" }}
              >
                Jump to latest
              </a>
            </>
          )}
        </div>

        <section className="mb-6">
          <div className="mb-3 flex items-end justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold" style={{ color: "#e6edf3" }}>Mojo Dashboard</h2>
              <p className="mt-1 text-xs" style={{ color: "#8b949e" }}>Compact trend view for calls, recordings, and pushes.</p>
            </div>
            <div className="rounded-full border px-3 py-1 text-[11px] font-medium" style={{ background: "#0d1117", color: "#8b949e", borderColor: "#30363d" }}>
              {fmtCount(callsToday.length)} calls today
            </div>
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            <ChartCard
              title="Calls by Day"
              subtitle="Rows currently loaded from Mojo call detail."
              rows={callsByDayRows}
              emptyText="No calls found for this range."
            />
            <ChartCard
              title="Call Outcomes"
              subtitle="Disposition mix across the loaded Mojo rows."
              rows={callsByDispositionRows}
              emptyText="No disposition data for this range."
            />
            <ChartCard
              title="Recordings by Agent"
              subtitle="Only rows with an attached recording URL."
              rows={recordingsByAgentRows}
              emptyText="No recordings found for this range."
            />
            <ChartCard
              title="Push Outcomes"
              subtitle="Latest push history landed from Skip Trace."
              rows={pushOutcomeRows}
              emptyText="No push history yet."
            />
          </div>
        </section>

        <section className="mb-6 rounded-lg border" style={{ background: "#161b22", borderColor: "#30363d" }}>
          <div className="border-b px-5 py-4" style={{ borderColor: "#30363d" }}>
            <h2 className="text-sm font-semibold" style={{ color: "#e6edf3" }}>Mojo Push History</h2>
            <p className="mt-1 text-xs" style={{ color: "#8b949e" }}>Recent push outcomes from Skip Trace. Detailed row-level context lives here now.</p>
          </div>
          <div
            className="flex flex-wrap items-center gap-2 px-5 py-3 text-xs"
            style={{ background: "#0f1621", borderBottom: "1px solid #30363d", color: "#8b949e" }}
          >
            <span className="rounded-full border px-2 py-0.5" style={{ borderColor: "#30363d", color: "#c9d1d9" }}>
              Source: Skip Trace
            </span>
            <span className="rounded-full border px-2 py-0.5" style={{ borderColor: "#30363d", color: "#c9d1d9" }}>
              Row-level push log
            </span>
            <span className="rounded-full border px-2 py-0.5" style={{ borderColor: "#30363d", color: "#c9d1d9" }}>
              Latest 5 batches
            </span>
          </div>
          <div className="divide-y" style={{ borderColor: "#21262d" }}>
            {pushBatches.length === 0 ? (
              <div className="px-5 py-6 text-sm" style={{ color: "#484f58" }}>No push history yet.</div>
            ) : (
              pushBatches.slice(0, 5).map((batch) => {
                const namePreview = batch.names.slice(0, 6).join(", ");
                const overflowCount = Math.max(0, batch.names.length - 6);
                return (
                  <div key={batch.key} className="px-5 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-semibold" style={{ color: pushStatusColor(batch.status) }}>
                          {batch.status}
                        </span>
                        <span className="text-xs" style={{ color: "#c9d1d9" }}>{batch.note}</span>
                      </div>
                      <span className="text-xs" style={{ color: "#8b949e" }}>{fmtDateTime(batch.pushed_at)}</span>
                    </div>
                    <div className="mt-1 text-xs" style={{ color: "#8b949e" }}>
                      {fmtCount(batch.selected_rows)} selected, {fmtCount(batch.imported_rows)} importer accepted
                      {batch.skipped_rows > 0 ? `, ${fmtCount(batch.skipped_rows)} skipped` : ""}
                      {batch.failed_rows > 0 ? `, ${fmtCount(batch.failed_rows)} failed` : ""}
                      {batch.list_name ? ` | ${batch.list_name}` : ""}
                      {batch.batch_id ? ` | batch ${batch.batch_id}` : ""}
                    </div>
                    {namePreview && (
                      <div className="mt-1 text-xs" style={{ color: "#484f58" }}>
                        {namePreview}{overflowCount > 0 ? `, +${fmtCount(overflowCount)} more` : ""}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </section>

        <form className="mb-6 rounded-lg border" style={{ background: "#161b22", borderColor: "#30363d" }}>
          <div className="border-b px-5 py-4" style={{ borderColor: "#30363d" }}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold" style={{ color: "#e6edf3" }}>Filters</h2>
                <p className="mt-1 text-xs" style={{ color: "#8b949e" }}>Scope the report by date, agent, disposition, and whether recordings exist.</p>
              </div>
              <div className="rounded-full border px-3 py-1 text-[11px] font-medium" style={{ background: "#0d1117", color: "#8b949e", borderColor: "#30363d" }}>
                {fmtCount(calls.length)} matching calls
              </div>
            </div>
          </div>
          <div className="grid gap-3 px-5 py-4 md:grid-cols-2 xl:grid-cols-6">
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
            <div className="flex items-end gap-2 xl:col-span-2">
              <button className="w-full rounded-md px-3 py-2 text-sm font-semibold" style={{ background: "#238636", color: "#fff" }}>Apply</button>
              <a href="/mojo-stats" className="rounded-md px-3 py-2 text-sm font-semibold" style={{ background: "#21262d", color: "#8b949e", border: "1px solid #30363d" }}>Reset</a>
            </div>
          </div>
        </form>

        <div className="mb-6 grid grid-cols-4 gap-4">
          {[
            { label: "Mojo outcomes", value: calls.length, color: "#58a6ff" },
            { label: "Session rows", value: sessions.length, color: "#3fb950" },
            { label: "Recordings", value: recordingCount, color: "#d29922" },
            { label: "Connected", value: connectedCalls.length, color: "#a371f7" },
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

        <div className="grid gap-6 xl:grid-cols-2">
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
        </div>
        <section className="mt-6 rounded-lg border" style={{ background: "#161b22", borderColor: "#30363d" }}>
          <div className="border-b px-5 py-4" style={{ borderColor: "#30363d" }}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold" style={{ color: "#e6edf3" }}>Call Detail Report</h2>
                <p className="mt-1 text-xs" style={{ color: "#8b949e" }}>Rows pulled from Mojo call detail and stored in Supabase for Hub review.</p>
              </div>
              <div className="text-xs" style={{ color: "#8b949e" }}>Page {safePage} of {totalPages}</div>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr style={{ color: "#8b949e", borderBottom: "1px solid #30363d" }}>
                    {["When", "Agent", "Target", "Phone", "Disposition", "Recording", "Attempts", "Source"].map((header) => (
                      <th key={header} className="px-4 py-3 text-left text-xs font-medium">{header}</th>
                    ))}
                </tr>
              </thead>
              <tbody>
                {pagedCalls.length === 0 ? (
                  <tr><td className="px-4 py-6 text-sm" style={{ color: "#484f58" }} colSpan={8}>No call-detail rows for this filter.</td></tr>
                ) : pagedCalls.map((call) => (
                  <tr key={call.id} style={{ borderBottom: "1px solid #21262d" }}>
                    <td className="px-4 py-3 text-xs" style={{ color: "#8b949e" }}>{fmtDateTime(call.called_at)}</td>
                    <td className="px-4 py-3 text-xs" style={{ color: "#8b949e" }}>{call.agent_name}</td>
                    <td className="px-4 py-3">
                      <div className="text-xs font-medium" style={{ color: "#e6edf3" }}>{call.target_name}</div>
                      <div className="text-xs" style={{ color: "#484f58" }}>{call.phone_number ?? "Unknown phone"}</div>
                    </td>
                    <td className="px-4 py-3 text-xs" style={{ color: "#8b949e" }}>{call.phone_number ?? "Unknown"}</td>
                    <td className="px-4 py-3 text-xs" style={{ color: "#c9d1d9" }}>{formatDisposition(call.disposition)}</td>
                    <td className="px-4 py-3 text-xs" style={{ color: "#8b949e" }}>
                      {call.recording_url ? (
                        <div className="min-w-[220px]">
                          <a href={call.recording_url} target="_blank" rel="noreferrer" style={{ color: "#58a6ff" }}>Mojo audio</a>
                          <div className="mt-1 text-[11px]" style={{ color: "#484f58" }}>
                            {call.recording_contact_name ?? call.target_name}
                            {call.recording_source_url ? ` | ${call.recording_source_url}` : ""}
                          </div>
                        </div>
                      ) : (
                        "None"
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs" style={{ color: "#8b949e" }}>{fmtCount(call.total_call_attempts)}</td>
                    <td className="px-4 py-3 text-xs" style={{ color: "#8b949e" }}>{call.source ?? "mojo"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between gap-3 border-t px-5 py-4" style={{ borderColor: "#30363d" }}>
            <div className="text-xs" style={{ color: "#8b949e" }}>
              Showing {pagedCalls.length ? (safePage - 1) * pageSize + 1 : 0} - {(safePage - 1) * pageSize + pagedCalls.length} of {calls.length}
            </div>
            <div className="flex items-center gap-2">
              <a
                href={`/mojo-stats?start=${filters.start}&end=${filters.end}&agent=${encodeURIComponent(filters.agent)}&disposition=${encodeURIComponent(filters.disposition)}&asset=${encodeURIComponent(filters.asset)}&page=${Math.max(1, safePage - 1)}`}
                className="rounded-md px-3 py-2 text-xs font-semibold"
                style={{ background: safePage === 1 ? "#0d1117" : "#21262d", color: "#c9d1d9", border: "1px solid #30363d", pointerEvents: safePage === 1 ? "none" : "auto", opacity: safePage === 1 ? 0.5 : 1 }}
              >
                Prev
              </a>
              <a
                href={`/mojo-stats?start=${filters.start}&end=${filters.end}&agent=${encodeURIComponent(filters.agent)}&disposition=${encodeURIComponent(filters.disposition)}&asset=${encodeURIComponent(filters.asset)}&page=${Math.min(totalPages, safePage + 1)}`}
                className="rounded-md px-3 py-2 text-xs font-semibold"
                style={{ background: safePage === totalPages ? "#0d1117" : "#21262d", color: "#c9d1d9", border: "1px solid #30363d", pointerEvents: safePage === totalPages ? "none" : "auto", opacity: safePage === totalPages ? 0.5 : 1 }}
              >
                Next
              </a>
            </div>
          </div>
        </section>
      </div>
  );
}
