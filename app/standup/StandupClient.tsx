"use client";
import { useEffect, useState, useCallback } from "react";

type StandupRecord = {
  id: string;
  date: string;
  agenda: string;
  for_gorjan: string;
  for_david: string;
  updated_at: string;
};

function today() {
  return new Date().toISOString().split("T")[0];
}

function fmtDate(d: string) {
  return new Date(d + "T12:00:00").toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}

type Section = "agenda" | "for_gorjan" | "for_david";

export default function StandupClient({ user }: { user: "david" | "gorjan" }) {
  const [records, setRecords] = useState<StandupRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<Section | null>(null);
  const [savedFlash, setSavedFlash] = useState<Section | null>(null);

  const [todayAgenda, setTodayAgenda] = useState("");
  const [todayForGorjan, setTodayForGorjan] = useState("");
  const [todayForDavid, setTodayForDavid] = useState("");
  const todayStr = today();

  const load = useCallback(() => {
    fetch("/api/standup?limit=7")
      .then((r) => r.json())
      .then((data: StandupRecord[]) => {
        setRecords(data);
        const rec = data.find((r) => r.date === todayStr);
        if (rec) {
          setTodayAgenda(rec.agenda ?? "");
          setTodayForGorjan(rec.for_gorjan ?? "");
          setTodayForDavid(rec.for_david ?? "");
        }
        setLoading(false);
      });
  }, [todayStr]);

  useEffect(() => { load(); }, [load]);

  async function save(section: Section, value: string) {
    setSaving(section);
    const patch: Record<string, string> = { date: todayStr };
    patch.agenda = section === "agenda" ? value : todayAgenda;
    patch.for_gorjan = section === "for_gorjan" ? value : todayForGorjan;
    patch.for_david = section === "for_david" ? value : todayForDavid;

    await fetch("/api/standup", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    setSaving(null);
    setSavedFlash(section);
    setTimeout(() => setSavedFlash(null), 1800);

    setRecords((prev) => {
      const existing = prev.find((r) => r.date === todayStr);
      const ts = new Date().toISOString();
      if (existing) {
        return prev.map((r) => r.date === todayStr ? { ...r, ...patch, updated_at: ts } : r);
      }
      const newRec: StandupRecord = {
        id: "",
        date: todayStr,
        agenda: patch.agenda ?? "",
        for_gorjan: patch.for_gorjan ?? "",
        for_david: patch.for_david ?? "",
        updated_at: ts,
      };
      return [newRec, ...prev];
    });
  }

  const isGorjan = user === "gorjan";

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64" style={{ color: "#8b949e" }}>
        Loading standup...
      </div>
    );
  }

  const pastRecords = records.filter((r) => r.date !== todayStr);

  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      <div className="mb-6">
        <h1 className="text-xl font-semibold mb-1" style={{ color: "#e6edf3" }}>Daily Standup</h1>
        <p className="text-sm" style={{ color: "#8b949e" }}>
          {fmtDate(todayStr)} &mdash; shared between David and Gorjan
        </p>
      </div>

      <div className="rounded-xl border mb-8" style={{ background: "#161b22", borderColor: "#30363d" }}>
        <div className="px-5 py-3 border-b flex items-center justify-between" style={{ borderColor: "#21262d" }}>
          <span className="text-sm font-semibold" style={{ color: "#e6edf3" }}>Today</span>
          <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "#238636", color: "#fff" }}>Live</span>
        </div>

        <div className="p-5 space-y-5">
          <TextSection
            label="Meeting Agenda"
            placeholder="Topics to cover today..."
            value={todayAgenda}
            onChange={setTodayAgenda}
            onSave={(v) => save("agenda", v)}
            saving={saving === "agenda"}
            saved={savedFlash === "agenda"}
            editable={true}
          />

          <TextSection
            label={isGorjan ? "From David" : "For Gorjan"}
            placeholder={isGorjan ? "David has not added anything yet." : "Context, blockers, decisions Gorjan needs to know..."}
            value={todayForGorjan}
            onChange={setTodayForGorjan}
            onSave={(v) => save("for_gorjan", v)}
            saving={saving === "for_gorjan"}
            saved={savedFlash === "for_gorjan"}
            editable={!isGorjan}
            readonlyHint={isGorjan ? "Updated by David" : undefined}
          />

          <TextSection
            label={isGorjan ? "For David" : "From Gorjan"}
            placeholder={isGorjan ? "Updates, blockers, questions for David..." : "Gorjan has not added anything yet."}
            value={todayForDavid}
            onChange={setTodayForDavid}
            onSave={(v) => save("for_david", v)}
            saving={saving === "for_david"}
            saved={savedFlash === "for_david"}
            editable={isGorjan}
            readonlyHint={isGorjan ? undefined : "Updated by Gorjan"}
          />
        </div>
      </div>

      {pastRecords.length > 0 && (
        <div>
          <div
            className="text-xs font-semibold uppercase tracking-wider mb-3"
            style={{ color: "#484f58" }}
          >
            Previous Days
          </div>
          <div className="space-y-3">
            {pastRecords.map((rec) => (
              <PastRecord key={rec.date} rec={rec} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function TextSection({
  label, placeholder, value, onChange, onSave, saving, saved, editable, readonlyHint,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  onSave: (v: string) => void;
  saving: boolean;
  saved: boolean;
  editable: boolean;
  readonlyHint?: string;
}) {
  const [draft, setDraft] = useState(value);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setDraft(value);
  }, [value, focused]);

  const dirty = draft !== value;

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: "#8b949e" }}>
          {label}
        </label>
        {editable && dirty && (
          <button
            onClick={() => { onChange(draft); onSave(draft); }}
            disabled={saving}
            className="text-xs px-3 py-1 rounded font-medium"
            style={{ background: "#238636", color: "#fff", opacity: saving ? 0.6 : 1 }}
          >
            {saving ? "Saving..." : "Save"}
          </button>
        )}
        {saved && !dirty && (
          <span className="text-xs" style={{ color: "#3fb950" }}>Saved</span>
        )}
        {readonlyHint && (
          <span className="text-xs" style={{ color: "#484f58" }}>{readonlyHint}</span>
        )}
      </div>
      {editable ? (
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => { setFocused(false); if (dirty) { onChange(draft); onSave(draft); } }}
          placeholder={placeholder}
          rows={3}
          className="w-full text-sm rounded-lg px-3 py-2 resize-none"
          style={{
            background: "#0d1117",
            border: `1px solid ${focused ? "#58a6ff44" : "#21262d"}`,
            color: "#e6edf3",
            outline: "none",
          }}
        />
      ) : (
        <div
          className="text-sm rounded-lg px-3 py-2 min-h-16"
          style={{
            background: "#0d1117",
            border: "1px solid #21262d",
            color: value ? "#c9d1d9" : "#484f58",
            whiteSpace: "pre-wrap",
          }}
        >
          {value || placeholder}
        </div>
      )}
    </div>
  );
}

function PastRecord({ rec }: { rec: StandupRecord }) {
  const [open, setOpen] = useState(false);
  const hasContent = rec.agenda || rec.for_gorjan || rec.for_david;

  return (
    <div className="rounded-lg border" style={{ background: "#161b22", borderColor: "#21262d" }}>
      <button
        className="w-full text-left px-4 py-3 flex items-center justify-between"
        onClick={() => setOpen(!open)}
      >
        <span className="text-sm" style={{ color: "#c9d1d9" }}>{fmtDate(rec.date)}</span>
        <div className="flex items-center gap-3">
          {!hasContent && <span className="text-xs" style={{ color: "#484f58" }}>empty</span>}
          <span className="text-xs" style={{ color: "#484f58" }}>{open ? "v" : ">"}</span>
        </div>
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-3 border-t" style={{ borderColor: "#21262d" }}>
          {rec.agenda && (
            <div className="pt-3">
              <div className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: "#484f58" }}>Agenda</div>
              <p className="text-sm" style={{ color: "#c9d1d9", whiteSpace: "pre-wrap" }}>{rec.agenda}</p>
            </div>
          )}
          {rec.for_gorjan && (
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: "#484f58" }}>For Gorjan</div>
              <p className="text-sm" style={{ color: "#c9d1d9", whiteSpace: "pre-wrap" }}>{rec.for_gorjan}</p>
            </div>
          )}
          {rec.for_david && (
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: "#484f58" }}>For David</div>
              <p className="text-sm" style={{ color: "#c9d1d9", whiteSpace: "pre-wrap" }}>{rec.for_david}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
