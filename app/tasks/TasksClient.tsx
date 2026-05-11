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

const DISPLAY_COLUMNS = ["todo", "in_progress", "blocked", "review", "done"] as const;

const COLUMN_CONFIG: Record<string, { label: string; color: string }> = {

  review:      { label: "ð Review",   color: "#7c3aed" },

  todo:        { label: "To Do",       color: "#8b949e" },

  in_progress: { label: "In Progress", color: "#58a6ff" },

  blocked:     { label: "Blocked",     color: "#f85149" },

  done:        { label: "Done",        color: "#3fb950" },

};

const TYPE_CONFIG: Record<string, { label: string; icon: string; color: string; bg: string }> = {

  bug:     { label: "Bug",     icon: "ð", color: "#f85149", bg: "#f8514920" },

  feature: { label: "Feature", icon: "â¨", color: "#58a6ff", bg: "#58a6ff20" },

  task:    { label: "Task",    icon: "â",  color: "#8b949e", bg: "#8b949e20" },

};



const ASSIGNEE_COLOR: Record<string, string> = {

  david: "#1f6feb",

  gorjan: "#1a7f37",

  both: "#6e40c9",

  claude: "#d97706",

  keith: "#b45309",

};

const ASSIGNEE_LABEL: Record<string, string> = {

  david: "D", gorjan: "G", both: "B", claude: "C", keith: "K",

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

  const [filter, setFilter] = useState<"all" | "david" | "gorjan" | "claude" | "keith">("all");

  const [priorityFilter, setPriorityFilter] = useState<"all" | "p0" | "p1" | "p2" | "later">("all");

  const [projectFilter, setProjectFilter] = useState<string>("all");

  const [typeFilter, setTypeFilter] = useState<"all" | "bug" | "feature" | "task">("all");

  const [allProjectNames, setAllProjectNames] = useState<string[]>([]);

  const [reviewFilter, setReviewFilter] = useState(false);

  const [selectedTask, setSelectedTask] = useState<Task | null>(null);

  const [showNew, setShowNew] = useState(false);

  const [newTask, setNewTask] = useState({ title: "", description: "", assignee: "gorjan", priority: "p1", project: "", type: "task", url: "" });

  const [saving, setSaving] = useState(false);

  const [triggering, setTriggering] = useState(false);

  const [showRunModal, setShowRunModal] = useState(false);

  const [runTaskId, setRunTaskId] = useState<string | null>(null);

  const [runModel, setRunModel] = useState("claude-sonnet-4-6");

  const [dragOverStatus, setDragOverStatus] = useState<string | null>(null);

  const [showAllDone, setShowAllDone] = useState(false);

  const dragTaskId = useRef<string | null>(null);



  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {

    const id = setInterval(() => setNow(Date.now()), 1000);

    return () => clearInterval(id);

  }, []);



  const MODELS = [

    { id: "claude-opus-4-7", label: "Opus 4.7 â most capable" },

    { id: "claude-sonnet-4-6", label: "Sonnet 4.6 â recommended" },

    { id: "claude-haiku-4-5-20251001", label: "Haiku 4.5 â fastest" },

  ];



  const load = useCallback(async () => {

    setLoading(true);

    const res = await fetch(`/api/tasks${filter !== "all" ? `?assignee=${filter}` : ""}`);

    const data = await res.json();

    setTasks(Array.isArray(data) ? data : []);

    setLoading(false);

  }, [filter]);



  useEffect(() => { load(); }, [load]);



  // Read ?project= URL param on mount to pre-populate filter

  useEffect(() => {

    const params = new URLSearchParams(window.location.search);

    const p = params.get("project");

    if (p) setProjectFilter(p);

  }, []);



  // Load ALL project names (ignores assignee filter â needed for dropdown)

  useEffect(() => {

    fetch("/api/projects")

      .then((r) => r.json())

      .then((data: { name: string }[]) => {

        if (Array.isArray(data)) setAllProjectNames(data.map((p) => p.name).sort());

      });

  }, []);



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

    setNewTask({ title: "", description: "", assignee: "gorjan", priority: "p1", project: "", type: "task", url: "" });

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



  const reviewCount = tasks.filter((t) => t.ready_for_review && t.status !== "done").length;



  const visibleTasks = tasks.filter((t) => {

    if (priorityFilter !== "all" && t.priority !== priorityFilter) return false;

    if (projectFilter !== "all" && (t.project || "") !== projectFilter) return false;

    if (typeFilter !== "all" && (t.type || "task") !== typeFilter) return false;

    if (reviewFilter && !t.ready_for_review) return false;

    return true;

  });

  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);

  const grouped = DISPLAY_COLUMNS.reduce((acc, col) => {

    if (col === "review") {

      acc[col] = visibleTasks

        .filter((t) => t.ready_for_review && t.status !== "done")

        .sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);

    } else if (col === "done" && !showAllDone) {

      acc[col] = visibleTasks

        .filter((t) => t.status === col && !(t.ready_for_review && t.status !== "done"))

        .filter((t) => {

          const date = t.completed_at || t.updated_at;

          return date ? new Date(date) >= threeDaysAgo : false;

        })

        .sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);

    } else {

      acc[col] = visibleTasks

        .filter((t) => t.status === col && !(t.ready_for_review && t.status !== "done"))

        .sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);

    }

    return acc;

  }, {} as Record<string, Task[]>);



  return (

    <div className="p-8">

      {/* Header */}

      <div className="flex items-center justify-between mb-6">

        <div>

          <h1 className="text-xl font-semibold" style={{ color: "#e6edf3" }}>Tasks</h1>

          <p className="text-sm mt-0.5" style={{ color: "#8b949e" }}>

            {tasks.filter((t) => t.status !== "done").length} open Â· {tasks.filter((t) => t.status === "done").length} done

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

            {allProjectNames.map((p) => (

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

            x(["all", "david", "gorjan", "keith", "claude"] as const).map((f, i, arr) => (

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

                {f === "all" ? "All" : f === "david" ? "David" : f === "gorjan" ? "Gorjan" : f === "keith" ? "Keith" : "Claude"}

              </button>

            ))}

          </div>

          {/* Type filter */}

          <div className="flex rounded-md overflow-hidden border" style={{ borderColor: "#30363d" }}>

            x(["all", "bug", "feature", "task"] as const).map((tp, i, arr) => (

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

          {/* Ready for review filter */}

          <button

            onClick={() => setReviewFilter((v) => !v)}

            className="px-3 py-1.5 text-xs font-semibold rounded-md flex items-center gap-1.5 transition-colors"

            style={{

              background: reviewFilter ? "#7c3aed" : "transparent",

              color: reviewFilter ? "#fff" : "#8b949e",

              border: "1px solid",

              borderColor: reviewFilter ? "#7c3aed" : "#30363d",

            }}

          >

            ð Review{reviewCount > 0 && <span className="px-1 py-0.5 rounded text-xs font-mono" style={{ background: reviewFilter ? "#ffffff30" : "#7c3aed30", color: reviewFilter ? "#fff" : "#a78bfa" }}>{reviewCount}</span>}

          </button>

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

                placeholder="Description (be specific â Claude will read this)"

                value={newTask.description}

                onChange={(e) => setNewTask((p) => ({ ...p, description: e.target.value }))}

              />

              <input

                className="w-full px-3 py-2 rounded-md text-sm outline-none font-mono"

                style={{ background: "#0d1117", border: "1px solid #30363d", color: "#58a6ff" }}

                placeholder="URL (optional) â https://â¦"

                value={newTask.url}

                onChange={(e) => setNewTask((p) => ({ ...p, url: e.target.value }))}

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

                    <option value="keith">Keith</option>

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

                    <option value="">â select â</option>

                    {allProjectNames.map((p) => (

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

                <option value="task">â Task</option>

                <option value="bug">ð Bug</option>

                <option value="feature">â¨ Feature</option>

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

                  {saving ? "Creatingâ¦" : "Create Task"}

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

                  â¶ Run Now

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

        <div className="text-sm" style={{ color: "#484f58" }}>Loading tasksâ¦</div>

      ) : (

        <div className="grid grid-cols-5 gap-4">

          {DISPLAY_COLUMNS.map((col) => (

            <div

              key={col}

              onDragOver={(e) => { e.preventDefault(); setDragOverStatus(col); }}

              onDragLeave={() => setDragOverStatus(null)}

              onDrop={(e) => {

                e.preventDefault();

                setDragOverStatus(null);

                const id = dragTaskId.current;

                if (id) {

                  if (col === "review") {

                    updateTask(id, { ready_for_review: true });

                  } else {

                    const draggedTask = tasks.find((t) => t.id === id);

                    const updates: Partial<Task> = { status: col as Task["status"] };

                    if (draggedTask?.ready_for_review) updates.ready_for_review = false;

                    updateTask(id, updates);

                  }

                  dragTaskId.current = null;

                }

              }}

              style={{ outline: dragOverStatus === col ? `2px solid ${COLUMN_CONFIG[col].color}` : "none", borderRadius: 8 }}

            >

              <div className="flex items-center gap-2 mb-3">

                <div className="w-2 h-2 rounded-full" style={{ background: COLUMN_CONFIG[col].color }} />

                <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: "#8b949e" }}>

                  {COLUMN_CONFIG[col].label}

                </span>

                <span className="text-xs" style={{ color: "#484f58" }}>({grouped[col]?.length ?? 0})</span>

                {col === "done" && (

                  <button

                    onClick={() => setShowAllDone((v) => !v)}

                    className="ml-auto text-xs"

                    style={{ color: showAllDone ? "#58a6ff" : "#484f58" }}

                  >

                    {showAllDone ? "â 3 days" : `all (${visibleTasks.filter(t => t.status === "done").length})`}

                  </button>

                )}

              </div>

              <div className="space-y-2">

                {grouped[col]?.map((task) => (

                  <div

                    key={task.id}

                    draggable

                    onDragStart={() => { dragTaskId.current = task.id; }}

                    onDragEnd={() => { dragTaskId.current = null; setDragOverStatus(null); }}

                    onClick={() => setSelectedTask(task)}

                    className="rounded-lg border p-3 cursor-grab transition-colors"

                    style={{ background: "#161b22", borderColor: task.ready_for_review ? "#7c3aed" : task.assignee === "claude" ? "#d9770640" : "#30363d" }}

                    onMouseEnter={(e) => (e.currentTarget.style.borderColor = task.ready_for_review ? "#a78bfa" : task.assignee === "claude" ? "#d97706" : "#58a6ff")}

                    onMouseLeave={(e) => (e.currentTarget.style.borderColor = task.ready_for_review ? "#7c3aed" : task.assignee === "claude" ? "#d9770640" : "#30363d")}

                  >

                    <div className="flex items-center gap-1.5 mb-2">

                      <span className="text-xs px-1 py-0.5 rounded" style={{ background: TYPE_CONFIG[task.type || "task"]?.bg || "#8b949e20", color: TYPE_CONFIG[task.type || "task"]?.color || "#8b949e" }}>{TYPE_CONFIG[task.type || "task"]?.icon || "â"}</span>

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

                            {elapsed ? elapsed.label : "workingâ¦"}

                          </span>

                        );

                      })()}

                      {task.ready_for_review && (

                        <span className="text-xs px-1.5 py-0.5 rounded font-semibold" style={{ background: "#7c3aed30", color: "#a78bfa", border: "1px solid #7c3aed50" }}>

                          ð Review

                        </span>

                      )}

                      {task.url && (

                        <a

                          href={task.url}

                          target="_blank"

                          rel="noopener noreferrer"

                          onClick={(e) => e.stopPropagation()}

                          className="text-xs"

                          title={task.url}

                          style={{ color: "#58a6ff", lineHeight: 1 }}

                        >

                          ð

                        </a>

                      )}

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

                {(grouped[col]?.length ?? 0) === 0 && (

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

            <button onClick={() => setSelectedTask(null)} style={{ color: "#8b949e" }}>â</button>

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

            <div>

              <label className="block text-xs mb-1" style={{ color: "#8b949e" }}>URL</label>

              <input

                className="w-full px-3 py-2 rounded-md text-sm outline-none font-mono"

                style={{ background: "#0d1117", border: "1px solid #30363d", color: "#58a6ff" }}

                placeholder="https://â¦"

                value={selectedTask.url || ""}

                onChange={(e) => setSelectedTask((p) => p ? { ...p, url: e.target.value } : null)}

                onBlur={() => updateTask(selectedTask.id, { url: selectedTask.url || null })}

              />

              {selectedTask.url && (

                <a

                  href={selectedTask.url}

                  target="_blank"

                  rel="noopener noreferrer"

                  className="text-xs mt-1 inline-flex items-center gap-1"

                  style={{ color: "#58a6ff" }}

                >

                  â Open link

                </a>

              )}

            </div>

            <div className="grid grid-cols-2 gap-3">

              <div>

                <label className="block text-xs mb-1" style={{ color: "#8b949e" }}>Status</label>

                <select

                  className="w-full px-2 py-1.5 rounded-md text-xs outline-none"

                  style={{ background: "#0d1117", border: "1px solid #30363d", color: "#e6edf3" }}

                  value={selectedTask.ready_for_review && selectedTask.status !== "done" ? "review" : selectedTask.status}

                  onChange={(e) => {

                    const v = e.target.value;

                    if (v === "review") {

                      updateTask(selectedTask.id, { ready_for_review: true });

                      setSelectedTask((p) => p ? { ...p, ready_for_review: true } : null);

                    } else {

                      const s = v as Task["status"];

                      updateTask(selectedTask.id, { status: s, ready_for_review: false });

                      setSelectedTask((p) => p ? { ...p, status: s, ready_for_review: false } : null);

                    }

                  }}

                >

                  <option value="todo">To Do</option>

                  <option value="in_progress">In Progress</option>

                  <option value="blocked">Blocked</option>

                  <option value="review">ð Review</option>

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

                  <option value="p0">P0 â Critical</option>

                  <option value="p1">P1 â High</option>

                  <option value="p2">P2 â Normal</option>

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

                  <option value="task">â Task</option>

                  <option value="bug">ð Bug</option>

                  <option value="feature">â¨ Feature</option>

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

                  <option value="keith">Keith</option>

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

                  <option value="">â select â</option>

                  {allProjectNames.map((p) => (

                    <option key={p} value={p}>{p}</option>

                  ))}

                </select>

              </div>

            </div>

            {/* Ready for review toggle */}

            <div>

              <button

                onClick={() => {

                  const v = !selectedTask.ready_for_review;

                  updateTask(selectedTask.id, { ready_for_review: v });

                  setSelectedTask((p) => p ? { ...p, ready_for_review: v } : null);

                }}

                className="w-full px-3 py-2.5 rounded-md text-xs font-semibold flex items-center justify-center gap-2 transition-colors"

                style={{

                  background: selectedTask.ready_for_review ? "#7c3aed" : "#21262d",

                  color: selectedTask.ready_for_review ? "#fff" : "#8b949e",

                  border: "1px solid",

                  borderColor: selectedTask.ready_for_review ? "#7c3aed" : "#30363d",

                }}

              >

                ð {selectedTask.ready_for_review ? "Marked Ready for Review â click to unmark" : "Mark Ready for Review"}

              </button>

            </div>

            <div>

              <label className="block text-xs mb-1" style={{ color: "#8b949e" }}>Notes / Evidence</label>

              <textarea

                className="w-full px-3 py-2 rounded-md text-sm outline-none resize-none font-mono"

                style={{ background: "#0d1117", border: "1px solid #30363d", color: selectedTask.assignee === "claude" ? "#d97706" : "#e6edf3" }}

                rows={6}

                placeholder={selectedTask.assignee === "claude" ? "Claude will log evidence hereâ¦" : "Add notes, links, contextâ¦"}

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

                  <span className="text-xs ml-auto" style={{ color: "#484f58" }}>{elapsed.color === "#f85149" ? "â  may be hung" : "working"}</span>

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

                  {triggering ? "Triggeringâ¦" : selectedTask.status === "in_progress" ? "â³ Re-trigger" : "â¶ Run Now"}

                </button>

                <button

                  onClick={() => updateTask(selectedTask.id, { status: "done" })}

                  className="px-3 py-2 rounded-md text-xs font-semibold"

                  style={{ background: "#1a7f37", color: "#fff" }}

                >

                  â Done

                </button>

                {selectedTask.status === "in_progress" && (

                  <button

                    onClick={async () => {

                      if (!confirm("Reset and re-run this task? Claude will start fresh.")) return;

                      // Reset first

                      await fetch(`/api/tasks/${selectedTask.id}`, {

                        method: "PATCH",

                        headers: { "Content-Type": "application/json" },

                        body: JSON.stringify({ reset: true }),

                      });

                      // Then immediately re-trigger

                      const triggerRes = await fetch(`/api/tasks/${selectedTask.id}/trigger`, {

                        method: "POST",

                        headers: { "Content-Type": "application/json" },

                        body: JSON.stringify({ model: "claude-sonnet-4-6" }),

                      });

                      if (triggerRes.ok) {

                        const updates = { status: "in_progress" as Task["status"], triggered_at: new Date().toISOString(), last_activity_at: new Date().toISOString() };

                        setTasks((prev) => prev.map((t) => (t.id === selectedTask.id ? { ...t, ...updates } : t)));

                        setSelectedTask((prev) => prev ? { ...prev, ...updates } : null);

                      } else {

                        alert("Reset succeeded but re-trigger failed. Use Run Now to restart.");

                        const updates = { status: "todo" as Task["status"], triggered_at: null, last_activity_at: null };

                        setTasks((prev) => prev.map((t) => (t.id === selectedTask.id ? { ...t, ...updates } : t)));

                        setSelectedTask((prev) => prev ? { ...prev, ...updates } : null);

                      }

                    }}

                    className="px-3 py-2 rounded-md text-xs font-semibold"

                    style={{ background: "#21262d", color: "#f85149", border: "1px solid #f8514930" }}

                  >

                    âº Restart

                  </button>

                )}

              </>

            ) : (

              <button

                onClick={() => updateTask(selectedTask.id, { status: "done" })}

                className="flex-1 py-2 rounded-md text-xs font-semibold"

                style={{ background: "#1a7f37", color: "#fff" }}

              >

                â Mark Done

              </button>

            )}

            <button

              onClick={() => deleteTask(selectedTask.id)}

              className="px-4 py-2 rounded-md text-xs"

