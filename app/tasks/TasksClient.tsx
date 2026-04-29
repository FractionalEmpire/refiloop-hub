"use client";
import { useState, useEffect, useCallback } from "react";
import type { Task } from "@/lib/supabase";

const PRIORITY_LABELS: Record<string, string> = { p0: "P0", p1: "P1", p2: "P2", later: "Later" };
const PRIORITY_COLORS: Record<string, string> = {
  p0: "#f85149", p1: "#d29922", p2: "#58a6ff", later: "#484f58",
};
const STATUS_COLORS: Record<string, string> = {
  todo: "#8b949e", in_progress: "#58a6ff", done: "#3fb950", blocked: "#f85149",
};
const STATUS_LABELS: Record<string, string> = {
  todo: "To Do", in_progress: "In Progress", done: "Done", blocked: "Blocked",
};
const STATUSES = ["todo", "in_progress", "blocked", "done"] as const;

export default function TasksClient({ user }: { user: "david" | "gorjan" }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "david" | "gorjan">("all");
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [newTask, setNewTask] = useState({ title: "", description: "", assignee: "gorjan", priority: "p1", project: "" });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/tasks${filter !== "all" ? `?assignee=${filter}` : ""}`);
    const data = await res.json();
    setTasks(Array.isArray(data) ? data : []);
    setLoading(false);
  }, [filter]);

  useEffect(() => { load(); }, [load]);

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
    setNewTask({ title: "", description: "", assignee: "gorjan", priority: "p1", project: "" });
    setShowNew(false);
    setSaving(false);
  }

  async function deleteTask(id: string) {
    if (!confirm("Delete this task?")) return;
    await fetch(`/api/tasks/${id}`, { method: "DELETE" });
    setTasks((prev) => prev.filter((t) => t.id !== id));
    if (selectedTask?.id === id) setSelectedTask(null);
  }

  const grouped = STATUSES.reduce((acc, s) => {
    acc[s] = tasks.filter((t) => t.status === s);
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
          {/* Filter */}
          <div className="flex rounded-md overflow-hidden border" style={{ borderColor: "#30363d" }}>
            {(["all", "david", "gorjan"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className="px-3 py-1.5 text-xs font-medium transition-colors"
                style={{
                  background: filter === f ? "#21262d" : "transparent",
                  color: filter === f ? "#e6edf3" : "#8b949e",
                  borderRight: f !== "gorjan" ? "1px solid #30363d" : "none",
                }}
              >
                {f === "all" ? "All" : f === "david" ? "David" : "Gorjan"}
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
                placeholder="Description"
                value={newTask.description}
                onChange={(e) => setNewTask((p) => ({ ...p, description: e.target.value }))}
              />
              <div className="grid grid-cols-3 gap-2">
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
                  <input
                    className="w-full px-2 py-1.5 rounded-md text-xs outline-none"
                    style={{ background: "#0d1117", border: "1px solid #30363d", color: "#e6edf3" }}
                    placeholder="e.g. Infra"
                    value={newTask.project}
                    onChange={(e) => setNewTask((p) => ({ ...p, project: e.target.value }))}
                  />
                </div>
              </div>
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

      {/* Kanban board */}
      {loading ? (
        <div className="text-sm" style={{ color: "#484f58" }}>Loading tasks…</div>
      ) : (
        <div className="grid grid-cols-4 gap-4">
          {STATUSES.map((status) => (
            <div key={status}>
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
                    onClick={() => setSelectedTask(task)}
                    className="rounded-lg border p-3 cursor-pointer transition-colors"
                    style={{ background: "#161b22", borderColor: "#30363d" }}
                    onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#58a6ff")}
                    onMouseLeave={(e) => (e.currentTarget.style.borderColor = "#30363d")}
                  >
                    {/* Priority + Assignee */}
                    <div className="flex items-center gap-1.5 mb-2">
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
                      <div className="ml-auto">
                        <div
                          className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold"
                          style={{
                            background: task.assignee === "david" ? "#1f6feb" : task.assignee === "gorjan" ? "#1a7f37" : "#6e40c9",
                            color: "#fff",
                          }}
                        >
                          {task.assignee === "david" ? "D" : task.assignee === "gorjan" ? "G" : "B"}
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
                </select>
              </div>
              <div>
                <label className="block text-xs mb-1" style={{ color: "#8b949e" }}>Project</label>
                <input
                  className="w-full px-2 py-1.5 rounded-md text-xs outline-none"
                  style={{ background: "#0d1117", border: "1px solid #30363d", color: "#e6edf3" }}
                  value={selectedTask.project || ""}
                  onChange={(e) => setSelectedTask((p) => p ? { ...p, project: e.target.value } : null)}
                  onBlur={() => updateTask(selectedTask.id, { project: selectedTask.project })}
                />
              </div>
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: "#8b949e" }}>Notes</label>
              <textarea
                className="w-full px-3 py-2 rounded-md text-sm outline-none resize-none"
                style={{ background: "#0d1117", border: "1px solid #30363d", color: "#e6edf3" }}
                rows={4}
                placeholder="Add notes, links, context…"
                value={selectedTask.notes || ""}
                onChange={(e) => setSelectedTask((p) => p ? { ...p, notes: e.target.value } : null)}
                onBlur={() => updateTask(selectedTask.id, { notes: selectedTask.notes })}
              />
            </div>
          </div>
          <div className="px-5 py-4 border-t flex gap-2" style={{ borderColor: "#30363d" }}>
            <button
              onClick={() => updateTask(selectedTask.id, { status: "done" })}
              className="flex-1 py-2 rounded-md text-xs font-semibold"
              style={{ background: "#1a7f37", color: "#fff" }}
            >
              ✓ Mark Done
            </button>
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
