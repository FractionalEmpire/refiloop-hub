"use client";
import { useEffect, useState, useCallback } from "react";

type FilterRule = {
  id: number;
  rule_key: string;
  rule_value: string;
  data_type: string;
  description: string;
  updated_at: string;
  updated_by: string;
};

type FunnelData = {
  raw_capitalize: number;
  imported_loans: number;
  after_active: number;
  after_state_not_null: number;
  after_blocked_states: number;
  after_loan_amount: number;
  after_maturity: number;
  qualified_loans: number;
  ql_individual_only: number;
  ql_entity_only: number;
  ql_both: number;
  ql_no_owner: number;
  total_slots: number;
  pending_skip_trace: number;
};

const GROUPS: { label: string; keys: string[] }[] = [
  {
    label: "Lead Eligibility",
    keys: ["min_loan_amount", "max_loan_amount", "min_maturity_days", "max_maturity_days"],
  },
  { label: "Geography", keys: ["blocked_states"] },
  {
    label: "Property & Lender",
    keys: ["excluded_property_types", "exclude_mers", "exclude_agency", "mortgage_purpose_filter"],
  },
  {
    label: "Pipeline Behavior",
    keys: ["enable_veil_pierce", "no_answer_max_attempts", "park_duration_too_early", "park_duration_in_process"],
  },
];

const LABEL_MAP: Record<string, string> = {
  min_loan_amount: "Min Loan Amount ($)",
  max_loan_amount: "Max Loan Amount ($)",
  min_maturity_days: "Min Days to Maturity",
  max_maturity_days: "Max Days to Maturity",
  blocked_states: "Blocked States (comma-separated)",
  excluded_property_types: "Excluded Property Types (comma-separated)",
  exclude_mers: "Exclude MERS Lenders",
  exclude_agency: "Exclude Agency Lenders",
  mortgage_purpose_filter: "Mortgage Purpose Filter",
  enable_veil_pierce: "Enable Veil Pierce (entity → officer lookup)",
  no_answer_max_attempts: "Max No-Answer Attempts Before Next Officer",
  park_duration_too_early: "Park Duration — Too Early (days)",
  park_duration_in_process: "Park Duration — In Process (days)",
};

function fmtRule(rule: FilterRule) {
  if (rule.data_type === "numeric") return `$${Number(rule.rule_value).toLocaleString()}`;
  if (rule.data_type === "integer") return `${rule.rule_value} days`;
  if (rule.data_type === "boolean") return rule.rule_value === "true" ? "Yes" : "No";
  return rule.rule_value;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function n(v: number) { return v.toLocaleString(); }
function pct(v: number, total: number) { return total > 0 ? `${((v / total) * 100).toFixed(1)}%` : "—"; }

// ─── Funnel bar row ───────────────────────────────────────────────────────────
function FunnelRow({
  label, sublabel, count, dropped, maxCount, color = "#1f6feb",
}: {
  label: string; sublabel?: string; count: number; dropped: number | null;
  maxCount: number; color?: string;
}) {
  const barPct = maxCount > 0 ? Math.max((count / maxCount) * 100, 0.3) : 0;
  return (
    <div className="flex items-center gap-3 py-1.5">
      {/* Label */}
      <div className="w-52 shrink-0">
        <div className="text-xs font-medium leading-tight" style={{ color: "#e6edf3" }}>{label}</div>
        {sublabel && <div className="text-xs leading-tight mt-0.5" style={{ color: "#484f58" }}>{sublabel}</div>}
      </div>

      {/* Bar + count overlay */}
      <div className="flex-1 relative" style={{ height: 22 }}>
        <div className="absolute inset-0 rounded" style={{ background: "#0d1117" }} />
        <div
          className="absolute inset-y-0 left-0 rounded transition-all duration-500"
          style={{ width: `${barPct}%`, background: color, opacity: 0.85 }}
        />
        {/* Count on top of bar */}
        <div className="absolute inset-0 flex items-center px-2">
          <span className="text-xs font-mono font-semibold" style={{ color: "#e6edf3", textShadow: "0 0 4px #0d1117" }}>
            {n(count)}
          </span>
        </div>
      </div>

      {/* Dropped */}
      <div className="w-28 text-right shrink-0">
        {dropped !== null && dropped > 0 ? (
          <span className="text-xs font-mono font-semibold" style={{ color: "#f85149" }}>
            −{n(dropped)}
          </span>
        ) : (
          <span className="text-xs" style={{ color: "#30363d" }}>—</span>
        )}
      </div>
    </div>
  );
}

// ─── Owner breakdown donut-style bar ─────────────────────────────────────────
function OwnerBreakdown({ data }: { data: FunnelData }) {
  const total = data.qualified_loans;
  if (!total) return null;

  const segments = [
    { label: "No owner linked", key: "ql_no_owner" as const, color: "#f85149", desc: "Borrower name was never parsed into an owner record. These loans are invisible to the dialer — biggest gap." },
    { label: "Entity only (needs veil pierce)", key: "ql_entity_only" as const, color: "#e3b341", desc: "Owned by an LLC/corp. You have the entity but need to look up its officers to get a real person to call." },
    { label: "Individual (ready to skip trace)", key: "ql_individual_only" as const, color: "#3fb950", desc: "Directly owned by a named person. Already in the skip-trace pipeline." },
    { label: "Both individual + entity", key: "ql_both" as const, color: "#58a6ff", desc: "Loan has both an individual owner and an entity owner linked." },
  ];

  return (
    <div className="mt-4 pt-4 border-t" style={{ borderColor: "#21262d" }}>
      <div className="text-xs font-semibold mb-1" style={{ color: "#8b949e" }}>
        Who owns the {n(total)} qualified loans?
      </div>
      <div className="text-xs mb-3" style={{ color: "#484f58" }}>
        This determines how the pipeline can reach a borrower.
      </div>

      {/* Stacked bar */}
      <div className="flex rounded overflow-hidden mb-3" style={{ height: 10 }}>
        {segments.map((s) => {
          const v = data[s.key];
          const w = (v / total) * 100;
          return w > 0 ? (
            <div key={s.key} style={{ width: `${w}%`, background: s.color }} title={`${s.label}: ${n(v)}`} />
          ) : null;
        })}
      </div>

      {/* Legend rows */}
      <div className="space-y-2">
        {segments.map((s) => {
          const v = data[s.key];
          return (
            <div key={s.key} className="flex gap-2">
              <div className="mt-1 w-2 h-2 rounded-sm shrink-0" style={{ background: s.color }} />
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="text-xs font-medium" style={{ color: "#e6edf3" }}>{s.label}</span>
                  <span className="text-xs font-mono font-semibold" style={{ color: s.color }}>{n(v)}</span>
                  <span className="text-xs" style={{ color: "#484f58" }}>({pct(v, total)})</span>
                </div>
                <div className="text-xs mt-0.5" style={{ color: "#484f58" }}>{s.desc}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main funnel panel ────────────────────────────────────────────────────────
function FilterFunnel({ data, refreshing }: { data: FunnelData; refreshing: boolean }) {
  const top = data.raw_capitalize;

  type Row = { label: string; sublabel?: string; key: keyof FunnelData; divider?: boolean; color?: string };
  const rows: Row[] = [
    { label: "Raw Capitalize data",     sublabel: "raw_capitalize_scrape table",               key: "raw_capitalize" },
    { label: "Imported to loans table", sublabel: "filtered + deduped at import time",          key: "imported_loans", divider: true },
    { label: "Active loans",            sublabel: "is_active = true",                           key: "after_active" },
    { label: "Has state",               sublabel: "state IS NOT NULL",                          key: "after_state_not_null" },
    { label: "Not blocked state",       sublabel: "excl. CA NY NJ MN AZ NV IL MA CT OR WA",    key: "after_blocked_states" },
    { label: "Loan amount in range",    sublabel: "$500K – $10M",                               key: "after_loan_amount" },
    { label: "Maturity in window",      sublabel: "60 – 365 days out",                          key: "after_maturity" },
    { label: "Property type ok",        sublabel: "excluded types removed — qualified loans",   key: "qualified_loans", divider: true },
    { label: "Skip-trace slots (all)",  sublabel: "v_airtable_push — owners + entity officers", key: "total_slots", color: "#b45309" },
    { label: "Pending skip trace",      sublabel: "skip_trace_done = false",                    key: "pending_skip_trace", color: "#b45309" },
  ];

  return (
    <div className="mb-10 rounded-xl overflow-hidden" style={{ background: "#161b22", border: "1px solid #21262d" }}>
      {/* Header */}
      <div className="px-5 pt-4 pb-3 border-b flex items-center justify-between" style={{ borderColor: "#21262d" }}>
        <div>
          <div className="text-sm font-semibold flex items-center gap-2" style={{ color: "#e6edf3" }}>
            Filter Funnel
            {refreshing && (
              <span className="text-xs font-normal" style={{ color: "#8b949e" }}>refreshing…</span>
            )}
          </div>
          <div className="text-xs mt-0.5" style={{ color: "#8b949e" }}>
            {n(data.raw_capitalize)} raw → {n(data.pending_skip_trace)} pending skip trace
          </div>
        </div>
        <div className="text-xs flex gap-4" style={{ color: "#484f58" }}>
          <span>count</span>
          <span className="w-28 text-right">removed</span>
        </div>
      </div>

      {/* Rows */}
      <div className="px-5 py-3">
        {rows.map((row, i) => {
          const prevRow = rows[i - 1];
          const prevCount = prevRow ? data[prevRow.key] as number : null;
          const count = data[row.key] as number;
          const dropped = prevCount !== null ? prevCount - count : null;

          return (
            <div key={row.key}>
              {row.divider && i > 0 && (
                <div className="my-2 border-t" style={{ borderColor: "#21262d" }} />
              )}
              <FunnelRow
                label={row.label}
                sublabel={row.sublabel}
                count={count}
                dropped={dropped}
                maxCount={top}
                color={row.color ?? "#1f6feb"}
              />
            </div>
          );
        })}

        {/* Owner breakdown */}
        <OwnerBreakdown data={data} />
      </div>

      <div className="px-5 py-2 border-t text-xs" style={{ borderColor: "#21262d", color: "#484f58" }}>
        Funnel refreshes automatically after each filter save. Slot counts reflect{" "}
        <code style={{ color: "#8b949e" }}>v_airtable_push</code> (refreshed daily at 06:00 UTC).
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function FiltersClient() {
  const [rules, setRules] = useState<FilterRule[]>([]);
  const [editing, setEditing] = useState<Record<number, string>>({});
  const [saving, setSaving] = useState<Record<number, boolean>>({});
  const [saved, setSaved] = useState<Record<number, boolean>>({});
  const [error, setError] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);

  const [funnel, setFunnel] = useState<FunnelData | null>(null);
  const [funnelLoading, setFunnelLoading] = useState(true);
  const [funnelRefreshing, setFunnelRefreshing] = useState(false);
  const [funnelError, setFunnelError] = useState(false);

  const fetchFunnel = useCallback(async (isRefresh = false) => {
    if (isRefresh) setFunnelRefreshing(true);
    else setFunnelLoading(true);
    try {
      const r = await fetch("/api/filters/funnel", { cache: "no-store" });
      const d = await r.json();
      if (d.error) setFunnelError(true);
      else { setFunnel(d); setFunnelError(false); }
    } catch {
      setFunnelError(true);
    } finally {
      setFunnelLoading(false);
      setFunnelRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetch("/api/filters")
      .then((r) => r.json())
      .then((d) => { setRules(d); setLoading(false); });
    fetchFunnel(false);
  }, [fetchFunnel]);

  function startEdit(rule: FilterRule) {
    setEditing((e) => ({ ...e, [rule.id]: rule.rule_value }));
    setSaved((s) => ({ ...s, [rule.id]: false }));
  }

  function cancelEdit(id: number) {
    setEditing((e) => { const n = { ...e }; delete n[id]; return n; });
    setError((e) => { const n = { ...e }; delete n[id]; return n; });
  }

  async function save(rule: FilterRule) {
    const val = editing[rule.id];
    setSaving((s) => ({ ...s, [rule.id]: true }));
    setError((e) => { const n = { ...e }; delete n[rule.id]; return n; });
    const res = await fetch("/api/filters", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: rule.id, rule_value: val }),
    });
    setSaving((s) => ({ ...s, [rule.id]: false }));
    if (res.ok) {
      setRules((rs) => rs.map((r) =>
        r.id === rule.id ? { ...r, rule_value: val, updated_at: new Date().toISOString(), updated_by: "refiloop-hub" } : r
      ));
      setEditing((e) => { const n = { ...e }; delete n[rule.id]; return n; });
      setSaved((s) => ({ ...s, [rule.id]: true }));
      setTimeout(() => setSaved((s) => ({ ...s, [rule.id]: false })), 2000);
      // Refresh the funnel so numbers update immediately
      fetchFunnel(true);
    } else {
      setError((e) => ({ ...e, [rule.id]: "Save failed — try again" }));
    }
  }

  const byKey = Object.fromEntries(rules.map((r) => [r.rule_key, r]));
  const liveBlocked = byKey["blocked_states"]?.rule_value ?? "";
  const docBlocked = "CA,NY,NJ,MN,AZ,NV,IL,MA,CT,OR,WA";
  const hasDiscrepancy = liveBlocked && liveBlocked !== docBlocked;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64" style={{ color: "#8b949e" }}>
        Loading filter rules…
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-semibold mb-1" style={{ color: "#e6edf3" }}>Filter Rules</h1>
        <p className="text-sm" style={{ color: "#8b949e" }}>
          Live values from Supabase <code style={{ color: "#58a6ff" }}>filter_rules</code> table.
          Changes take effect immediately — the dialer queue and skip-trace cron read these on every run.
        </p>
      </div>

      {/* Funnel */}
      {funnelLoading ? (
        <div className="mb-10 rounded-xl p-6 flex items-center gap-3" style={{ background: "#161b22", border: "1px solid #21262d" }}>
          <div className="text-xs" style={{ color: "#484f58" }}>Loading funnel…</div>
        </div>
      ) : funnelError ? (
        <div className="mb-10 p-3 rounded-lg text-sm border" style={{ background: "#161b22", borderColor: "#21262d", color: "#8b949e" }}>
          Could not load funnel counts.
        </div>
      ) : funnel ? (
        <FilterFunnel data={funnel} refreshing={funnelRefreshing} />
      ) : null}

      {/* Discrepancy warning */}
      {hasDiscrepancy && (
        <div className="mb-6 p-3 rounded-lg text-sm border" style={{ background: "#2d1f00", borderColor: "#9e6a03", color: "#e3b341" }}>
          ⚠️ <strong>Blocked states mismatch:</strong> The live DB value ({liveBlocked}) differs from what{" "}
          <code>LEAD_FILTERS.md</code> documents ({docBlocked}). The DB is the live source — update the doc or fix the DB value below.
        </div>
      )}

      {/* Filter groups */}
      {GROUPS.map((group) => {
        const groupRules = group.keys.map((k) => byKey[k]).filter(Boolean);
        if (!groupRules.length) return null;
        return (
          <div key={group.label} className="mb-8">
            <div
              className="text-xs font-semibold uppercase tracking-wider mb-3 pb-2 border-b"
              style={{ color: "#8b949e", borderColor: "#21262d" }}
            >
              {group.label}
            </div>
            <div className="space-y-3">
              {groupRules.map((rule) => {
                const isEditing = rule.id in editing;
                const isSaving = saving[rule.id];
                const wasSaved = saved[rule.id];
                const errMsg = error[rule.id];

                return (
                  <div
                    key={rule.id}
                    className="rounded-lg p-4"
                    style={{ background: "#161b22", border: `1px solid ${isEditing ? "#58a6ff44" : "#21262d"}` }}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium mb-0.5" style={{ color: "#e6edf3" }}>
                          {LABEL_MAP[rule.rule_key] ?? rule.rule_key}
                        </div>
                        <div className="text-xs mb-2" style={{ color: "#8b949e" }}>{rule.description}</div>

                        {isEditing ? (
                          <div className="space-y-2">
                            {rule.data_type === "boolean" ? (
                              <select
                                value={editing[rule.id]}
                                onChange={(e) => setEditing((ed) => ({ ...ed, [rule.id]: e.target.value }))}
                                className="text-sm rounded px-2 py-1"
                                style={{ background: "#0d1117", border: "1px solid #30363d", color: "#e6edf3" }}
                              >
                                <option value="true">Yes (true)</option>
                                <option value="false">No (false)</option>
                              </select>
                            ) : rule.data_type === "text[]" ? (
                              <textarea
                                value={editing[rule.id]}
                                onChange={(e) => setEditing((ed) => ({ ...ed, [rule.id]: e.target.value }))}
                                rows={2}
                                className="w-full text-sm rounded px-2 py-1 font-mono resize-none"
                                style={{ background: "#0d1117", border: "1px solid #30363d", color: "#e6edf3" }}
                                placeholder="Comma-separated values"
                              />
                            ) : (
                              <input
                                type={rule.data_type === "numeric" || rule.data_type === "integer" ? "number" : "text"}
                                value={editing[rule.id]}
                                onChange={(e) => setEditing((ed) => ({ ...ed, [rule.id]: e.target.value }))}
                                className="text-sm rounded px-2 py-1 font-mono w-48"
                                style={{ background: "#0d1117", border: "1px solid #30363d", color: "#e6edf3" }}
                              />
                            )}
                            {errMsg && <div className="text-xs" style={{ color: "#f85149" }}>{errMsg}</div>}
                            <div className="flex gap-2">
                              <button
                                onClick={() => save(rule)}
                                disabled={isSaving}
                                className="text-xs px-3 py-1 rounded font-medium"
                                style={{ background: "#238636", color: "#fff", opacity: isSaving ? 0.6 : 1 }}
                              >
                                {isSaving ? "Saving…" : "Save"}
                              </button>
                              <button
                                onClick={() => cancelEdit(rule.id)}
                                className="text-xs px-3 py-1 rounded"
                                style={{ background: "#21262d", color: "#8b949e" }}
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center gap-3">
                            <code className="text-sm px-2 py-0.5 rounded" style={{ background: "#0d1117", color: "#58a6ff" }}>
                              {rule.rule_value}
                            </code>
                            <span className="text-xs" style={{ color: "#484f58" }}>({fmtRule(rule)})</span>
                            {wasSaved && <span className="text-xs" style={{ color: "#3fb950" }}>✓ Saved</span>}
                          </div>
                        )}
                      </div>

                      {!isEditing && (
                        <button
                          onClick={() => startEdit(rule)}
                          className="text-xs px-2 py-1 rounded shrink-0"
                          style={{ background: "#21262d", color: "#8b949e", border: "1px solid #30363d" }}
                          onMouseEnter={(e) => (e.currentTarget.style.color = "#e6edf3")}
                          onMouseLeave={(e) => (e.currentTarget.style.color = "#8b949e")}
                        >
                          Edit
                        </button>
                      )}
                    </div>

                    <div className="mt-2 text-xs" style={{ color: "#484f58" }}>
                      Updated {fmtDate(rule.updated_at)} by {rule.updated_by}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
