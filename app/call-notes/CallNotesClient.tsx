"use client";
import { useState, useEffect } from "react";
import { format, formatDistanceToNow } from "date-fns";

type CallNote = {
  id: string; date: string; content: string; source: string;
  commitments: string | null; decisions: string | null; action_items: string | null;
  created_at: string;
};

const SECTION_META = [
  { key: "commitments" as const, label: "Commitments", icon: "🤝", color: "#3fb950", bg: "#3fb95012" },
  { key: "decisions" as const, label: "Decisions Made", icon: "⚖️", color: "#d29922", bg: "#d2992212" },
  { key: "action_items" as const, label: "Action Items", icon: "✅", color: "#58a6ff", bg: "#58a6ff12" },
];

function notMentioned(v: string | null | undefined) { return !v || v.trim().toLowerCase() === "not mentioned."; }

export default function CallNotesClient({ user }: { user: "david" | "gorjan" }) {
  const [notes, setNotes] = useState<CallNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [pulling, setPulling] = useState(false);
  const [pullMsg, setPullMsg] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [content, setContent] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [posting, setPosting] = useState(false);

  useEffect(() => {
    fetch("/api/call-notes").then((r) => r.json()).then((d) => {
      setNotes(Array.isArray(d) ? d : []);
      setLoading(false);
    });
  }, []);

  async function pullFromEmail() {
    setPulling(true); setPullMsg(null);
    const res = await fetch("/api/call-notes/pull-email", { method: "POST" });
    const data = await res.json();
    if (data.error) { setPullMsg("Error: " + data.error); }
    else if (data.imported === 0) { setPullMsg(data.message ?? "No new call notes found."); }
    else {
      setPullMsg("Imported " + data.imported + " note" + (data.imported > 1 ? "s" : "") + ".");
      const fresh = await fetch("/api/call-notes").then((r) => r.json());
      setNotes(Array.isArray(fresh) ? fresh : []);
    }
    setPulling(false);
  }

  async function runAnalysis() {
    setAnalyzing(true); setAnalysis(null);
    const res = await fetch("/api/call-notes/analyze", { method: "POST" });
    const data = await res.json();
    setAnalysis(data.error ? "Error: " + data.error : data.analysis);
    setAnalyzing(false);
  }

  async function postNote() {
    if (!content.trim()) return;
    setPosting(true);
    const res = await fetch("/api/call-notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date, content }),
    });
    const note = await res.json();
    setNotes((prev) => [note, ...prev]);
    setContent(""); setShowForm(false); setPosting(false);
  }
  return (
    <div className="p-8 max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold" style={{ color: "#e6edf3" }}>Call Notes</h1>
          <p className="text-sm mt-0.5" style={{ color: "#8b949e" }}>Daily call notes with Gorjan + alignment analysis</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={pullFromEmail} disabled={pulling}
            className="px-3 py-2 rounded-md text-sm font-medium flex items-center gap-1.5"
            style={{ background: "#21262d", border: "1px solid #30363d", color: "#e6edf3", opacity: pulling ? 0.7 : 1 }}>
            <span>{pulling ? "" : "📧"}</span>{pulling ? "Pulling…" : "Pull from Email"}
          </button>
          <button onClick={runAnalysis} disabled={analyzing}
            className="px-3 py-2 rounded-md text-sm font-medium flex items-center gap-1.5"
            style={{ background: analyzing ? "#21262d" : "#6e40c912", border: "1px solid #6e40c9", color: "#bc8cff", opacity: analyzing ? 0.7 : 1 }}>
            <span>{analyzing ? "" : "🔍"}</span>{analyzing ? "Analyzing…" : "Analyze vs EODs"}
          </button>
          <button onClick={() => setShowForm(!showForm)}
            className="px-4 py-2 rounded-md text-sm font-semibold"
            style={{ background: "#1f6feb", color: "#fff" }}>
            {showForm ? "Cancel" : "+ Add Notes"}
          </button>
        </div>
      </div>

      {pullMsg && (
        <div className="mb-4 px-3 py-2 rounded-md text-sm"
          style={{ background: pullMsg.startsWith("Error") ? "#f8514912" : "#3fb95012",
            border: "1px solid " + (pullMsg.startsWith("Error") ? "#f85149" : "#3fb950") + "30",
            color: pullMsg.startsWith("Error") ? "#f85149" : "#3fb950" }}>{pullMsg}</div>
      )}

      {analysis && (
        <div className="mb-6 rounded-xl border p-5" style={{ background: "#161b22", borderColor: "#6e40c9" }}>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-base">🔍</span>
            <span className="text-sm font-semibold" style={{ color: "#bc8cff" }}>Alignment Analysis</span>
            <button onClick={() => setAnalysis(null)} className="ml-auto text-xs" style={{ color: "#484f58" }}>✕ Close</button>
          </div>
          <pre className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: "#c9d1d9", fontFamily: "inherit" }}>{analysis}</pre>
        </div>
      )}

      {showForm && (
        <div className="rounded-xl border p-5 mb-6" style={{ background: "#161b22", borderColor: "#30363d" }}>
          <div className="space-y-3">
            <div>
              <label className="block text-xs mb-1.5" style={{ color: "#8b949e" }}>Date</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
                className="px-3 py-2 rounded-md text-sm outline-none"
                style={{ background: "#0d1117", border: "1px solid #30363d", color: "#e6edf3" }} />
            </div>
            <div>
              <label className="block text-xs mb-1.5" style={{ color: "#8b949e" }}>Call notes *</label>
              <textarea className="w-full px-3 py-2.5 rounded-md text-sm outline-none resize-none"
                style={{ background: "#0d1117", border: "1px solid #30363d", color: "#e6edf3" }}
                rows={6} placeholder="Paste or type your notes from today's call with Gorjan…"
                value={content} onChange={(e) => setContent(e.target.value)} />
            </div>
            <button onClick={postNote} disabled={posting || !content.trim()}
              className="w-full py-2.5 rounded-md text-sm font-semibold"
              style={{ background: "#1f6feb", color: "#fff", opacity: posting || !content.trim() ? 0.6 : 1 }}>
              {posting ? "Saving…" : "Save Notes"}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-sm" style={{ color: "#484f58" }}>Loading…</div>
      ) : notes.length === 0 ? (
        <div className="rounded-xl border p-10 text-center" style={{ background: "#161b22", borderColor: "#30363d" }}>
          <p className="text-sm" style={{ color: "#484f58" }}>No call notes yet. Pull from email or add manually.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {notes.map((n) => {
            const isParsed = n.source === "email" && (n.commitments || n.decisions || n.action_items);
            return (
              <div key={n.id} className="rounded-xl border" style={{ background: "#161b22", borderColor: "#30363d" }}>
                <div className="flex items-center gap-2.5 px-5 pt-4 pb-3 border-b" style={{ borderColor: "#21262d" }}>
                  <span className="text-base">📞</span>
                  <div className="flex-1">
                    <span className="text-sm font-semibold" style={{ color: "#e6edf3" }}>
                      {format(new Date(n.date + "T12:00:00"), "MMM d, yyyy")}
                    </span>
                    {n.source === "email" && (
                      <span className="ml-2 text-xs px-1.5 py-0.5 rounded" style={{ background: "#1a7f3730", color: "#3fb950", fontSize: "10px" }}>from email</span>
                    )}
                    <span className="text-xs ml-2" style={{ color: "#484f58" }}>
                      {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                    </span>
                  </div>
                </div>
                {isParsed ? (
                  <div className="divide-y" style={{ borderColor: "#21262d" }}>
                    {SECTION_META.map(({ key, label, icon, color, bg }) => {
                      const val = n[key];
                      return (
                        <div key={key} className="px-5 py-3">
                          <div className="flex items-center gap-1.5 mb-1">
                            <span>{icon}</span>
                            <span className="text-xs font-semibold uppercase tracking-wide" style={{ color }}>{label}</span>
                          </div>
                          {notMentioned(val) ? (
                            <p className="text-xs italic" style={{ color: "#484f58" }}>Not mentioned</p>
                          ) : (
                            <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: "#c9d1d9" }}>{val}</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="px-5 py-4">
                    <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: "#c9d1d9" }}>{n.content}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
            }
