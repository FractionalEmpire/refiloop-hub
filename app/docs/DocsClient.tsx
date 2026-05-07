"use client";
import { useState, useEffect, useRef, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type DocMeta = {
  path: string;
  label: string;
  group: string;
  tags?: string[];
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
  Memory: "🧠",
};

const GROUP_COLORS: Record<string, string> = {
  Operations: "#1f6feb",
  Dialer: "#388bfd",
  Data: "#3fb950",
  Infrastructure: "#d29922",
  Requirements: "#f78166",
  Onboarding: "#bc8cff",
  Memory: "#8b949e",
};

const MEMORY_SUBGROUP_ORDER = ["Index", "User", "Feedback", "Project", "Reference", "Other"];
const MEMORY_SUBGROUP_ICONS: Record<string, string> = {
  Index: "📋",
  User: "👤",
  Feedback: "💬",
  Project: "🚀",
  Reference: "🔗",
  Other: "📁",
};

function getMemorySubgroup(path: string): string {
  const name = path.split("/").pop() || "";
  if (name === "MEMORY.md") return "Index";
  if (name.startsWith("user_")) return "User";
  if (name.startsWith("feedback_")) return "Feedback";
  if (name.startsWith("project_")) return "Project";
  if (name.startsWith("reference_")) return "Reference";
  return "Other";
}

const TOP_GROUP_ORDER = ["Memory", "Operations", "Dialer", "Data", "Infrastructure", "Requirements", "Onboarding"];

function daysSince(isoDate: string): number {
  return Math.floor((Date.now() - new Date(isoDate).getTime()) / 86400000);
}

function stalenessColor(days: number): string {
  if (days < 30) return "#3fb950";
  if (days < 90) return "#d29922";
  return "#f85149";
}

function stalenessLabel(days: number): string {
  if (days < 1) return "Updated today";
  if (days === 1) return "Updated yesterday";
  if (days < 30) return `Updated ${days}d ago`;
  if (days < 60) return `Updated ~${Math.round(days / 7)}w ago`;
  if (days < 365) return `Updated ~${Math.round(days / 30)}mo ago`;
  return `Updated ~${Math.round(days / 365)}y ago`;
}

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
  const [lastCommit, setLastCommit] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<string>("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTags, setActiveTags] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<"list" | "all" | "ask">("list");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    new Set(["Memory", "Operations", "Dialer", "Data", "Infrastructure", "Requirements", "Onboarding",
             "Index", "User", "Feedback", "Project", "Reference"])
  );

  // Chat state
  type ChatMessage = { role: "user" | "assistant"; content: string };
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const chatBottomRef = useRef<HTMLDivElement>(null);

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
    setLastCommit(null);
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
    fetch(`/api/docs/last-commit?path=${encodeURIComponent(path)}`)
      .then((r) => r.json())
      .then((d) => setLastCommit(d.date ?? null))
      .catch(() => null);
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

  function toggleGroup(g: string) {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      next.has(g) ? next.delete(g) : next.add(g);
      return next;
    });
  }

  function toggleTag(tag: string) {
    setActiveTags((prev) => {
      const next = new Set(prev);
      next.has(tag) ? next.delete(tag) : next.add(tag);
      return next;
    });
  }

  async function askDocs(question: string) {
    if (!question.trim() || chatLoading) return;
    const userMsg: ChatMessage = { role: "user", content: question };
    setChatMessages((prev) => [...prev, userMsg]);
    setChatInput("");
    setChatLoading(true);

    const filter = {
      group: activeFilter !== "All" ? activeFilter : undefined,
      tags: activeTags.size > 0 ? Array.from(activeTags) : undefined,
    };

    let assistantContent = "";
    setChatMessages((prev) => [...prev, { role: "assistant", content: "" }]);

    try {
      const res = await fetch("/api/docs/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, filter }),
      });

      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({ error: "Request failed" }));
        setChatMessages((prev) => [
          ...prev.slice(0, -1),
          { role: "assistant", content: `Error: ${err.error}` },
        ]);
        setChatLoading(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        for (const line of chunk.split("\n")) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (data === "[DONE]") break;
          try {
            const parsed = JSON.parse(data);
            if (parsed.type === "content_block_delta" && parsed.delta?.type === "text_delta") {
              assistantContent += parsed.delta.text;
              setChatMessages((prev) => [
                ...prev.slice(0, -1),
                { role: "assistant", content: assistantContent },
              ]);
            }
          } catch { /* skip non-JSON lines */ }
        }
      }
    } catch (e) {
      setChatMessages((prev) => [
        ...prev.slice(0, -1),
        { role: "assistant", content: `Error: ${e instanceof Error ? e.message : "Unknown error"}` },
      ]);
    }
    setChatLoading(false);
    setTimeout(() => chatBottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
  }

  // All unique tags from static (non-Memory) docs
  const allTags = useMemo(() => {
    const set = new Set<string>();
    docs.filter((d) => d.group !== "Memory").forEach((d) => d.tags?.forEach((t) => set.add(t)));
    return Array.from(set).sort();
  }, [docs]);

  // Available top-level groups for filter pills
  const presentGroups = TOP_GROUP_ORDER.filter((g) => docs.some((d) => d.group === g));

  // Apply all filters: group pill + search + tags
  const filteredDocs = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return docs.filter((doc) => {
      const matchesGroup = activeFilter === "All" || doc.group === activeFilter;
      const matchesSearch =
        !q ||
        doc.label.toLowerCase().includes(q) ||
        doc.group.toLowerCase().includes(q) ||
        doc.tags?.some((t) => t.toLowerCase().includes(q)) ||
        doc.path.toLowerCase().includes(q);
      const matchesTags =
        activeTags.size === 0 ||
        doc.tags?.some((t) => activeTags.has(t));
      return matchesGroup && matchesSearch && matchesTags;
    });
  }, [docs, activeFilter, searchQuery, activeTags]);

  // Grouped for list view
  const grouped = useMemo(() =>
    filteredDocs.reduce((acc, doc) => {
      if (!acc[doc.group]) acc[doc.group] = [];
      acc[doc.group].push(doc);
      return acc;
    }, {} as Record<string, DocMeta[]>),
    [filteredDocs]
  );

  const selectedDoc = docs.find((d) => d.path === selectedPath);
  const isFiltering = searchQuery.trim() !== "" || activeTags.size > 0;

  function renderMemoryGroup(memoryDocs: DocMeta[]) {
    const subgrouped: Record<string, DocMeta[]> = {};
    for (const doc of memoryDocs) {
      const sg = getMemorySubgroup(doc.path);
      if (!subgrouped[sg]) subgrouped[sg] = [];
      subgrouped[sg].push(doc);
    }
    if (subgrouped["Index"]) {
      subgrouped["Index"].sort((a, b) => {
        if (a.path.endsWith("MEMORY.md")) return -1;
        if (b.path.endsWith("MEMORY.md")) return 1;
        return a.label.localeCompare(b.label);
      });
    }
    return MEMORY_SUBGROUP_ORDER
      .filter((sg) => subgrouped[sg]?.length)
      .map((sg) => {
        const sgDocs = subgrouped[sg];
        const isExpanded = expandedGroups.has(sg);
        return (
          <div key={sg}>
            <button
              onClick={() => toggleGroup(sg)}
              className="w-full flex items-center gap-2 pl-6 pr-4 py-1.5 text-left"
              style={{ color: "#6e7681" }}
            >
              <span className="text-xs">{MEMORY_SUBGROUP_ICONS[sg]}</span>
              <span className="text-xs font-medium uppercase tracking-wide flex-1" style={{ fontSize: "10px" }}>{sg}</span>
              <span className="text-xs" style={{ color: "#30363d", fontSize: "10px" }}>{sgDocs.length}</span>
              <span className="text-xs" style={{ color: "#30363d" }}>{isExpanded ? "▾" : "▸"}</span>
            </button>
            {isExpanded && sgDocs.map((doc) => (
              <button
                key={doc.path}
                onClick={() => doc.exists && openDoc(doc.path)}
                className="w-full text-left pl-12 pr-4 py-1.5 flex items-center gap-2 transition-colors"
                style={{
                  background: selectedPath === doc.path ? "#21262d" : "transparent",
                  color: selectedPath === doc.path ? "#e6edf3" : doc.exists ? "#c9d1d9" : "#484f58",
                  cursor: doc.exists ? "pointer" : "default",
                }}
              >
                <span className="text-xs shrink-0" style={{ color: doc.exists ? "#3fb950" : "#484f58" }}>●</span>
                <span className="text-xs truncate">{doc.label}</span>
              </button>
            ))}
          </div>
        );
      });
  }

  return (
    <div className="flex h-screen">
      {/* Sidebar */}
      <div className="w-64 shrink-0 border-r flex flex-col" style={{ background: "#161b22", borderColor: "#30363d" }}>
        {/* Header */}
        <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: "#30363d" }}>
          <div>
            <h2 className="text-sm font-semibold" style={{ color: "#e6edf3" }}>Docs</h2>
            <p className="text-xs mt-0.5" style={{ color: "#8b949e" }}>refiloop2 · editable</p>
          </div>
          <div className="flex gap-1">
            <button
              onClick={() => setViewMode(viewMode === "all" ? "list" : "all")}
              className="px-2 py-1 rounded text-xs"
              style={{
                background: viewMode === "all" ? "#1f6feb" : "#21262d",
                color: viewMode === "all" ? "#fff" : "#8b949e",
              }}
              title="Show all docs as flat table"
            >
              ⊞
            </button>
            <button
              onClick={() => setViewMode(viewMode === "ask" ? "list" : "ask")}
              className="px-2 py-1 rounded text-xs"
              style={{
                background: viewMode === "ask" ? "#1f6feb" : "#21262d",
                color: viewMode === "ask" ? "#fff" : "#8b949e",
              }}
              title="Ask questions across docs"
            >
              💬
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="px-3 pt-2 pb-1">
          <input
            type="text"
            placeholder="Search docs…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-3 py-1.5 rounded text-xs outline-none"
            style={{ background: "#21262d", color: "#e6edf3", border: "1px solid #30363d" }}
          />
        </div>

        {/* Tag chips — only shown when not filtering by a specific group */}
        {allTags.length > 0 && (activeFilter === "All" || activeFilter !== "Memory") && (
          <div className="px-3 pb-2 flex flex-wrap gap-1">
            {allTags.map((tag) => (
              <button
                key={tag}
                onClick={() => toggleTag(tag)}
                className="px-2 py-0.5 rounded-full text-xs transition-colors"
                style={{
                  background: activeTags.has(tag) ? "#1f6feb" : "#21262d",
                  color: activeTags.has(tag) ? "#fff" : "#8b949e",
                  border: `1px solid ${activeTags.has(tag) ? "#388bfd" : "#30363d"}`,
                  fontSize: "10px",
                }}
              >
                {tag}
              </button>
            ))}
            {activeTags.size > 0 && (
              <button
                onClick={() => setActiveTags(new Set())}
                className="px-2 py-0.5 rounded-full text-xs"
                style={{ color: "#8b949e", fontSize: "10px" }}
              >
                ✕ clear
              </button>
            )}
          </div>
        )}

        {/* Filter pills */}
        <div className="px-3 py-2 border-b flex flex-wrap gap-1" style={{ borderColor: "#30363d" }}>
          {["All", ...presentGroups].map((g) => (
            <button
              key={g}
              onClick={() => { setActiveFilter(g); setActiveTags(new Set()); }}
              className="px-2 py-0.5 rounded text-xs transition-colors"
              style={{
                background: activeFilter === g ? "#1f6feb" : "#21262d",
                color: activeFilter === g ? "#fff" : "#8b949e",
                fontSize: "10px",
              }}
            >
              {g === "Memory" ? "🧠 Memory" : g}
            </button>
          ))}
        </div>

        {isFiltering && (
          <p className="px-4 py-1 text-xs" style={{ color: "#484f58" }}>
            {filteredDocs.filter((d) => d.exists).length} docs
          </p>
        )}

        {/* Doc list */}
        <div className="flex-1 overflow-y-auto py-1">
          {viewMode === "all" ? (
            // Flat table view
            <div>
              {filteredDocs.filter((d) => d.exists).length === 0 && (
                <p className="px-4 py-3 text-xs" style={{ color: "#484f58" }}>No docs match.</p>
              )}
              {filteredDocs.filter((d) => d.exists).map((doc) => (
                <button
                  key={doc.path}
                  onClick={() => openDoc(doc.path)}
                  className="w-full text-left px-4 py-2 border-b transition-colors"
                  style={{
                    background: selectedPath === doc.path ? "#21262d" : "transparent",
                    borderColor: "#21262d",
                  }}
                >
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="text-xs shrink-0" style={{ color: "#3fb950" }}>●</span>
                    <span className="text-xs truncate font-medium" style={{ color: selectedPath === doc.path ? "#e6edf3" : "#c9d1d9" }}>
                      {doc.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 pl-4 flex-wrap">
                    <span
                      className="px-1.5 py-0 rounded"
                      style={{
                        background: "#21262d",
                        color: GROUP_COLORS[doc.group] || "#8b949e",
                        fontSize: "9px",
                      }}
                    >
                      {doc.group}
                    </span>
                    {doc.tags?.map((t) => (
                      <span key={t} style={{ color: "#484f58", fontSize: "9px" }}>{t}</span>
                    ))}
                  </div>
                </button>
              ))}
            </div>
          ) : (
            // Grouped list view
            TOP_GROUP_ORDER.filter((g) => grouped[g]?.length).map((group) => {
              const groupDocs = grouped[group];
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
                  {isExpanded && (
                    group === "Memory"
                      ? renderMemoryGroup(groupDocs)
                      : groupDocs.map((doc) => (
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
                        ))
                  )}
                </div>
              );
            })
          )}
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
              <div className="flex items-center gap-3 min-w-0 flex-wrap">
                <span className="text-xs font-semibold shrink-0" style={{ color: "#e6edf3" }}>{selectedDoc.label}</span>
                <code className="text-xs px-1.5 py-0.5 rounded shrink-0" style={{ background: "#21262d", color: "#8b949e" }}>{selectedPath}</code>
                {selectedDoc.tags && selectedDoc.tags.length > 0 && (
                  <div className="flex gap-1 shrink-0">
                    {selectedDoc.tags.map((t) => (
                      <span key={t} className="px-1.5 py-0 rounded-full" style={{ background: "#21262d", color: "#8b949e", border: "1px solid #30363d", fontSize: "10px" }}>
                        {t}
                      </span>
                    ))}
                  </div>
                )}
                {lastCommit && (
                  <span className="text-xs shrink-0" style={{ color: stalenessColor(daysSince(lastCommit)) }}>
                    {stalenessLabel(daysSince(lastCommit))}
                  </span>
                )}
                {saveMsg && (
                  <span className="text-xs shrink-0" style={{ color: saveMsg.startsWith("✓") ? "#3fb950" : "#f85149" }}>
                    {saveMsg}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
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
        ) : viewMode === "ask" ? (
          // Chat panel
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Chat header */}
            <div className="px-6 py-3 border-b shrink-0 flex items-center gap-3" style={{ background: "#161b22", borderColor: "#30363d" }}>
              <span className="text-sm font-semibold" style={{ color: "#e6edf3" }}>💬 Ask your docs</span>
              <span className="text-xs px-2 py-0.5 rounded" style={{ background: "#21262d", color: "#8b949e" }}>
                {activeFilter === "All" && activeTags.size === 0
                  ? "All static docs in context"
                  : activeFilter !== "All"
                  ? `${activeFilter} docs in context`
                  : `Filtered by: ${Array.from(activeTags).join(", ")}`}
              </span>
              {chatMessages.length > 0 && (
                <button
                  onClick={() => setChatMessages([])}
                  className="text-xs ml-auto"
                  style={{ color: "#484f58" }}
                >
                  Clear
                </button>
              )}
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {chatMessages.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
                  <p className="text-sm" style={{ color: "#8b949e" }}>Ask anything about your docs</p>
                  <div className="flex flex-col gap-2 w-full max-w-md">
                    {[
                      "How does the daily Mojo push work?",
                      "What's the process for skip tracing a new lead?",
                      "How do I get into the VPS?",
                    ].map((q) => (
                      <button
                        key={q}
                        onClick={() => askDocs(q)}
                        className="px-4 py-2 rounded-lg text-sm text-left transition-colors"
                        style={{ background: "#21262d", color: "#c9d1d9", border: "1px solid #30363d" }}
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {chatMessages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div
                    className="max-w-2xl rounded-lg px-4 py-3 text-sm"
                    style={
                      msg.role === "user"
                        ? { background: "#1f6feb", color: "#fff" }
                        : { background: "#21262d", color: "#e6edf3", border: "1px solid #30363d" }
                    }
                  >
                    {msg.role === "assistant" ? (
                      <div className="prose prose-invert prose-sm max-w-none">
                        {msg.content
                          ? <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                          : <span style={{ color: "#484f58" }}>▍</span>
                        }
                      </div>
                    ) : (
                      msg.content
                    )}
                  </div>
                </div>
              ))}
              <div ref={chatBottomRef} />
            </div>

            {/* Input */}
            <div className="px-6 py-4 border-t shrink-0" style={{ borderColor: "#30363d", background: "#161b22" }}>
              <form
                onSubmit={(e) => { e.preventDefault(); askDocs(chatInput); }}
                className="flex gap-2"
              >
                <input
                  type="text"
                  placeholder="Ask a question about your docs…"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  disabled={chatLoading}
                  className="flex-1 px-4 py-2 rounded-lg text-sm outline-none"
                  style={{ background: "#21262d", color: "#e6edf3", border: "1px solid #30363d" }}
                />
                <button
                  type="submit"
                  disabled={chatLoading || !chatInput.trim()}
                  className="px-4 py-2 rounded-lg text-sm font-semibold"
                  style={{ background: "#1f6feb", color: "#fff", opacity: (chatLoading || !chatInput.trim()) ? 0.5 : 1 }}
                >
                  {chatLoading ? "…" : "Ask"}
                </button>
              </form>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center max-w-sm">
              <p className="text-2xl mb-3">📄</p>
              <p className="text-sm font-medium mb-1" style={{ color: "#e6edf3" }}>Select a document</p>
              <p className="text-xs" style={{ color: "#484f58" }}>
                Search or filter by tag above, then click any doc to open it.
                Edits save directly to the <code style={{ color: "#8b949e" }}>refiloop2</code> GitHub repo.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
