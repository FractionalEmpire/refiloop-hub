"use client";
import { useEffect, useState } from "react";

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
  total_slots: number;
  pending_skip_trace: number;
};

type FunnelStep = {
  label: string;
  key: keyof FunnelData;
  sublabel?: string;
  divider?: boolean; // visual break before this row
};

const FUNNEL_STEPS: FunnelStep[] = [
  { label: "Raw Capitalize data", key: "raw_capitalize", sublabel: "raw_capitalize_scrape table" },
  { label: "Imported to loans table", key: "imported_loans", sublabel: "deduped by capitalize_id", divider: true },
  { label: "Active loans", key: "after_active", sublabel: "is_active = true" },
  { label: "Has state", key: "after_state_not_null", sublabel: "state IS NOT NULL" },
  { label: "Not blocked state", key: "after_blocked_states", sublabel: "excl. CA NY NJ MN AZ NV IL MA CT OR WA" },
  { label: "Loan amount in range", key: "after_loan_amount", sublabel: "$500K – $10M" },
  { label: "Maturity in window", key: "after_maturity", sublabel: "60 – 365 days out" },
  { label: "Property type ok", key: "qualified_loans", sublabel: "excluded types removed — qualified loans", divider: true },
  { label: "Skip-trace slots (all)", key: "total_slots", sublabel: "v_airtable_push — owners + entity officers" },
  { label: "Pending skip trace", key: "pending_skip_trace", sublabel: "skip_trace_done = false" },
];

const GROUPS: { label: string; keys: string[] }[] = [
  {
    label: "Lead Eligibility",
    keys: ["min_loan_amount", "max_loan_amount", "min_maturity_days", "max_maturity_days"],
  },
  {
    label: "Geography",
    keys: ["blocked_states"],
  },
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

function fmt(rule: FilterRule) {
  if (rule.data_type === "numeric") return `$${Number(rule.rule_value).toLocaleString()}`;
  if (rule.data_type === "integer") return `${rule.rule_value} days`;
  if (rule.data_type === "boolean") return rule.rule_value === "true" ? "Yes" : "No";
  return rule.rule_value;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function fmtNum(n: number) {
  return n.toLocaleString();
}

function FilterFunnel({ data }: { data: FunnelData }) {
  const top = data.raw_capitalize;

  return (
    <div className="mb-10 rounded-xl overflow-hidden" style={{ background: "#161b22", border: "1px solid #21262d" }}>
      <div className="px-5 pt-4 pb-3 border-b" style={{ borderColor: "#21262d" }}>
        <div className="text-sm font-semibold" style={{ color: "#e6edf3" }}>Filter Funnel</div>
        <div className="text-xs mt-0.5" style={{ color: "#8b949e" }}>
          How we get from {fmtNum(data.raw_capitalize)} raw records → {fmtNum(data.pending_skip_trace)} pending skip trace
        </div>
      </div>

      <div className="px-5 py-3 space-y-0.5">
        {FUNNEL_STEPS.map((step, i) => {
          const count = data[step.key];
          const prevStep = FUNNEL_STEPS[i - 1];
          const prevCount = prevStep ? data[prevStep.key] : null;
          const dropped = prevCount !== null ? prevCount - count : 0;
          const pct = top > 0 ? (count / top) * 100 : 0;

          // Determine bar color: getting smaller = dimmer blue; slot steps = amber
          const isSlotStep = step.key === "total_slots" || step.key === "pending_skip_trace";
          const barColor = isSlotStep ? "#b45309" : "#1f6feb";
          const barBg = isSlotStep ? "#271c0a" : "#0d1117";

          return (
            <div key={step.key}>
              {step.divider && i > 0 && (
                <div className="my-3 border-t" style={{ borderColor: "#21262d" }} />
              )}
              <div className="flex items-center gap-3 py-1.5">
                {/* Label */}
                <div className="w-52 shrink-0">
                  <div className="text-xs font-medium" style={{ color: "#e6edf3" }}>{step.label}</div>
                  {step.sublabel && (
                    <div className="text-xs" style={{ color: "#484f58" }}>{step.sublabel}</div>
                  )}
                </div>

                {/* Bar */}
                <div className="flex-1 rounded" style={{ background: barBg, height: 18 }}>
                  <div
                    className="h-full rounded transition-all duration-300"
                    style={{
                      width: `${Math.max(pct, 0.3)}%`,
                      background: barColor,
                      opacity: 0.85,
                    }}
                  />
                </div>

                {/* Count */}
                <div className="w-24 text-right shrink-0">
                  <span className="text-sm font-mono font-semibold" style={{ color: "#e6edf3" }}>
                    {fmtNum(count)}
                  </span>
                </div>

                {/* Dropped */}
                <div className="w-28 text-right shrink-0">
                  {dropped > 0 ? (
                    <span className="text-xs font-mono" style={{ color: "#f85149" }}>
                      −{fmtNum(dropped)}
                    </span>
                  ) : (
                    <span className="text-xs" style={{ color: "#484f58" }}>—</span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="px-5 py-2 border-t text-xs" style={{ borderColor: "#21262d", color: "#484f58" }}>
        Counts are live from Supabase. Slot counts reflect the current <code style={{ color: "#8b949e" }}>v_airtable_push</code> materialized view (refreshed daily at 06:00 UTC).
      </div>
    </div>
  );
}

export default function FiltersClient() {
  const [rules, setRules] = useState<FilterRule[]>([]);
  const [editing, setEditing] = useState<Record<number, string>>({});
  const [saving, setSaving] = useState<Record<number, boolean>>({});
  const [saved, setSaved] = useState<Record<number, boolean>>({});
  const [error, setError] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);
  const [funnel, setFunnel] = useState<FunnelData | null>(null);
  const [funnelError, setFunnelError] = useState(false);

  useEffect(() => {
    fetch("/api/filters")
      .then((r) => r.json())
      .then((data) => { setRules(data); setLoading(false); });

    fetch("/api/filters/funnel")
      .then((r) => r.json())
      .then((data) => {
        if (data.error) setFunnelError(true);
        else setFunnel(data);
      })
      .catch(() => setFunnelError(true));
  }, []);

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
      setRules((rs) => rs.map((r) => r.id === rule.id ? { ...r, rule_value: val, updated_at: new Date().toISOString(), updated_by: "refiloop-hub" } : r));
      setEditing((e) => { const n = { ...e }; delete n[rule.id]; return n; });
      setSaved((s) => ({ ...s, [rule.id]: true }));
      setTimeout(() => setSaved((s) => ({ ...s, [rule.id]: false })), 2000);
    } else {
      setError((e) => ({ ...e, [rule.id]: "Save failed — try again" }));
    }
  }

  const byKey = Object.fromEntries(rules.map((r) => [r.rule_key, r]));

  // Check for blocked_states discrepancy
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
      {funnel ? (
        <FilterFunnel data={funnel} />
      ) : funnelError ? (
        <div className="mb-8 p-3 rounded-lg text-sm border" style={{ background: "#161b22", borderColor: "#21262d", color: "#8b949e" }}>
          Could not load funnel counts.
        </div>
      ) : (
        <div className="mb-8 p-4 rounded-xl text-xs" style={{ background: "#161b22", border: "1px solid #21262d", color: "#484f58" }}>
          Loading funnel…
        </div>
      )}

      {/* Discrepancy warning */}
      {hasDiscrepancy && (
        <div className="mb-6 p-3 rounded-lg text-sm border" style={{ background: "#2d1f00", borderColor: "#9e6a03", color: "#e3b341" }}>
          ⚠️ <strong>Blocked states mismatch:</strong> The live DB value ({liveBlocked}) differs from what{" "}
          <code>LEAD_FILTERS.md</code> documents ({docBlocked}). The DB is the live source — update the doc or fix the DB value below.
        </div>
      )}

      {/* Groups */}
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
                            <span className="text-xs" style={{ color: "#484f58" }}>({fmt(rule)})</span>
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
