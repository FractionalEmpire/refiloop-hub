"use client";
import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type DocMeta = {
  path: string;
  label: string;
  group: string;
  exists: boolean;
  sha?: string;
};

const GROUP_ICONS: Record<string, string> = {
  Operations: "⚙️",
  Dialer: "📞",
  Data: "🗄️",
  Infrastructure: "🖥️",
  Onboarding: "👋",
  Requirements: "📋",
};

export default function DocsClient({ user }: { user: "david" | "gorjan" }) {
  const [docs, setDocs] = useState<DocMeta[]>([]);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [sha, setSha] = useState("");
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState("");
  const [loadingDoc, setLoadingDoc] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(["Operations", "Dialer", "Data", "Infrastructure", "Requirements", "Onboarding"]));

  const searchParams = useSearchParams();
  useEffect(() => {
    fetch("/api/docs").then((r) => r.json()).then(setDocs);
  }, []);

  useEffect(() => {
    const pathParam = searchParams.get("path");
    if (pathParam && docs.length > 0 && !selectedPath) openDoc(pathParam);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docs, searchParams]);

  async function openDoc(path: string) {
    setSelectedPath(path);
    setEditing(false);
    setSaveMsg("");
    setLoadingDoc(true);
    const res = await fetch(`/api/docs/content?path=${encodeURIComponent(path)}`);
    if (res.ok) {
      const data = await res.json();
      setContent(data.content);
      setSha(data.sha);
      setEditContent(data.content);
    } else {
      setContent("_File not found. Make sure `GITHUB_TOKEN` and `GITHUB_REPO=refiloop2` are set in Vercel environment variables._");
      setSha("");
    }
    setLoadingDoc(false);
  }

  async function saveDoc() {
    if (!selectedPath || !sha) return;
    setSaving(true);
    const res = await fetch("/api/docs/content", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        path: selectedPath,
        content: editContent,
        sha,
        message: `docs: update ${selectedPath} via RefiLoop Hub [${user}]`,
      }),
    });
    if (res.ok) {
      setContent(editContent);
      setSaveMsg("✓ Saved to GitHub");
      setEditing(false);
      const updated = await fetch(`/api/docs/content?path=${encodeURIComponent(selectedPath)}`);
      if (updated.ok) {
        const d = await updated.json();
        setSha(d.sha);
      }
    } else {
      setSaveMsg("✗ Save failed — check GITHUB_TOKEN env var in Vercel");
    }
    setSaving(false);
    setTimeout(() => setSaveMsg(""), 4000);
  }

  // Group docs
  const grouped = docs.reduce((acc, doc) => {
    if (!acc[doc.group]) acc[doc.group] = [];
    acc[doc.group].push(doc);
    return acc;
  }, {} as Record<string, DocMeta[]>);

  const groupOrder = ["Operations", "Dialer", "Data", "Infrastructure", "Requirements", "Onboarding"];

  function toggleGroup(g: string) {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      next.has(g) ? next.delete(g) : next.add(g);
      return next;
    });
  }

  const selectedDoc = docs.find((d) => d.path === selectedPath);

  return (
    <div className="flex h-screen">
      {/* Sidebar */}
      <div className="w-60 shrink-0 border-r flex flex-col" style={{ background: "#161b22", borderColor: "#30363d" }}>
        <div className="px-4 py-4 border-b" style={{ borderColor: "#30363d" }}>
          <h2 className="text-sm font-semibold" style={{ color: "#e6edf3" }}>Docs</h2>
          <p className="text-xs mt-0.5" style={{ color: "#8b949e" }}>refiloop2 repo · editable</p>
        </div>
        <div className="flex-1 overflow-y-auto py-2">
          {groupOrder.map((group) => {
            const groupDocs = grouped[group] || [];
            if (!groupDocs.length) return null;
            const isExpanded = expandedGroups.has(group);
            const foundCount = groupDocs.filter((d) => d.exists).length;
            return (
              <div key={group}>
                <button
                  onClick={() => toggleGroup(group)}
                  className="w-full flex items-center gap-2 px-4 py-2 text-left"
                  style={{ color: "#8b949e" }}
                >
                  <span className="text-xs">{GROUP_ICONS[group] || "📁"}</span>
                  <span className="text-xs font-semibold uppercase tracking-wide flex-1">{group}</span>
                  <span className="text-xs" style={{ color: "#484f58" }}>{foundCount}/{groupDocs.length}</span>
                  <span className="text-xs" style={{ color: "#484f58" }}>{isExpanded ? "▾" : "▸"}</span>
                </button>
                {isExpanded && groupDocs.map((doc) => (
                  <button
                    key={doc.path}
                    onClick={() => doc.exists && openDoc(doc.path)}
                    className="w-full text-left pl-8 pr-4 py-2 flex items-center gap-2 transition-colors"
                    style={{
                      background: selectedPath === doc.path ? "#21262d" : "transparent",
                      color: selectedPath === doc.path ? "#e6edf3" : doc.exists ? "#c9d1d9" : "#484f58",
                      cursor: doc.exists ? "pointer" : "default",
                    }}
                  >
                    <span className="text-xs shrink-0" style={{ color: doc.exists ? "#3fb950" : "#484f58" }}>
                      {doc.exists ? "●" : "○"}
                    </span>
                    <span className="text-xs truncate">{doc.label}</span>
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      </div>

      {/* Content pane */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {selectedPath && selectedDoc ? (
          <>
            {/* Toolbar */}
            <div
              className="flex items-center justify-between px-6 py-3 border-b shrink-0"
              style={{ background: "#161b22", borderColor: "#30363d" }}
            >
              <div className="flex items-center gap-3">
                <span className="text-xs font-semibold" style={{ color: "#e6edf3" }}>{selectedDoc.label}</span>
                <code className="text-xs px-1.5 py-0.5 rounded" style={{ background: "#21262d", color: "#8b949e" }}>{selectedPath}</code>
                {saveMsg && (
                  <span className="text-xs" style={{ color: saveMsg.startsWith("✓") ? "#3fb950" : "#f85149" }}>
                    {saveMsg}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {editing ? (
                  <>
                    <button
                      onClick={() => { setEditing(false); setEditContent(content); }}
                      className="px-3 py-1.5 rounded-md text-xs"
                      style={{ background: "#21262d", color: "#8b949e" }}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={saveDoc}
                      disabled={saving || !sha}
                      className="px-3 py-1.5 rounded-md text-xs font-semibold"
                      style={{ background: "#1f6feb", color: "#fff", opacity: (saving || !sha) ? 0.5 : 1 }}
                    >
                      {saving ? "Saving…" : "Save to GitHub"}
                    </button>
                  </>
                ) : (
                  <>
                    <a
                      href={`https://github.com/FractionalEmpire/refiloop2/blob/main/${selectedPath}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1.5 rounded-md text-xs"
                      style={{ background: "#21262d", color: "#8b949e" }}
                    >
                      ↗ GitHub
                    </a>
                    {sha && (
                      <button
                        onClick={() => { setEditing(true); setEditContent(content); }}
                        className="px-3 py-1.5 rounded-md text-xs font-semibold"
                        style={{ background: "#21262d", color: "#e6edf3" }}
                      >
                        ✎ Edit
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>

            {loadingDoc ? (
              <div className="flex-1 flex items-center justify-center">
                <p className="text-sm" style={{ color: "#484f58" }}>Loading…</p>
              </div>
            ) : editing ? (
              <div className="flex-1 flex overflow-hidden">
                <div className="flex-1 flex flex-col border-r" style={{ borderColor: "#30363d" }}>
                  <div className="px-4 py-2 border-b text-xs" style={{ color: "#484f58", borderColor: "#30363d" }}>Editor</div>
                  <textarea
                    className="flex-1 p-5 text-sm font-mono outline-none resize-none"
                    style={{ background: "#0d1117", color: "#e6edf3", lineHeight: "1.7" }}
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    spellCheck={false}
                  />
                </div>
                <div className="flex-1 flex flex-col overflow-hidden">
                  <div className="px-4 py-2 border-b text-xs" style={{ color: "#484f58", borderColor: "#30363d" }}>Preview</div>
                  <div className="flex-1 overflow-y-auto p-6">
                    <div className="markdown-body prose prose-invert max-w-none text-sm">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{editContent}</ReactMarkdown>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto p-8">
                <div className="max-w-3xl prose prose-invert prose-sm">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center max-w-sm">
              <p className="text-2xl mb-3">📄</p>
              <p className="text-sm font-medium mb-1" style={{ color: "#e6edf3" }}>Select a document</p>
              <p className="text-xs" style={{ color: "#484f58" }}>
                Docs are read from the <code style={{ color: "#8b949e" }}>refiloop2</code> GitHub repo.
                Requires <code style={{ color: "#8b949e" }}>GITHUB_TOKEN</code> in Vercel env vars.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
