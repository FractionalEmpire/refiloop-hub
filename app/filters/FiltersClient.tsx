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
  // Funnel stages — loan counts
  raw_capitalize: number;
  imported_loans: number;
  after_active: number;
  after_state_not_null: number;
  after_blocked_states: number;
  after_loan_amount: number;
  after_maturity: number;
  qualified_loans: number;
  total_slots: number;
  pending_skip_trace: number;
  // Funnel stages — unique owner/entity counts (parallel to loan counts above)
  raw_capitalize_owners: number;
  imported_owners: number;
  after_active_owners: number;
  after_state_not_null_owners: number;
  after_blocked_states_owners: number;
  after_loan_amount_owners: number;
  after_maturity_owners: number;
  qualified_loans_owners: number;
  total_slots_owners: number;
  pending_skip_trace_owners: number;
  // Qualified loan ownership breakdown (loan counts)
  ql_individual_only: number;
  ql_entity_only: number;
  ql_both: number;
  ql_no_owner: number;
  // Individual owner enrichment pipeline (unique owner counts)
  individual_slots: number;
  ind_owners_skip_pending: number;
  ind_owners_skip_done: number;
  ind_owners_has_phone: number;
  // Entity enrichment pipeline
  ent_qualifying_total: number;
  ent_veil_pierced: number;
  entity_slots: number;
  ent_skip_pending: number;
  // Individual owner funnel — explains the 69K→17K gap
  ind_qual_owners: number;        // unique owner_ids in qualified loans (69,046)
  ind_owners_excl_type: number;   // excluded: owner_type != 'individual' (51,693)
  ind_owners_excl_name: number;   // excluded: missing first or last name (59)
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
  label, sublabel, count, ownerCount, dropped, maxCount, color = "#1f6feb",
}: {
  label: string; sublabel?: string;
  count: number; ownerCount?: number;
  dropped: number | null;
  maxCount: number; color?: string;
}) {
  const barPct = maxCount > 0 ? Math.max((count / maxCount) * 100, 0.3) : 0;
  return (
    <div className="flex items-center gap-3 py-1.5">
      {/* Label */}
      <div className="w-44 shrink-0">
        <div className="text-xs font-medium leading-tight" style={{ color: "#e6edf3" }}>{label}</div>
        {sublabel && <div className="text-xs leading-tight mt-0.5" style={{ color: "#484f58" }}>{sublabel}</div>}
      </div>

      {/* Bar */}
      <div className="flex-1 relative" style={{ height: 22 }}>
        <div className="absolute inset-0 rounded" style={{ background: "#0d1117" }} />
        <div
          className="absolute inset-y-0 left-0 rounded transition-all duration-500"
          style={{ width: `${barPct}%`, background: color, opacity: 0.85 }}
        />
      </div>

      {/* Loans column */}
      <div className="w-24 text-right shrink-0">
        <div className="text-xs font-mono font-semibold" style={{ color: "#e6edf3" }}>{n(count)}</div>
      </div>

      {/* Unique owners column */}
      <div className="w-24 text-right shrink-0">
        {ownerCount != null
          ? <div className="text-xs font-mono font-semibold" style={{ color: "#8b949e" }}>{n(ownerCount)}</div>
          : <span className="text-xs" style={{ color: "#30363d" }}>—</span>
        }
      </div>

      {/* Removed loans column */}
      <div className="w-24 text-right shrink-0">
        {dropped !== null && dropped > 0
          ? <div className="text-xs font-mono font-semibold" style={{ color: "#f85149" }}>−{n(dropped)}</div>
          : <span className="text-xs" style={{ color: "#30363d" }}>—</span>
        }
      </div>
    </div>
  );
}

// ─── Owner pipeline waterfall ─────────────────────────────────────────────────
function OwnerWaterfall({ data }: { data: FunnelData }) {
  const entityLinked = data.qualified_loans_owners - data.ind_qual_owners;
  const computed = data.ind_qual_owners - data.ind_owners_excl_type - data.ind_owners_excl_name;
  const ok = computed === data.individual_slots;
  const gap = data.individual_slots - computed;

  function WRow({ minus, value, label, dim }: { minus?: boolean; value: number; label: string; dim?: boolean }) {
    return (
      <div className="flex items-baseline gap-3">
        <div className="w-4 text-right text-xs shrink-0" style={{ color: minus ? "#f85149" : "transparent" }}>
          {minus ? "−" : "·"}
        </div>
        <div className="w-20 text-right shrink-0">
          <span className="font-mono text-xs font-semibold" style={{ color: minus ? "#f85149" : "#e6edf3" }}>
            {n(value)}
          </span>
        </div>
        <span className="text-xs" style={{ color: dim ? "#484f58" : "#8b949e" }}>{label}</span>
      </div>
    );
  }

  function WSubtotal({ value, label, check }: { value: number; label: string; check?: boolean }) {
    return (
      <div className="flex items-baseline gap-3 pt-1" style={{ borderTop: "1px solid #21262d" }}>
        <div className="w-4 shrink-0" />
        <div className="w-20 text-right shrink-0">
          <span className="font-mono text-xs font-bold" style={{ color: "#e6edf3" }}>{n(value)}</span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs" style={{ color: "#8b949e" }}>{label}</span>
          {check !== undefined && (
            <span
              className="text-[10px] px-1.5 py-px rounded font-mono"
              style={{
                background: check ? "#0d2818" : "#3d1a1a",
                color: check ? "#3fb950" : "#f85149",
              }}
            >
              {check ? "✓" : `gap ${gap > 0 ? "+" : ""}${n(gap)}`}
            </span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="mt-4 pt-4 border-t" style={{ borderColor: "#21262d" }}>
      <div className="text-xs font-semibold mb-3" style={{ color: "#8b949e" }}>
        Why only {n(data.individual_slots)} of {n(data.qualified_loans_owners)} owners reach skip trace
      </div>
      <div className="space-y-1.5">
        <WRow value={data.qualified_loans_owners} label="unique owners / entities across qualified loans" />
        <WRow minus value={entityLinked} label={`entity-linked → ${n(data.ent_qualifying_total)} unique entities (LLC/corp, veil-pierce queue)`} />
        <WSubtotal value={data.ind_qual_owners} label="individual owner IDs" />
        <WRow minus value={data.ind_owners_excl_type} label="owner_type ≠ 'individual' — trusts, corps, RAs stored in owner table (correctly classified)" />
        <WRow minus value={data.ind_owners_excl_name} label="missing first or last name" />
        <WSubtotal value={data.individual_slots} label="ready for skip trace" check={ok} />
      </div>
    </div>
  );
}

// ─── Main funnel panel ────────────────────────────────────────────────────────
function FilterFunnel({ data, refreshing }: { data: FunnelData; refreshing: boolean }) {
  const top = data.raw_capitalize;

  type Row = {
    label: string; sublabel?: string;
    key: keyof FunnelData; ownerKey?: keyof FunnelData;
    divider?: boolean; sectionLabel?: string; color?: string;
  };

  const rows: Row[] = [
    { label: "Raw Capitalize data",    sublabel: "raw_capitalize_scrape table",             key: "raw_capitalize",       ownerKey: "raw_capitalize_owners" },
    { label: "Imported to loans",      sublabel: "filtered + deduped at import time",       key: "imported_loans",       ownerKey: "imported_owners",                   divider: true },
    { label: "Active loans",           sublabel: "is_active = true",                        key: "after_active",         ownerKey: "after_active_owners" },
    { label: "Has state",              sublabel: "state IS NOT NULL",                       key: "after_state_not_null", ownerKey: "after_state_not_null_owners" },
    { label: "Not blocked state",      sublabel: "excl. CA NY NJ MN AZ NV ND SD VT IL",   key: "after_blocked_states", ownerKey: "after_blocked_states_owners" },
    { label: "Loan amount in range",   sublabel: "$500K – $10M",                           key: "after_loan_amount",    ownerKey: "after_loan_amount_owners" },
    { label: "Maturity in window",     sublabel: "60 – 365 days out",                      key: "after_maturity",       ownerKey: "after_maturity_owners" },
    { label: "Property type ok",       sublabel: "all filter rules passed",                 key: "qualified_loans",      ownerKey: "qualified_loans_owners",            divider: true },
    { label: "Skip-trace slots",
      sublabel: `${n(data.individual_slots)} unique people + ${n(data.ent_veil_pierced)} entity officer slots`,
      key: "total_slots", ownerKey: "total_slots_owners", color: "#b45309",
      sectionLabel: "Skip-trace pipeline", divider: true },
    { label: "Pending skip trace",     sublabel: "skip_trace_done = false",                 key: "pending_skip_trace",  ownerKey: "pending_skip_trace_owners", color: "#b45309" },
  ];

  return (
    <div className="mb-10 rounded-xl overflow-hidden" style={{ background: "#161b22", border: "1px solid #21262d" }}>
      {/* Header */}
      <div className="px-5 pt-4 pb-3 border-b flex items-start justify-between" style={{ borderColor: "#21262d" }}>
        <div>
          <div className="text-sm font-semibold flex items-center gap-2" style={{ color: "#e6edf3" }}>
            Filter Funnel
            {refreshing && <span className="text-xs font-normal" style={{ color: "#8b949e" }}>refreshing…</span>}
          </div>
          <div className="text-xs mt-0.5" style={{ color: "#8b949e" }}>
            {n(data.raw_capitalize)} raw → {n(data.pending_skip_trace)} pending skip trace
          </div>
        </div>
        {/* Column headers */}
        <div className="flex gap-3 text-right shrink-0">
          <div className="w-24"><div className="text-[10px] uppercase tracking-wider" style={{ color: "#484f58" }}>Loans</div></div>
          <div className="w-24"><div className="text-[10px] uppercase tracking-wider" style={{ color: "#484f58" }}>Unique owners</div></div>
          <div className="w-24"><div className="text-[10px] uppercase tracking-wider" style={{ color: "#484f58" }}>Removed</div></div>
        </div>
      </div>

      {/* Rows */}
      <div className="px-5 py-3">
        {rows.map((row, i) => {
          const prev = i > 0 && !row.sectionLabel ? data[rows[i - 1].key] as number : null;
          const count = data[row.key] as number;
          const ownerCount = row.ownerKey ? data[row.ownerKey] as number : undefined;
          const dropped = prev !== null ? prev - count : null;

          return (
            <div key={`${row.key}-${i}`}>
              {row.divider && i > 0 && (
                <div className="my-2 border-t" style={{ borderColor: "#21262d" }} />
              )}
              {row.sectionLabel && (
                <div className="mb-1 mt-0.5 text-[10px] uppercase tracking-wider font-semibold" style={{ color: "#30363d" }}>
                  {row.sectionLabel}
                </div>
              )}
              <FunnelRow
                label={row.label}
                sublabel={row.sublabel}
                count={count}
                ownerCount={ownerCount}
                dropped={dropped}
                maxCount={top}
                color={row.color ?? "#1f6feb"}
              />
            </div>
          );
        })}

        <OwnerWaterfall data={data} />
      </div>

      <div className="px-5 py-2 border-t text-xs" style={{ borderColor: "#21262d", color: "#484f58" }}>
        Funnel cached hourly via pg_cron. Slot counts reflect{" "}
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
      fetchFunnel(true);
    } else {
      setError((e) => ({ ...e, [rule.id]: "Save failed — try again" }));
    }
  }

  const byKey = Object.fromEntries(rules.map((r) => [r.rule_key, r]));
  const liveBlocked = byKey["blocked_states"]?.rule_value ?? "";
  const docBlocked = "CA,NY,NJ,MN,AZ,NV,ND,SD,VT,IL";
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
