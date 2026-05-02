"use client";
import { useEffect, useState } from "react";

type Pattern = {
  id: number;
  pattern: string;
  action: "exclude" | "sos_lookup" | "flag_for_review";
  category: string;
  match_type: "contains" | "exact";
  active: boolean;
  notes: string | null;
};

const ACTION_LABELS: Record<string, string> = {
  exclude: "Exclude (not a borrower)",
  sos_lookup: "SOS Lookup (treat as entity)",
  flag_for_review: "Flag for Review",
};

const ACTION_COLORS: Record<string, string> = {
  exclude: "#f85149",
  sos_lookup: "#58a6ff",
  flag_for_review: "#e3b341",
};

const ACTION_BG: Record<string, string> = {
  exclude: "#3d1a1a",
  sos_lookup: "#1a2a3d",
  flag_for_review: "#3d2d00",
};

const BLANK_FORM = {
  pattern: "",
  action: "sos_lookup" as Pattern["action"],
  category: "entity_suffix",
  match_type: "contains" as Pattern["match_type"],
  notes: "",
};

function fmtBadge(action: string) {
  return (
    <span
      className="text-xs px-2 py-0.5 rounded-full font-medium"
      style={{ background: ACTION_BG[action], color: ACTION_COLORS[action] }}
    >
      {ACTION_LABELS[action] ?? action}
    </span>
  );
}

export default function EntityPatternsClient() {
  const [patterns, setPatterns] = useState<Pattern[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(BLANK_FORM);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState("");
  const [deleting, setDeleting] = useState<Record<number, boolean>>({});
  const [toggling, setToggling] = useState<Record<number, boolean>>({});
  const [search, setSearch] = useState("");
  const [filterAction, setFilterAction] = useState<"all" | Pattern["action"]>("all");

  async function load() {
    setLoading(true);
    const res = await fetch("/api/entity-patterns");
    const data = await res.json();
    setPatterns(Array.isArray(data) ? data : []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function handleAdd() {
    if (!form.pattern.trim()) { setAddError("Pattern is required"); return; }
    setAdding(true);
    setAddError("");
    const res = await fetch("/api/entity-patterns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setAdding(false);
    if (res.ok) {
      setForm(BLANK_FORM);
      setShowAdd(false);
      load();
    } else {
      const err = await res.json();
      setAddError(err.error?.includes("unique") ? "Pattern already exists" : "Save failed — try again");
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("Delete this pattern?")) return;
    setDeleting((d) => ({ ...d, [id]: true }));
    await fetch(`/api/entity-patterns?id=${id}`, { method: "DELETE" });
    setPatterns((ps) => ps.filter((p) => p.id !== id));
    setDeleting((d) => { const n = { ...d }; delete n[id]; return n; });
  }

  async function handleToggle(p: Pattern) {
    setToggling((t) => ({ ...t, [p.id]: true }));
    const res = await fetch("/api/entity-patterns", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: p.id, active: !p.active }),
    });
    setToggling((t) => { const n = { ...t }; delete n[p.id]; return n; });
    if (res.ok) {
      setPatterns((ps) => ps.map((x) => x.id === p.id ? { ...x, active: !p.active } : x));
    }
  }

  const visible = patterns.filter((p) => {
    if (filterAction !== "all" && p.action !== filterAction) return false;
    if (search && !p.pattern.includes(search.toUpperCase())) return false;
    return true;
  });

  // Group by action
  const groups = (["sos_lookup", "exclude", "flag_for_review"] as const).map((action) => ({
    action,
    rows: visible.filter((p) => p.action === action),
  })).filter((g) => g.rows.length > 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64" style={{ color: "#8b949e" }}>
        Loading patterns…
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold mb-1" style={{ color: "#e6edf3" }}>Entity Name Patterns</h1>
          <p className="text-sm" style={{ color: "#8b949e" }}>
            Keywords used to classify owner names as entities vs. individuals.
            Stored in Supabase <code style={{ color: "#58a6ff" }}>owner_name_patterns</code>.
            Changes take effect on the next classifier run.
          </p>
        </div>
        <button
          onClick={() => { setShowAdd((v) => !v); setAddError(""); }}
          className="text-sm px-4 py-2 rounded-md font-medium shrink-0"
          style={{ background: "#238636", color: "#fff" }}
        >
          + Add Pattern
        </button>
      </div>

      {/* Add form */}
      {showAdd && (
        <div
          className="mb-6 p-4 rounded-lg border"
          style={{ background: "#161b22", borderColor: "#58a6ff44" }}
        >
          <div className="text-sm font-medium mb-3" style={{ color: "#e6edf3" }}>New Pattern</div>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="text-xs mb-1 block" style={{ color: "#8b949e" }}>Pattern (auto-uppercased)</label>
              <input
                value={form.pattern}
                onChange={(e) => setForm((f) => ({ ...f, pattern: e.target.value }))}
                placeholder="e.g. LLC"
                className="w-full text-sm rounded px-2 py-1.5 font-mono"
                style={{ background: "#0d1117", border: "1px solid #30363d", color: "#e6edf3" }}
                onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              />
            </div>
            <div>
              <label className="text-xs mb-1 block" style={{ color: "#8b949e" }}>Action</label>
              <select
                value={form.action}
                onChange={(e) => setForm((f) => ({ ...f, action: e.target.value as Pattern["action"] }))}
                className="w-full text-sm rounded px-2 py-1.5"
                style={{ background: "#0d1117", border: "1px solid #30363d", color: "#e6edf3" }}
              >
                <option value="sos_lookup">SOS Lookup (entity)</option>
                <option value="exclude">Exclude (not a borrower)</option>
                <option value="flag_for_review">Flag for Review</option>
              </select>
            </div>
            <div>
              <label className="text-xs mb-1 block" style={{ color: "#8b949e" }}>Category</label>
              <select
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                className="w-full text-sm rounded px-2 py-1.5"
                style={{ background: "#0d1117", border: "1px solid #30363d", color: "#e6edf3" }}
              >
                <option value="entity_suffix">Entity Suffix</option>
                <option value="business_activity">Business Activity</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label className="text-xs mb-1 block" style={{ color: "#8b949e" }}>Match Type</label>
              <select
                value={form.match_type}
                onChange={(e) => setForm((f) => ({ ...f, match_type: e.target.value as Pattern["match_type"] }))}
                className="w-full text-sm rounded px-2 py-1.5"
                style={{ background: "#0d1117", border: "1px solid #30363d", color: "#e6edf3" }}
              >
                <option value="contains">Contains (word boundary)</option>
                <option value="exact">Exact match</option>
              </select>
            </div>
          </div>
          <div className="mb-3">
            <label className="text-xs mb-1 block" style={{ color: "#8b949e" }}>Notes (optional)</label>
            <input
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              placeholder="Why was this added?"
              className="w-full text-sm rounded px-2 py-1.5"
              style={{ background: "#0d1117", border: "1px solid #30363d", color: "#e6edf3" }}
            />
          </div>
          {addError && <div className="text-xs mb-2" style={{ color: "#f85149" }}>{addError}</div>}
          <div className="flex gap-2">
            <button
              onClick={handleAdd}
              disabled={adding}
              className="text-xs px-3 py-1.5 rounded font-medium"
              style={{ background: "#238636", color: "#fff", opacity: adding ? 0.6 : 1 }}
            >
              {adding ? "Saving…" : "Save Pattern"}
            </button>
            <button
              onClick={() => { setShowAdd(false); setForm(BLANK_FORM); setAddError(""); }}
              className="text-xs px-3 py-1.5 rounded"
              style={{ background: "#21262d", color: "#8b949e" }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3 mb-5">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search patterns…"
          className="text-sm rounded px-3 py-1.5 flex-1"
          style={{ background: "#161b22", border: "1px solid #30363d", color: "#e6edf3" }}
        />
        <select
          value={filterAction}
          onChange={(e) => setFilterAction(e.target.value as typeof filterAction)}
          className="text-sm rounded px-3 py-1.5"
          style={{ background: "#161b22", border: "1px solid #30363d", color: "#8b949e" }}
        >
          <option value="all">All actions ({patterns.length})</option>
          <option value="sos_lookup">SOS Lookup ({patterns.filter((p) => p.action === "sos_lookup").length})</option>
          <option value="exclude">Exclude ({patterns.filter((p) => p.action === "exclude").length})</option>
          <option value="flag_for_review">Flag for Review ({patterns.filter((p) => p.action === "flag_for_review").length})</option>
        </select>
      </div>

      {/* Pattern groups */}
      {groups.length === 0 && (
        <div className="text-sm py-12 text-center" style={{ color: "#484f58" }}>
          No patterns match your filters.
        </div>
      )}

      {groups.map(({ action, rows }) => (
        <div key={action} className="mb-8">
          <div
            className="text-xs font-semibold uppercase tracking-wider mb-3 pb-2 border-b flex items-center gap-2"
            style={{ color: "#8b949e", borderColor: "#21262d" }}
          >
            {fmtBadge(action)}
            <span>{rows.length} patterns</span>
          </div>

          <div className="flex flex-wrap gap-2">
            {rows.map((p) => (
              <div
                key={p.id}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-sm font-mono group"
                style={{
                  background: p.active ? "#161b22" : "#0d1117",
                  border: `1px solid ${p.active ? "#30363d" : "#1c2128"}`,
                  color: p.active ? "#e6edf3" : "#484f58",
                  opacity: p.active ? 1 : 0.5,
                }}
                title={p.notes ?? `${p.category} · ${p.match_type}`}
              >
                <span>{p.pattern}</span>
                <span className="text-xs" style={{ color: "#484f58" }}>
                  {p.match_type === "exact" ? "==" : "~"}
                </span>

                {/* toggle active */}
                <button
                  onClick={() => handleToggle(p)}
                  disabled={toggling[p.id]}
                  title={p.active ? "Disable" : "Enable"}
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-xs ml-0.5"
                  style={{ color: p.active ? "#8b949e" : "#3fb950" }}
                >
                  {toggling[p.id] ? "…" : p.active ? "◉" : "○"}
                </button>

                {/* delete */}
                <button
                  onClick={() => handleDelete(p.id)}
                  disabled={deleting[p.id]}
                  title="Delete"
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-xs"
                  style={{ color: "#8b949e" }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = "#f85149")}
                  onMouseLeave={(e) => (e.currentTarget.style.color = "#8b949e")}
                >
                  {deleting[p.id] ? "…" : "×"}
                </button>
              </div>
            ))}
          </div>
        </div>
      ))}

      <div className="mt-4 text-xs" style={{ color: "#484f58" }}>
        Hover a pattern to toggle active/disable or delete it. The classifier uses word-boundary regex matching — "CORP" won&apos;t match "CORPORATION" unless both are listed.
      </div>
    </div>
  );
}
