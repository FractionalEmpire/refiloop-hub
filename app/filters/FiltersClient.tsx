"use client";
import { useEffect, useRef, useState } from "react";

type FilterRule = {
  id: number;
  rule_key: string;
  rule_value: string;
  data_type: string;
  description: string;
  updated_at: string;
  updated_by: string;
};

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

type BusinessTerm = {
  id: number;
  term: string;
  created_at: string;
  created_by: string;
};

type PreviewResult = {
  count: number;
  truncated: boolean;
  names: { id: number; name: string }[];
  term: string;
};

function BusinessTermsSection() {
  const [terms, setTerms] = useState<BusinessTerm[]>([]);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState("");
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState("");
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/business-terms")
      .then((r) => r.json())
      .then((d) => { setTerms(Array.isArray(d) ? d : []); setLoading(false); });
  }, []);

  const trimmed = input.trim();
  const isDuplicate = terms.some((t) => t.term.toLowerCase() === trimmed.toLowerCase());
  const canAdd = trimmed.length > 0 && !isDuplicate;
  const previewStale = preview !== null && preview.term !== trimmed;

  async function handlePreview() {
    if (!trimmed) return;
    setPreviewing(true);
    setPreview(null);
    const r = await fetch(`/api/business-terms/preview?term=${encodeURIComponent(trimmed)}`);
    const d = await r.json();
    setPreviewing(false);
    if (r.ok) setPreview({ ...d, term: trimmed });
  }

  async function handleAdd() {
    if (!canAdd) return;
    setAdding(true);
    setAddError("");
    const r = await fetch("/api/business-terms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ term: trimmed }),
    });
    setAdding(false);
    if (r.ok) {
      const d = await r.json();
      setTerms((ts) => [...ts, Array.isArray(d) ? d[0] : d]);
      setInput("");
      setPreview(null);
    } else {
      const d = await r.json().catch(() => ({})) as Record<string, unknown>;
      setAddError((d.error as string) ?? "Add failed");
    }
  }

  async function handleDelete(t: BusinessTerm) {
    setDeletingId(t.id);
    await fetch("/api/business-terms", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: t.id, term: t.term }),
    });
    setTerms((ts) => ts.filter((x) => x.id !== t.id));
    setDeletingId(null);
  }

  const isWordBoundary = trimmed.startsWith("_");
  const effectiveTerm = isWordBoundary ? trimmed.slice(1) : trimmed;

  return (
    <div className="mb-8">
      <div
        className="text-xs font-semibold uppercase tracking-wider mb-3 pb-2 border-b"
        style={{ color: "#8b949e", borderColor: "#21262d" }}
      >
        Business Terms
      </div>

      <p className="text-xs mb-4" style={{ color: "#8b949e" }}>
        Keyword terms that flag borrower names as entities instead of individuals.
        Preview first to check for false positives before adding.
        <br />
        <code style={{ color: "#58a6ff" }}>_Land</code> (underscore prefix) uses strict word-boundary matching —
        catches <span style={{ color: "#3fb950" }}>LAND GROUP</span> but
        not <span style={{ color: "#f85149" }}>HOLLANDER</span>.
        Without <code style={{ color: "#58a6ff" }}>_</code>, matches any name where the term starts a word
        (e.g. <code style={{ color: "#58a6ff" }}>develop</code> →
        DEVELOPER, DEVELOPMENT, DEVELOP GROUP).
      </p>

      {/* Input row */}
      <div className="flex gap-2 mb-2">
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => { setInput(e.target.value); setAddError(""); }}
          onKeyDown={(e) => { if (e.key === "Enter") handlePreview(); }}
          placeholder="_Land  or  develop"
          className="text-sm rounded px-3 py-1.5 font-mono flex-1"
          style={{
            background: "#0d1117",
            border: `1px solid ${isDuplicate && trimmed ? "#f85149" : "#30363d"}`,
            color: "#e6edf3",
            minWidth: 0,
          }}
        />
        <button
          onClick={handlePreview}
          disabled={!trimmed || previewing}
          className="text-xs px-3 py-1.5 rounded shrink-0"
          style={{
            background: trimmed && !previewing ? "#21262d" : "#161b22",
            color: trimmed && !previewing ? "#e6edf3" : "#484f58",
            border: "1px solid #30363d",
            cursor: trimmed && !previewing ? "pointer" : "default",
          }}
        >
          {previewing ? "…" : "Preview"}
        </button>
        <button
          onClick={handleAdd}
          disabled={!canAdd || adding}
          className="text-xs px-3 py-1.5 rounded font-medium shrink-0"
          style={{
            background: canAdd && !adding ? "#238636" : "#161b22",
            color: canAdd && !adding ? "#fff" : "#484f58",
            border: "1px solid transparent",
            cursor: canAdd && !adding ? "pointer" : "default",
          }}
        >
          {adding ? "Adding…" : "Add"}
        </button>
      </div>

      {/* Inline validation */}
      {isDuplicate && trimmed && (
        <div className="text-xs mb-2" style={{ color: "#f85149" }}>
          "{trimmed}" is already in the list
        </div>
      )}
      {addError && (
        <div className="text-xs mb-2" style={{ color: "#f85149" }}>{addError}</div>
      )}

      {/* Match mode hint */}
      {trimmed && !isDuplicate && (
        <div className="text-xs mb-3" style={{ color: "#484f58" }}>
          {isWordBoundary
            ? <>Exact word match: <code style={{ color: "#58a6ff" }}>{`\\m${effectiveTerm.toUpperCase()}\\M`}</code> — will NOT match names where {effectiveTerm.toUpperCase()} is embedded mid-word</>
            : <>Word-start match: <code style={{ color: "#58a6ff" }}>{`\\m${effectiveTerm.toUpperCase()}`}</code> — will match any name starting with {effectiveTerm.toUpperCase()}</>
          }
        </div>
      )}

      {/* Preview panel */}
      {(preview || previewing) && (
        <div
          className="rounded-lg p-3 mb-4"
          style={{ background: "#0d1117", border: "1px solid #21262d" }}
        >
          {previewing ? (
            <div className="text-xs" style={{ color: "#8b949e" }}>Querying owners…</div>
          ) : preview ? (
            <>
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <span className="text-xs font-medium" style={{ color: "#e6edf3" }}>
                  Preview: <code style={{ color: "#58a6ff" }}>{preview.term}</code>
                </span>
                <span
                  className="text-xs px-2 py-0.5 rounded-full font-medium"
                  style={{
                    background:
                      preview.count === 0 ? "#161b22"
                      : preview.count > 100 ? "#2d1f00"
                      : "#0d2818",
                    color:
                      preview.count === 0 ? "#484f58"
                      : preview.count > 100 ? "#e3b341"
                      : "#3fb950",
                  }}
                >
                  {preview.count === 0
                    ? "0 matches"
                    : `${preview.count}${preview.truncated ? "+" : ""} individual${preview.count !== 1 ? "s" : ""} would be reclassified`}
                </span>
                {previewStale && (
                  <span className="text-xs" style={{ color: "#484f58" }}>
                    · stale — re-run Preview for current input
                  </span>
                )}
              </div>

              {preview.names.length > 0 && (
                <div
                  className="overflow-y-auto"
                  style={{ maxHeight: "12rem", borderTop: "1px solid #21262d", paddingTop: "0.5rem" }}
                >
                  {preview.names.map((n) => (
                    <div key={n.id} className="text-xs font-mono py-0.5" style={{ color: "#8b949e" }}>
                      {n.name}
                    </div>
                  ))}
                  {preview.truncated && (
                    <div className="text-xs pt-1" style={{ color: "#484f58" }}>
                      … showing first 200 only
                    </div>
                  )}
                </div>
              )}

              {preview.count === 0 && (
                <div className="text-xs mt-1" style={{ color: "#484f58" }}>
                  No individual owners currently match this term.
                </div>
              )}
            </>
          ) : null}
        </div>
      )}

      {/* Active terms */}
      <div className="mt-2">
        {loading ? (
          <div className="text-xs" style={{ color: "#484f58" }}>Loading…</div>
        ) : terms.length === 0 ? (
          <div className="text-xs" style={{ color: "#484f58" }}>No business terms yet.</div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {terms.map((t) => (
              <div
                key={t.id}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono"
                style={{
                  background: "#161b22",
                  border: "1px solid #30363d",
                  color: t.term.startsWith("_") ? "#58a6ff" : "#e6edf3",
                  opacity: deletingId === t.id ? 0.4 : 1,
                }}
              >
                {t.term}
                <button
                  onClick={() => handleDelete(t)}
                  disabled={deletingId === t.id}
                  className="leading-none"
                  style={{ color: "#484f58", fontSize: "0.85em" }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = "#f85149")}
                  onMouseLeave={(e) => (e.currentTarget.style.color = "#484f58")}
                  title="Remove term"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function fmt(rule: FilterRule) {
  if (rule.data_type === "numeric") return `$${Number(rule.rule_value).toLocaleString()}`;
  if (rule.data_type === "integer") return `${rule.rule_value} days`;
  if (rule.data_type === "boolean") return rule.rule_value === "true" ? "Yes" : "No";
  return rule.rule_value;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function FiltersClient() {
  const [rules, setRules] = useState<FilterRule[]>([]);
  const [editing, setEditing] = useState<Record<number, string>>({});
  const [saving, setSaving] = useState<Record<number, boolean>>({});
  const [saved, setSaved] = useState<Record<number, boolean>>({});
  const [error, setError] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/filters")
      .then((r) => r.json())
      .then((data) => { setRules(data); setLoading(false); });
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

      {/* Discrepancy warning */}
      {hasDiscrepancy && (
        <div className="mb-6 p-3 rounded-lg text-sm border" style={{ background: "#2d1f00", borderColor: "#9e6a03", color: "#e3b341" }}>
          ⚠️ <strong>Blocked states mismatch:</strong> The live DB value ({liveBlocked}) differs from what{" "}
          <code>LEAD_FILTERS.md</code> documents ({docBlocked}). The DB is the live source — update the doc or fix the DB value below.
        </div>
      )}

      {/* Entity Classifier — Business Terms */}
      <BusinessTermsSection />

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
