"use client";
import { useEffect, useState, useRef } from "react";
import Link from "next/link";

type ReqDoc = { label: string; path: string };

const PROJECT_DOCS: Record<string, ReqDoc[]> = {
  "Skip Trace": [
    { label: "Entity vs Human",   path: "docs/REQ-entity-vs-human.md" },
    { label: "Skip Trace Tabs",   path: "docs/REQ-skip-trace-tabs.md" },
    { label: "Error Display",     path: "docs/REQ-skip-trace-error-display.md" },
  ],
  "Dialer": [
    { label: "Mojo Daily Push",   path: "docs/REQ-mojo-daily-push.md" },
    { label: "Mojo Results Pull", path: "docs/REQ-mojo-results-pull.md" },
  ],
};

type ProjectData = {
  name: string;
  is_done: boolean;
  tasks: { id: string; title: string; status: string; priority: string; assignee: string }[];
  counts: { todo: number; in_progress: number; blocked: number; done: number };
};

const STATUS_COLOR: Record<string, string> = {
  todo: "#8b949e", in_progress: "#58a6ff", blocked: "#f85149", done: "#3fb950",
};
const PRIORITY_COLOR: Record<string, string> = {
  p0: "#f85149", p1: "#d29922", p2: "#58a6ff", later: "#484f58",
};

function statusBadge(label: string, count: number, color: string) {
  if (count === 0) return null;
  return (
    <span key={label} className="text-xs px-2 py-0.5 rounded-full font-medium"
      style={{ background: `${color}20`, color, border: `1px solid ${color}40` }}>
      {count} {label.replace("_", " ")}
    </span>
  );
}

function getHealth(counts: ProjectData["counts"]) {
  if (counts.blocked > 0) return { label: "Blocked", color: "#f85149" };
  if (counts.in_progress > 0) return { label: "Active", color: "#3fb950" };
  if (counts.done > 0 && counts.todo === 0) return { label: "Complete", color: "#8b949e" };
  return { label: "Queued", color: "#d29922" };
}

function ProjectCard({
  proj,
  expanded,
  onToggle,
  onMarkDone,
  onRename,
}: {
  proj: ProjectData;
  expanded: boolean;
  onToggle: () => void;
  onMarkDone: (done: boolean) => void;
  onRename: (newName: string) => void;
}) {
  const health = getHealth(proj.counts);
  const total = proj.tasks.length;
  const pct = total > 0 ? Math.round((proj.counts.done / total) * 100) : 0;
  const docs = PROJECT_DOCS[proj.name] ?? [];

  const [renaming, setRenaming] = useState(false);
  const [renameVal, setRenameVal] = useState(proj.name);
  const [renaming_saving, setRenameSaving] = useState(false);
  const renameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (renaming) {
      setRenameVal(proj.name);
      setTimeout(() => renameRef.current?.focus(), 50);
    }
  }, [renaming, proj.name]);

  async function submitRename() {
    const trimmed = renameVal.trim();
    if (!trimmed || trimmed === proj.name) { setRenaming(false); return; }
    setRenameSaving(true);
    await onRename(trimmed);
    setRenameSaving(false);
    setRenaming(false);
  }

  return (
    <div className="rounded-xl border" style={{ background: proj.is_done ? "#0d1117" : "#161b22", borderColor: expanded ? "#30363d" : "#21262d", opacity: proj.is_done ? 0.7 : 1 }}>
      {/* Header row */}
      <div className="px-5 py-4 flex items-center gap-4">
        {/* Expand toggle */}
        <button onClick={onToggle} className="flex items-center gap-4 flex-1 min-w-0 text-left">
          <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: proj.is_done ? "#484f58" : health.color }} />

          {/* Name */}
          <div className="flex-1 min-w-0">
            {renaming ? (
              <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                <input
                  ref={renameRef}
                  className="px-2 py-0.5 rounded text-sm outline-none font-semibold"
                  style={{ background: "#21262d", border: "1px solid #58a6ff", color: "#e6edf3", minWidth: 0, width: "100%" }}
                  value={renameVal}
                  onChange={(e) => setRenameVal(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") submitRename(); if (e.key === "Escape") setRenaming(false); }}
                  disabled={renaming_saving}
                />
                <button
                  onClick={submitRename}
                  disabled={renaming_saving}
                  className="text-xs px-2 py-0.5 rounded shrink-0"
                  style={{ background: "#238636", color: "#fff" }}
                >
                  {renaming_saving ? "…" : "Save"}
                </button>
                <button
                  onClick={() => setRenaming(false)}
                  className="text-xs px-2 py-0.5 rounded shrink-0"
                  style={{ background: "#21262d", color: "#8b949e" }}
                >
                  Cancel
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2.5 flex-wrap">
                <span className="text-sm font-semibold" style={{ color: proj.is_done ? "#484f58" : "#e6edf3" }}>
                  {proj.name}
                </span>
                {proj.is_done ? (
                  <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: "#21262d", color: "#484f58" }}>Done</span>
                ) : (
                  <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: "#21262d", color: "#8b949e" }}>{health.label}</span>
                )}
                {docs.length > 0 && (
                  <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: "#1f2d3d", color: "#58a6ff" }}>
                    {docs.length} REQ{docs.length > 1 ? "s" : ""}
                  </span>
                )}
              </div>
            )}
            {!renaming && (
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                {statusBadge("todo", proj.counts.todo, STATUS_COLOR.todo)}
                {statusBadge("in progress", proj.counts.in_progress, STATUS_COLOR.in_progress)}
                {statusBadge("blocked", proj.counts.blocked, STATUS_COLOR.blocked)}
                {statusBadge("done", proj.counts.done, STATUS_COLOR.done)}
              </div>
            )}
          </div>
        </button>

        {/* Progress */}
        {!renaming && (
          <div className="shrink-0 text-right w-20">
            <div className="text-xs mb-1" style={{ color: "#8b949e" }}>{pct}% done</div>
            <div className="w-20 h-1.5 rounded-full overflow-hidden" style={{ background: "#21262d" }}>
              <div className="h-full rounded-full" style={{ width: `${pct}%`, background: pct === 100 ? "#3fb950" : "#58a6ff" }} />
            </div>
          </div>
        )}

        {/* Actions */}
        {!renaming && (
          <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setRenaming(true)}
              className="text-xs px-2 py-1 rounded"
              style={{ background: "#21262d", color: "#8b949e", border: "1px solid #30363d" }}
              title="Rename project"
            >
              ✎
            </button>
            <button
              onClick={() => onMarkDone(!proj.is_done)}
              className="text-xs px-2 py-1 rounded"
              style={{
                background: proj.is_done ? "#1a7f3720" : "#21262d",
                color: proj.is_done ? "#3fb950" : "#8b949e",
                border: proj.is_done ? "1px solid #3fb95040" : "1px solid #30363d",
              }}
              title={proj.is_done ? "Mark as active" : "Mark as done"}
            >
              {proj.is_done ? "✓ Done" : "Mark done"}
            </button>
          </div>
        )}

        {/* Expand arrow */}
        {!renaming && (
          <button onClick={onToggle} className="text-xs shrink-0 ml-1" style={{ color: "#484f58" }}>
            {expanded ? "▲" : "▼"}
          </button>
        )}
      </div>

      {/* Expanded task list */}
      {expanded && (
        <div className="border-t" style={{ borderColor: "#21262d" }}>
          <div className="px-5 py-1">
            {proj.tasks.map((task) => (
              <div key={task.id} className="flex items-center gap-3 py-2.5 border-b last:border-b-0" style={{ borderColor: "#21262d" }}>
                <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: STATUS_COLOR[task.status] ?? "#8b949e" }} />
                <span className="text-sm flex-1" style={{ color: "#c9d1d9" }}>{task.title}</span>
                <span className="text-xs px-1.5 py-0.5 rounded font-bold shrink-0" style={{ color: PRIORITY_COLOR[task.priority] ?? "#8b949e" }}>
                  {(task.priority ?? "").toUpperCase()}
                </span>
                <span className="text-xs shrink-0" style={{ color: "#484f58" }}>{task.assignee}</span>
                <span className="text-xs px-1.5 py-0.5 rounded shrink-0" style={{ background: "#21262d", color: STATUS_COLOR[task.status] ?? "#8b949e" }}>
                  {task.status.replace("_", " ")}
                </span>
              </div>
            ))}
          </div>

          {docs.length > 0 && (
            <div className="px-5 py-3 border-t" style={{ borderColor: "#21262d" }}>
              <div className="text-xs font-semibold mb-2" style={{ color: "#484f58" }}>REQUIREMENTS</div>
              <div className="flex flex-wrap gap-2">
                {docs.map((doc) => (
                  <Link key={doc.path} href={`/docs?path=${encodeURIComponent(doc.path)}`}
                    className="text-xs px-2.5 py-1 rounded-md"
                    style={{ background: "#1f2d3d", color: "#58a6ff", border: "1px solid #1f6feb40" }}>
                    {doc.label}
                  </Link>
                ))}
              </div>
            </div>
          )}
          <div className="px-5 py-3">
            <Link href={`/tasks?project=${encodeURIComponent(proj.name)}`} className="text-xs" style={{ color: "#58a6ff" }}>
              → View in Tasks board
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ProjectsClient() {
  const [projects, setProjects] = useState<ProjectData[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [hideDone, setHideDone] = useState(true);

  useEffect(() => {
    fetch("/api/projects")
      .then((r) => r.json())
      .then((data) => { setProjects(Array.isArray(data) ? data : []); setLoading(false); });
  }, []);

  async function handleMarkDone(name: string, done: boolean) {
    await fetch("/api/projects", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "set_done", name, is_done: done }),
    });
    setProjects((prev) => prev.map((p) => p.name === name ? { ...p, is_done: done } : p));
  }

  async function handleRename(oldName: string, newName: string) {
    await fetch("/api/projects", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "rename", name: oldName, new_name: newName }),
    });
    setProjects((prev) => prev.map((p) => p.name === oldName ? { ...p, name: newName } : p));
    if (expanded === oldName) setExpanded(newName);
  }

  if (loading) {
    return <div className="flex items-center justify-center h-64" style={{ color: "#8b949e" }}>Loading projects…</div>;
  }

  const visible = hideDone ? projects.filter((p) => !p.is_done) : projects;
  const doneCount = projects.filter((p) => p.is_done).length;

  return (
    <div className="p-8 max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold" style={{ color: "#e6edf3" }}>Projects</h1>
          <p className="text-sm mt-1" style={{ color: "#8b949e" }}>
            {visible.length} active{doneCount > 0 ? ` · ${doneCount} done` : ""} · grouped from Tasks
          </p>
        </div>
        {doneCount > 0 && (
          <button
            onClick={() => setHideDone((v) => !v)}
            className="text-xs px-3 py-1.5 rounded-md"
            style={{ background: "#21262d", color: "#8b949e", border: "1px solid #30363d" }}
          >
            {hideDone ? `Show ${doneCount} done` : "Hide done"}
          </button>
        )}
      </div>

      {visible.length === 0 ? (
        <div style={{ color: "#8b949e" }} className="text-sm">
          {projects.length === 0
            ? "No tasks with projects yet. Add a project name to a task to group it here."
            : "All projects are marked done. Click \"Show done\" to see them."}
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map((proj) => (
            <ProjectCard
              key={proj.name}
              proj={proj}
              expanded={expanded === proj.name}
              onToggle={() => setExpanded(expanded === proj.name ? null : proj.name)}
              onMarkDone={(done) => handleMarkDone(proj.name, done)}
              onRename={(newName) => handleRename(proj.name, newName)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
