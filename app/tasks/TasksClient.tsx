"use client";
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import type { Task } from "@/lib/supabase";

const PRIORITY_LABELS: Record<string, string> = { p0: "P0", p1: "P1", p2: "P2", later: "Later" };
const PRIORITY_COLORS: Record<string, string> = {
  p0: "#f85149", p1: "#d29922", p2: "#58a6ff", later: "#484f58",
};
const PRIORITY_ORDER: Record<string, number> = { p0: 0, p1: 1, p2: 2, later: 3 };
const STATUS_COLORS: Record<string, string> = {
  todo: "#8b949e", in_progress: "#58a6ff", done: "#3fb950", blocked: "#f85149",
};
const STATUS_LABELS: Record<string, string> = {
  todo: "To Do", in_progress: "In Progress", done: "Done", blocked: "Blocked",
};
const STATUSES = ["todo", "in_progress", "blocked", "done"] as const;
const TYPE_CONFIG: Record<string, { label: string; icon: string; color: string; bg: string }> = {
  bug:     { label: "Bug",     icon: "🐛", color: "#f85149", bg: "#f8514920" },
  feature: { label: "Feature", icon: "✨", color: "#58a6ff", bg: "#58a6ff20" },
  task:    { label: "Task",    icon: "☑",  color: "#8b949e", bg: "#8b949e20" },
};

const ASSIGNEE_COLOR: Record<string, string> = {
  david: "#1f6feb",
  gorjan: "#1a7f37",
  both: "#6e40c9",
  claude: "#d97706",
};
const ASSIGNEE_LABEL: Record<string, string> = {
  david: "D", gorjan: "G", both: "B", claude: "C",
};


function formatElapsed(triggeredAt: string, now: number): { label: string; color: string } {
  const secs = Math.floor((now - new Date(triggeredAt).getTime()) / 1000);
  const color = secs < 300 ? "#d97706" : secs < 900 ? "#f0883e" : "#f85149";
  if (secs < 60) return { label: `${secs}s`, color };
  const m = Math.floor(secs / 60), s = secs % 60;
  if (m < 60) return { label: s > 0 ? `${m}m ${s}s` : `${m}m`, color };
  const h = Math.floor(m / 60), rm = m % 60;
  return { label: `${h}h ${rm}m`, color };
}

function formatAgo(ts: string, now: number): string {
  const secs = Math.floor((now - new Date(ts).getTime()) / 1000);
  if (secs < 60) return `${secs}s ago`;
  const m = Math.floor(secs / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m ago`;
}

export default function TasksClient({ user }: { user: "david" | "gorjan" }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "david" | "gorjan" | "claude">("all");
  const [priorityFilter, setPriorityFilter] = useState<"all" | "p0" | "p1" | "p2" | "later">("all");
  const [projectFilter, setProjectFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<"all" | "bug" | "feature" | "task">("all");
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [newTask, setNewTask] = useState({ title: "", description: "", assignee: "gorjan", priority: "p1", project: "", type: "task" });
  const [saving, setSaving] = useState(false);
  const [triggering, setTriggering] = useState(false);
  const [showRunModal, setShowRunModal] = useState(false);
  const [runTaskId, setRunTaskId] = useState<string | null>(null);
  const [runModel, setRunModel] = useState("claude-sonnet-4-6");
  const [dragOverStatus, setDragOverStatus] = useState<string | null>(null);
  const dragTaskId = useRef<string | null>(null);

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const MODELS = [
    { id: "claude-opus-4-7", label: "Opus 4.7 — most capable" },
    { id: "claude-sonnet-4-6", label: "Sonnet 4.6 — recommended" },
    { id: "claude-haiku-4-5-20251001", label: "Haiku 4.5 — fastest" },
  ];

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/tasks${filter !== "all" ? `?assignee=${filter}` : ""}`);
    const data = await res.json();
    setTasks(Array.isArray(data) ? data : []);
    setLoading(false);
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  const availableProjects = useMemo(() => {
    const seen = new Set<string>();
    for (const t of tasks) {
      if (t.project && t.project.trim()) seen.add(t.project.trim());
    }
    return Array.from(seen).sort();
  }, [tasks]);

  async function updateTask(id: string, updates: Partial<Task>) {
    await fetch(`/api/tasks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...updates } : t)));
    if (selectedTask?.id === id) setSelectedTask((prev) => prev ? { ...prev, ...updates } : null);
  }

  async function createTask() {
    if (!newTask.title.trim()) return;
    setSaving(true);
    const res = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newTask),
    });
    const task = await res.json();
    setTasks((prev) => [task, ...prev]);
    setNewTask({ title: "", description: "", assignee: "gorjan", priority: "p1", project: "", type: "task" });
    setShowNew(false);
    setSaving(false);
  }

  async function deleteTask(id: string) {
    if (!confirm("Delete this task?")) return;
    await fetch(`/api/tasks/${id}`, { method: "DELETE" });
    setTasks((prev) => prev.filter((t) => t.id !== id));
    if (selectedTask?.id === id) setSelectedTask(null);
  }

  function openRunModal(id: string) {
    setRunTaskId(id);
    setShowRunModal(true);
  }

  async function triggerViaApi() {
    if (!runTaskId) return;
    setShowRunModal(false);
    setTriggering(true);
    try {
      const res = await fetch(`/api/tasks/${runTaskId}/trigger`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: runModel }),
      });
      const data = await res.json();
      if (res.ok) {
        const updates = { status: "in_progress" as Task["status"], triggered_at: new Date().toISOString() };
        setTasks((prev) => prev.map((t) => (t.id === runTaskId ? { ...t, ...updates } : t)));
        if (selectedTask?.id === runTaskId) setSelectedTask((prev) => prev ? { ...prev, ...updates } : null);
      } else {
        alert(`Error: ${data.error}`);
      }
    } finally {
      setTriggering(false);
      setRunTaskId(null);
    }
  }

  const visibleTasks = tasks.filter((t) => {
    if (priorityFilter !== "all" && t.priority !== priorityFilter) return false;
    if (projectFilter !== "all" && (t.project || "") !== projectFilter) return false;
    if (typeFilter !== "all" && (t.type || "task") !== typeFilter) return false;
    return true;
  });
  const grouped = STATUSES.reduce((acc, s) => {
    acc[s] = visibleTasks
      .filter((t) => t.status === s)
      .sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
    return acc;
  }, {} as Record<string, Task[]>);

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold" style={{ color: "#e6edf3" }}>Tasks</h1>
          <p className="text-sm mt-0.5" style={{ color: "#8b949e" }}>
            {tasks.filter((t) => t.status !== "done").length} open · {tasks.filter((t) => t.status === "done").length} done
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Project filter */}
          <select
            value={projectFilter}
            onChange={(e) => setProjectFilter(e.target.value)}
            className="px-3 py-1.5 text-xs rounded-md outline-none"
            style={{ background: projectFilter !== "all" ? "#21262d" : "transparent", border: "1px solid #30363d", color: projectFilter !== "all" ? "#e6edf3" : "#8b949e" }}
          >
            <option value="all">All Projects</option>
            {availableProjects.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
          {/* Priority filter */}
          <div className="flex rounded-md overflow-hidden border" style={{ borderColor: "#30363d" }}>
            {(["all", "p0", "p1", "p2", "later"] as const).map((p, i, arr) => (
              <button
                key={p}
                onClick={() => setPriorityFilter(p)}
                className="px-3 py-1.5 text-xs font-medium transition-colors"
                style={{
                  background: priorityFilter === p ? "#21262d" : "transparent",
                  color: priorityFilter === p ? (p === "all" ? "#e6edf3" : PRIORITY_COLORS[p]) : "#8b949e",
                  borderRight: i < arr.length - 1 ? "1px solid #30363d" : "none",
                }}
              >
                {p === "all" ? "All" : PRIORITY_LABELS[p]}
              </button>
            ))}
          </div>
          {/* Assignee filter */}
          <div className="flex rounded-md overflow-hidden border" style={{ borderColor: "#30363d" }}>
            {(["all", "david", "gorjan", "claude"] as const).map((f, i, arr) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className="px-3 py-1.5 text-xs font-medium transition-colors"
                style={{
                  background: filter === f ? "#21262d" : "transparent",
                  color: filter === f ? (f === "claude" ? "#d97706" : "#e6edf3") : "#8b949e",
                  borderRight: i < arr.length - 1 ? "1px solid #30363d" : "none",
                }}
              >
                {f === "all" ? "All" : f === "david" ? "David" : f === "gorjan" ? "Gorjan" : "Claude"}
              </button>
            ))}
          </div>
          {/* Type filter */}
          <div className="flex rounded-md overflow-hidden border" style={{ borderColor: "#30363d" }}>
            {(["all", "bug", "feature", "task"] as const).map((tp, i, arr) => (
                <button
                      key={tp}
                            onClick={() => setTypeFilter(tp)}
                                  className="px-3 py-1.5 text-xs font-medium transition-colors"
                                        style={{
                                                background: typeFilter === tp ? "#21262d" : "transparent",
                                                        color: typeFilter === tp ? (TYPE_CONFIG[tp]?.color || "#e6edf3") : "#8b949e",
                                                                borderRight: i < arr.length - 1 ? "1px solid #30363d" : "none",
                                                                      }}
                                                                          >
                                                                                {tp === "all" ? "All" : `${TYPE_CONFIG[tp].icon} ${TYPE_CONFIG[tp].label}`}
                                                                                    </button>
                                                                                      ))}
                                                                                      </div>
          <button
            onClick={() => setShowNew(true)}
            className="px-3 py-1.5 text-xs font-semibold rounded-md"
            style={{ background: "#1f6feb", color: "#fff" }}
          >
            + New Task
          </button>
        </div>
      </div>

      {/* New Task Modal */}
      {showNew && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "#0008" }}>
          <div className="rounded-xl border w-full max-w-md p-6" style={{ background: "#161b22", borderColor: "#30363d" }}>
            <h2 className="text-sm font-semibold mb-4" style={{ color: "#e6edf3" }}>New Task</h2>
            <div className="space-y-3">
              <input
                className="w-full px-3 py-2 rounded-md text-sm outline-none"
                style={{ background: "#0d1117", border: "1px solid #30363d", color: "#e6edf3" }}
                placeholder="Task title *"
                value={newTask.title}
                onChange={(e) => setNewTask((p) => ({ ...p, title: e.target.value }))}
              />
              <textarea
                className="w-full px-3 py-2 rounded-md text-sm outline-none resize-none"
                style={{ background: "#0d1117", border: "1px solid #30363d", color: "#e6edf3" }}
                rows={3}
                placeholder="Description (be specific — Claude will read this)"
                value={newTask.description}
                onChange={(e) => setNewTask((p) => ({ ...p, description: e.target.value }))}
              />
              <div className="grid grid-cols-4 gap-2">
                <div>
                  <label className="block text-xs mb-1" style={{ color: "#8b949e" }}>Assignee</label>
                  <select
                    className="w-full px-2 py-1.5 rounded-md text-xs outline-none"
                    style={{ background: "#0d1117", border: "1px solid #30363d", color: "#e6edf3" }}
                    value={newTask.assignee}
                    onChange={(e) => setNewTask((p) => ({ ...p, assignee: e.target.value }))}
                  >
                    <option value="david">David</option>
                    <option value="gorjan">Gorjan</option>
                    <option value="both">Both</option>
                    <option value="claude">Claude (AI)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs mb-1" style={{ color: "#8b949e" }}>Priority</label>
                  <select
                    className="w-full px-2 py-1.5 rounded-md text-xs outline-none"
                    style={{ background: "#0d1117", border: "1px solid #30363d", color: "#e6edf3" }}
                    value={newTask.priority}
                    onChange={(e) => setNewTask((p) => ({ ...p, priority: e.target.value }))}
                  >
                    <option value="p0">P0</option>
                    <option value="p1">P1</option>
                    <option value="p2">P2</option>
                    <option value="later">Later</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs mb-1" style={{ color: "#8b949e" }}>Project</label>
                  <select
                    className="w-full px-2 py-1.5 rounded-md text-xs outline-none"
                    style={{ background: "#0d1117", border: "1px solid #30363d", color: "#e6edf3" }}
                    value={newTask.project}
                    onChange={(e) => setNewTask((p) => ({ ...p, project: e.target.value }))}
                  >
                    <option value="">— select —</option>
                    {availableProjects.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>
                <div>
                <label className="block text-xs mb-1" style={{ color: "#8b949e" }}>Type</label>
                <select
                className="w-full px-2 py-1.5 rounded-md text-xs outline-none"
                style={{ background: "#0d1117", border: "1px solid #30363d", color: "#e6edf3" }}
                value={newTask.type}
                onChange={(e) => setNewTask((p) => ({ ...p, type: e.target.value }))}
                >
                <option value="task">☑ Task</option>
                <option value="bug">🐛 Bug</option>
                <option value="feature">✨ Feature</option>
                </select>
                </div>
              </div>
              {newTask.assignee === "claude" && (
                <p className="text-xs px-3 py-2 rounded-md" style={{ background: "#d9770610", border: "1px solid #d9770630", color: "#d97706" }}>
                  Claude will execute this autonomously. Make the description detailed and specific.
                </p>
              )}
              <div className="flex gap-2 pt-1">
                <button
                  onClick={createTask}
                  disabled={saving || !newTask.title}
                  className="flex-1 py-2 rounded-md text-xs font-semibold"
                  style={{ background: "#1f6feb", color: "#fff", opacity: saving ? 0.6 : 1 }}
                >
                  {saving ? "Creating…" : "Create Task"}
                </button>
                <button
                  onClick={() => setShowNew(false)}
                  className="px-4 py-2 rounded-md text-xs"
                  style={{ background: "#21262d", color: "#8b949e" }}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Run Modal */}
      {showRunModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "#0008" }}>
          <div className="rounded-xl border w-full max-w-sm p-6" style={{ background: "#161b22", borderColor: "#30363d" }}>
            <h2 className="text-sm font-semibold mb-1" style={{ color: "#e6edf3" }}>Run Now via API</h2>
            <p className="text-xs mb-4" style={{ color: "#8b949e" }}>Claude will execute this task autonomously using the Anthropic API.</p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs mb-1" style={{ color: "#8b949e" }}>Model</label>
                <select
                  className="w-full px-3 py-2 rounded-md text-sm outline-none"
                  style={{ background: "#0d1117", border: "1px solid #30363d", color: "#e6edf3" }}
                  value={runModel}
                  onChange={(e) => setRunModel(e.target.value)}
                >
                  {MODELS.map((m) => (
                    <option key={m.id} value={m.id}>{m.label}</option>
                  ))}
                </select>
              </div>
              <div className="px-3 py-2 rounded-md flex items-center gap-2" style={{ background: "#0d1117", border: "1px solid #30363d" }}>
                <span className="text-xs" style={{ color: "#8b949e" }}>API Key</span>
                <span className="text-xs font-mono" style={{ color: "#3fb950" }}>Builder Hub (1Password)</span>
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  onClick={triggerViaApi}
                  className="flex-1 py-2 rounded-md text-xs font-semibold"
                  style={{ background: "#d97706", color: "#fff" }}
                >
                  ▶ Run Now
                </button>
                <button
                  onClick={() => setShowRunModal(false)}
                  className="px-4 py-2 rounded-md text-xs"
                  style={{ background: "#21262d", color: "#8b949e" }}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Kanban board */}
      {loading ? (
        <div className="text-sm" style={{ color: "#484f58" }}>Loading tasks…</div>
      ) : (
        <div className="grid grid-cols-4 gap-4">
          {STATUSES.map((status) => (
            <div
              key={status}
              onDragOver={(e) => { e.preventDefault(); setDragOverStatus(status); }}
              onDragLeave={() => setDragOverStatus(null)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOverStatus(null);
                const id = dragTaskId.current;
                if (id) { updateTask(id, { status: status as Task["status"] }); dragTaskId.current = null; }
              }}
              style={{ outline: dragOverStatus === status ? `2px solid ${STATUS_COLORS[status]}` : "none", borderRadius: 8 }}
            >
              <div className="flex items-center gap-2 mb-3">
                <div className="w-2 h-2 rounded-full" style={{ background: STATUS_COLORS[status] }} />
                <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: "#8b949e" }}>
                  {STATUS_LABELS[status]}
                </span>
                <span className="text-xs" style={{ color: "#484f58" }}>({grouped[status].length})</span>
              </div>
              <div className="space-y-2">
                {grouped[status].map((task) => (
                  <div
                    key={task.id}
                    draggable
                    onDragStart={() => { dragTaskId.current = task.id; }}
                    onDragEnd={() => { dragTaskId.current = null; setDragOverStatus(null); }}
                    onClick={() => setSelectedTask(task)}
                    className="rounded-lg border p-3 cursor-grab transition-colors"
                    style={{ background: "#161b22", borderColor: task.assignee === "claude" ? "#d9770640" : "#30363d" }}
                    onMouseEnter={(e) => (e.currentTarget.style.borderColor = task.assignee === "claude" ? "#d97706" : "#58a6ff")}
                    onMouseLeave={(e) => (e.currentTarget.style.borderColor = task.assignee === "claude" ? "#d9770640" : "#30363d")}
                  >
                    <div className="flex items-center gap-1.5 mb-2">
                      <span className="text-xs px-1 py-0.5 rounded" style={{ background: TYPE_CONFIG[task.type || "task"]?.bg || "#8b949e20", color: TYPE_CONFIG[task.type || "task"]?.color || "#8b949e" }}>{TYPE_CONFIG[task.type || "task"]?.icon || "☑"}</span>
                      <span
                        className="text-xs font-mono px-1 py-0.5 rounded"
                        style={{ background: `${PRIORITY_COLORS[task.priority]}20`, color: PRIORITY_COLORS[task.priority] }}
                      >
                        {PRIORITY_LABELS[task.priority]}
                      </span>
                      {task.project && (
                        <span className="text-xs px-1 py-0.5 rounded" style={{ background: "#21262d", color: "#8b949e" }}>
                          {task.project}
                        </span>
                      )}
                      {task.assignee === "claude" && task.status === "in_progress" && (() => {
                        const elapsed = task.triggered_at ? formatElapsed(task.triggered_at, now) : null;
                        return (
                          <span className="text-xs px-1.5 py-0.5 rounded font-mono flex items-center gap-1"
                            style={{ background: elapsed ? `${elapsed.color}18` : "#d9770618", color: elapsed?.color || "#d97706", border: `1px solid ${elapsed?.color || "#d97706"}30` }}>
                            <span className="inline-block w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: elapsed?.color || "#d97706" }} />
                            {elapsed ? elapsed.label : "working…"}
                          </span>
                        );
                      })()}
                      <div className="ml-auto">
                        <div
                          className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold"
                          style={{ background: ASSIGNEE_COLOR[task.assignee] || "#484f58", color: "#fff" }}
                        >
                          {ASSIGNEE_LABEL[task.assignee] || "?"}
                        </div>
                      </div>
                    </div>
                    <p className="text-xs font-medium leading-relaxed" style={{ color: "#e6edf3" }}>
                      {task.title}
                    </p>
                    {task.description && (
                      <p className="text-xs mt-1 line-clamp-2" style={{ color: "#8b949e" }}>
                        {task.description}
                      </p>
                    )}
                  </div>
                ))}
                {grouped[status].length === 0 && (
                  <div className="rounded-lg border-2 border-dashed p-4 text-center"
                    style={{ borderColor: "#21262d" }}>
                    <p className="text-xs" style={{ color: "#30363d" }}>Empty</p>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Task Detail Panel */}
      {selectedTask && (
        <div
          className="fixed inset-y-0 right-0 w-96 border-l flex flex-col z-40"
          style={{ background: "#161b22", borderColor: "#30363d" }}
        >
          <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: "#30363d" }}>
            <h3 className="text-sm font-semibold" style={{ color: "#e6edf3" }}>Task Detail</h3>
            <button onClick={() => setSelectedTask(null)} style={{ color: "#8b949e" }}>✕</button>
          </div>
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            <div>
              <label className="block text-xs mb-1" style={{ color: "#8b949e" }}>Title</label>
              <input
                className="w-full px-3 py-2 rounded-md text-sm outline-none"
                style={{ background: "#0d1117", border: "1px solid #30363d", color: "#e6edf3" }}
                value={selectedTask.title}
                onChange={(e) => setSelectedTask((p) => p ? { ...p, title: e.target.value } : null)}
                onBlur={() => updateTask(selectedTask.id, { title: selectedTask.title })}
              />
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: "#8b949e" }}>Description</label>
              <textarea
                className="w-full px-3 py-2 rounded-md text-sm outline-none resize-none"
                style={{ background: "#0d1117", border: "1px solid #30363d", color: "#e6edf3" }}
                rows={5}
                value={selectedTask.description || ""}
                onChange={(e) => setSelectedTask((p) => p ? { ...p, description: e.target.value } : null)}
                onBlur={() => updateTask(selectedTask.id, { description: selectedTask.description })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs mb-1" style={{ color: "#8b949e" }}>Status</label>
                <select
                  className="w-full px-2 py-1.5 rounded-md text-xs outline-none"
                  style={{ background: "#0d1117", border: "1px solid #30363d", color: "#e6edf3" }}
                  value={selectedTask.status}
                  onChange={(e) => { const v = e.target.value as Task["status"]; updateTask(selectedTask.id, { status: v }); setSelectedTask((p) => p ? { ...p, status: v } : null); }}
                >
                  <option value="todo">To Do</option>
                  <option value="in_progress">In Progress</option>
                  <option value="blocked">Blocked</option>
                  <option value="done">Done</option>
                </select>
              </div>
              <div>
                <label className="block text-xs mb-1" style={{ color: "#8b949e" }}>Priority</label>
                <select
                  className="w-full px-2 py-1.5 rounded-md text-xs outline-none"
                  style={{ background: "#0d1117", border: "1px solid #30363d", color: "#e6edf3" }}
                  value={selectedTask.priority}
                  onChange={(e) => { const v = e.target.value as Task["priority"]; updateTask(selectedTask.id, { priority: v }); setSelectedTask((p) => p ? { ...p, priority: v } : null); }}
                >
                  <option value="p0">P0 — Critical</option>
                  <option value="p1">P1 — High</option>
                  <option value="p2">P2 — Normal</option>
                  <option value="later">Later</option>
                </select>
              </div>
              <div>
                <label className="block text-xs mb-1" style={{ color: "#8b949e" }}>Type</label>
                <select
                  className="w-full px-2 py-1.5 rounded-md text-xs outline-none"
                  style={{ background: "#0d1117", border: "1px solid #30363d", color: "#e6edf3" }}
                  value={selectedTask.type || "task"}
                  onChange={(e) => { const v = e.target.value as Task["type"]; updateTask(selectedTask.id, { type: v }); setSelectedTask((p) => p ? { ...p, type: v } : null); }}
                >
                  <option value="task">☑ Task</option>
                  <option value="bug">🐛 Bug</option>
                  <option value="feature">✨ Feature</option>
                </select>
              </div>
              <div>
                <label className="block text-xs mb-1" style={{ color: "#8b949e" }}>Assignee</label>
                <select
                  className="w-full px-2 py-1.5 rounded-md text-xs outline-none"
                  style={{ background: "#0d1117", border: "1px solid #30363d", color: "#e6edf3" }}
                  value={selectedTask.assignee}
                  onChange={(e) => { const v = e.target.value as Task["assignee"]; updateTask(selectedTask.id, { assignee: v }); setSelectedTask((p) => p ? { ...p, assignee: v } : null); }}
                >
                  <option value="david">David</option>
                  <option value="gorjan">Gorjan</option>
                  <option value="both">Both</option>
                  <option value="claude">Claude (AI)</option>
                </select>
              </div>
              <div className="col-span-2">
                <label className="block text-xs mb-1" style={{ color: "#8b949e" }}>Project</label>
                <select
                  className="w-full px-2 py-1.5 rounded-md text-xs outline-none"
                  style={{ background: "#0d1117", border: "1px solid #30363d", color: "#e6edf3" }}
                  value={selectedTask.project || ""}
                  onChange={(e) => { updateTask(selectedTask.id, { project: e.target.value }); setSelectedTask((p) => p ? { ...p, project: e.target.value } : null); }}
                >
                  <option value="">— select —</option>
                  {availableProjects.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: "#8b949e" }}>Notes / Evidence</label>
              <textarea
                className="w-full px-3 py-2 rounded-md text-sm outline-none resize-none font-mono"
                style={{ background: "#0d1117", border: "1px solid #30363d", color: selectedTask.assignee === "claude" ? "#d97706" : "#e6edf3" }}
                rows={6}
                placeholder={selectedTask.assignee === "claude" ? "Claude will log evidence here…" : "Add notes, links, context…"}
                value={selectedTask.notes || ""}
                onChange={(e) => setSelectedTask((p) => p ? { ...p, notes: e.target.value } : null)}
                onBlur={() => updateTask(selectedTask.id, { notes: selectedTask.notes })}
              />
            </div>
            {selectedTask.triggered_at && (
              <p className="text-xs" style={{ color: "#484f58" }}>
                Triggered: {new Date(selectedTask.triggered_at).toLocaleString()}
              </p>
            )}
            {selectedTask.last_activity_at && selectedTask.status === "in_progress" && (
              <p className="text-xs" style={{ color: "#484f58" }}>
                Last action: <span style={{ color: "#8b949e" }}>{formatAgo(selectedTask.last_activity_at, now)}</span>
              </p>
            )}
            {selectedTask.triggered_at && selectedTask.assignee === "claude" && selectedTask.status === "in_progress" && (() => {
              const elapsed = formatElapsed(selectedTask.triggered_at, now);
              return (
                <div className="flex items-center gap-2 px-2 py-1.5 rounded-md" style={{ background: `${elapsed.color}12`, border: `1px solid ${elapsed.color}30` }}>
                  <span className="inline-block w-2 h-2 rounded-full animate-pulse" style={{ background: elapsed.color }} />
                  <span className="text-xs font-mono font-semibold" style={{ color: elapsed.color }}>{elapsed.label} elapsed</span>
                  <span className="text-xs ml-auto" style={{ color: "#484f58" }}>{elapsed.color === "#f85149" ? "⚠ may be hung" : "working"}</span>
                </div>
              );
            })()}
          </div>
          <div className="px-5 py-4 border-t flex gap-2" style={{ borderColor: "#30363d" }}>
            {selectedTask.assignee === "claude" ? (
              <>
                <button
                  onClick={() => openRunModal(selectedTask.id)}
                  disabled={triggering || selectedTask.status === "done"}
                  className="flex-1 py-2 rounded-md text-xs font-semibold flex items-center justify-center gap-1.5"
                  style={{
                    background: triggering ? "#92400e" : "#d97706",
                    color: "#fff",
                    opacity: (triggering || selectedTask.status === "done") ? 0.5 : 1,
                  }}
                >
                  {triggering ? "Triggering…" : selectedTask.status === "in_progress" ? "⟳ Re-trigger" : "▶ Run Now"}
                </button>
                <button
                  onClick={() => updateTask(selectedTask.id, { status: "done" })}
                  className="px-3 py-2 rounded-md text-xs font-semibold"
                  style={{ background: "#1a7f37", color: "#fff" }}
                >
                  ✓ Done
                </button>
                {selectedTask.status === "in_progress" && (
                  <button
                    onClick={async () => {
                      if (!confirm("Force reset this task to todo? Use this if Claude appears hung.")) return;
                      await fetch(`/api/tasks/${selectedTask.id}`, {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ reset: true }),
                      });
                      const updates = { status: "todo" as Task["status"], triggered_at: null, last_activity_at: null };
                      setTasks((prev) => prev.map((t) => (t.id === selectedTask.id ? { ...t, ...updates } : t)));
                      setSelectedTask((prev) => prev ? { ...prev, ...updates } : null);
                    }}
                    className="px-3 py-2 rounded-md text-xs font-semibold"
                    style={{ background: "#21262d", color: "#f85149", border: "1px solid #f8514930" }}
                  >
                    ↺ Reset
                  </button>
                )}
              </>
            ) : (
              <button
                onClick={() => updateTask(selectedTask.id, { status: "done" })}
                className="flex-1 py-2 rounded-md text-xs font-semibold"
                style={{ background: "#1a7f37", color: "#fff" }}
              >
                ✓ Mark Done
              </button>
            )}
            <button
              onClick={() => deleteTask(selectedTask.id)}
              className="px-4 py-2 rounded-md text-xs"
              style={{ background: "#21262d", color: "#f85149" }}
            >
              Delete
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
