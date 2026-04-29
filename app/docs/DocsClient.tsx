"use client";
import { useState, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type DocMeta = {
  path: string;
  label: string;
  exists: boolean;
  sha?: string;
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

  useEffect(() => {
    fetch("/api/docs").then((r) => r.json()).then(setDocs);
  }, []);

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
      setContent("_File not found in GitHub repo._");
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
      // Re-fetch to get new SHA
      const updated = await fetch(`/api/docs/content?path=${encodeURIComponent(selectedPath)}`);
      if (updated.ok) {
        const d = await updated.json();
        setSha(d.sha);
      }
    } else {
      setSaveMsg("✗ Save failed — check GitHub token");
    }
    setSaving(false);
    setTimeout(() => setSaveMsg(""), 3000);
  }

  const selectedDoc = docs.find((d) => d.path === selectedPath);

  return (
    <div className="flex h-screen" style={{ marginLeft: 0 }}>
      {/* File list */}
      <div
        className="w-56 shrink-0 border-r flex flex-col"
        style={{ background: "#161b22", borderColor: "#30363d" }}
      >
        <div className="px-4 py-4 border-b" style={{ borderColor: "#30363d" }}>
          <h2 className="text-sm font-semibold" style={{ color: "#e6edf3" }}>Docs</h2>
          <p className="text-xs mt-0.5" style={{ color: "#8b949e" }}>GitHub: refiloop-config</p>
        </div>
        <div className="flex-1 overflow-y-auto py-2">
          {docs.map((doc) => (
            <button
              key={doc.path}
              onClick={() => openDoc(doc.path)}
              className="w-full text-left px-4 py-2.5 flex items-center gap-2 transition-colors"
              style={{
                background: selectedPath === doc.path ? "#21262d" : "transparent",
                color: selectedPath === doc.path ? "#e6edf3" : "#8b949e",
              }}
            >
              <span className="text-xs">📄</span>
              <div className="min-w-0">
                <p className="text-xs font-medium truncate">{doc.label}</p>
                <p className="text-xs" style={{ color: doc.exists ? "#3fb950" : "#f85149" }}>
                  {doc.exists ? "exists" : "not found"}
                </p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Content pane */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {selectedPath ? (
          <>
            {/* Toolbar */}
            <div
              className="flex items-center justify-between px-6 py-3 border-b shrink-0"
              style={{ background: "#161b22", borderColor: "#30363d" }}
            >
              <div className="flex items-center gap-3">
                <code className="text-xs" style={{ color: "#8b949e" }}>{selectedPath}</code>
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
                      disabled={saving}
                      className="px-3 py-1.5 rounded-md text-xs font-semibold"
                      style={{ background: "#1f6feb", color: "#fff", opacity: saving ? 0.6 : 1 }}
                    >
                      {saving ? "Saving…" : "Save to GitHub"}
                    </button>
                  </>
                ) : (
                  <>
                    <a
                      href={`https://github.com/${process.env.NEXT_PUBLIC_GITHUB_OWNER || "FractionalEmpire"}/refiloop-config/blob/main/${selectedPath}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1.5 rounded-md text-xs"
                      style={{ background: "#21262d", color: "#8b949e" }}
                    >
                      ↗ GitHub
                    </a>
                    <button
                      onClick={() => { setEditing(true); setEditContent(content); }}
                      className="px-3 py-1.5 rounded-md text-xs font-semibold"
                      style={{ background: "#21262d", color: "#e6edf3" }}
                    >
                      ✎ Edit
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Content */}
            {loadingDoc ? (
              <div className="flex-1 flex items-center justify-center">
                <p className="text-sm" style={{ color: "#484f58" }}>Loading…</p>
              </div>
            ) : editing ? (
              <div className="flex-1 flex overflow-hidden">
                {/* Editor */}
                <div className="flex-1 flex flex-col border-r" style={{ borderColor: "#30363d" }}>
                  <div className="px-4 py-2 border-b text-xs" style={{ color: "#484f58", borderColor: "#30363d" }}>
                    Editor
                  </div>
                  <textarea
                    className="flex-1 p-5 text-sm font-mono outline-none resize-none"
                    style={{ background: "#0d1117", color: "#e6edf3", lineHeight: "1.7" }}
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    spellCheck={false}
                  />
                </div>
                {/* Preview */}
                <div className="flex-1 flex flex-col overflow-hidden">
                  <div className="px-4 py-2 border-b text-xs" style={{ color: "#484f58", borderColor: "#30363d" }}>
                    Preview
                  </div>
                  <div className="flex-1 overflow-y-auto p-6">
                    <div className="markdown-body">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{editContent}</ReactMarkdown>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto p-8">
                <div className="max-w-3xl markdown-body">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <p className="text-sm" style={{ color: "#484f58" }}>Select a document to view</p>
              <p className="text-xs mt-2" style={{ color: "#30363d" }}>Documents are read from GitHub</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
