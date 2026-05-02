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

// Words to skip when tokenizing scan results — short words and common first/last name components
const SKIP_WORDS = new Set([
  "THE","AND","OF","A","AN","IN","AT","BY","FOR","TO","OR","DE","LA","EL","LOS","LAS","DBA",
  "JR","SR","II","III","IV","MR","MRS","DR","EST","ETAL","ET","AL","C/O",
]);

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

  // Scan state
  const [showScan, setShowScan] = useState(false);
  const [scanNames, setScanNames] = useState<{ id: number; name: string }[]>([]);
  const [scanning, setScanning] = useState(false);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/entity-patterns");
    const data = await res.json();
    setPatterns(Array.isArray(data) ? data : []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function handleScan() {
    if (scanning) return;
    setScanning(true);
    setScanNames([]);
    const res = await fetch("/api/entity-patterns/scan?limit=200&min_length=18");
    const data = await res.json();
    setScanNames(Array.isArray(data) ? data : []);
    setScanning(false);
    setShowScan(true);
  }

  function pickWord(word: string) {
    setForm((f) => ({ ...f, pattern: word }));
    setShowAdd(true);
    setShowScan(false);
  }

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
        <div className="flex gap-2 shrink-0">
          <button
            onClick={handleScan}
            disabled={scanning}
            className="text-sm px-3 py-2 rounded-md font-medium"
            style={{ background: "#21262d", color: "#8b949e", border: "1px solid #30363d", opacity: scanning ? 0.6 : 1 }}
          >
            {scanning ? "Scanning…" : "🔍 Scan DB"}
          </button>
          <button
            onClick={() => { setShowAdd((v) => !v); setAddError(""); setShowScan(false); }}
            className="text-sm px-4 py-2 rounded-md font-medium"
            style={{ background: "#238636", color: "#fff" }}
          >
            + Add Pattern
          </button>
        </div>
      </div>

      {/* Scan panel */}
      {showScan && scanNames.length > 0 && (
        <div className="mb-6 rounded-lg border" style={{ background: "#0d1117", borderColor: "#30363d" }}>
          <div className="flex items-center justify-between px-4 py-2 border-b" style={{ borderColor: "#21262d" }}>
            <span className="text-xs font-semibold" style={{ color: "#8b949e" }}>
              LONGEST INDIVIDUAL NAMES — {scanNames.length} results · click a word to add as pattern
            </span>
            <button onClick={() => setShowScan(false)} className="text-xs" style={{ color: "#484f58" }}>✕</button>
          </div>
          <div className="overflow-y-auto" style={{ maxHeight: "22rem" }}>
            {scanNames.map((row) => {
              const knownPatterns = new Set(patterns.map((p) => p.pattern));
              const words = row.name.split(/\s+/).filter((w) => w.length >= 3 && !SKIP_WORDS.has(w.toUpperCase()));
              return (
                <div key={row.id} className="px-4 py-2 border-b flex items-baseline gap-2 flex-wrap" style={{ borderColor: "#161b22" }}>
                  <span className="text-xs shrink-0" style={{ color: "#484f58", minWidth: "2rem" }}>{row.name.length}</span>
                  {words.map((w, i) => {
                    const up = w.toUpperCase();
                    const known = knownPatterns.has(up);
                    return (
                      <button
                        key={i}
                        onClick={() => !known && pickWord(up)}
                        disabled={known}
                        className="text-xs font-mono px-1.5 py-0.5 rounded"
                        style={{
                          background: known ? "#161b22" : "#21262d",
                          color: known ? "#484f58" : "#e6edf3",
                          border: `1px solid ${known ? "#1c2128" : "#30363d"}`,
                          cursor: known ? "default" : "pointer",
                          textDecoration: known ? "line-through" : "none",
                        }}
                        title={known ? `"${up}" already in patterns` : `Add "${up}" as pattern`}
                      >
                        {w}
                      </button>
                    );
                  })}
                  {words.length === 0 && (
                    <span className="text-xs font-mono" style={{ color: "#484f58" }}>{row.name}</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Add form */}
      {showAdd && (
        <div
          className="mb-6 p-4 rounded-lg border"
          style={{ background: "#161b22", borderColor: "#58a6ff44" }}
        >
          <div className="flex gap-2 items-center">
            <input
              autoFocus
              value={form.pattern}
              onChange={(e) => setForm((f) => ({ ...f, pattern: e.target.value }))}
              placeholder="Pattern (e.g. LLC, CHURCH)"
              className="flex-1 text-sm rounded px-3 py-2 font-mono"
              style={{ background: "#0d1117", border: "1px solid #30363d", color: "#e6edf3" }}
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            />
            <select
              value={form.action}
              onChange={(e) => setForm((f) => ({ ...f, action: e.target.value as Pattern["action"] }))}
              className="text-sm rounded px-2 py-2"
              style={{ background: "#0d1117", border: "1px solid #30363d", color: "#e6edf3" }}
            >
              <option value="sos_lookup">SOS Lookup</option>
              <option value="exclude">Exclude</option>
              <option value="flag_for_review">Flag</option>
            </select>
            <button
              onClick={handleAdd}
              disabled={adding}
              className="text-sm px-4 py-2 rounded font-medium shrink-0"
              style={{ background: "#238636", color: "#fff", opacity: adding ? 0.6 : 1 }}
            >
              {adding ? "…" : "Add"}
            </button>
            <button
              onClick={() => { setShowAdd(false); setForm(BLANK_FORM); setAddError(""); }}
              className="text-sm px-3 py-2 rounded shrink-0"
              style={{ background: "#21262d", color: "#8b949e" }}
            >
              ✕
            </button>
          </div>
          {addError && <div className="text-xs mt-2" style={{ color: "#f85149" }}>{addError}</div>}
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
