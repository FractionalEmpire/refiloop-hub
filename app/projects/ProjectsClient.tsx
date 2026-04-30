"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

type ProjectData = {
  name: string;
  tasks: { id: string; title: string; status: string; priority: string; assignee: string }[];
  counts: { todo: number; in_progress: number; blocked: number; done: number };
};

const STATUS_COLOR: Record<string, string> = {
  todo: "#8b949e",
  in_progress: "#58a6ff",
  blocked: "#f85149",
  done: "#3fb950",
};

const PRIORITY_COLOR: Record<string, string> = {
  p0: "#f85149", p1: "#d29922", p2: "#58a6ff", later: "#484f58",
};

function statusBadge(label: string, count: number, color: string) {
  if (count === 0) return null;
  return (
    <span
      key={label}
      className="text-xs px-2 py-0.5 rounded-full font-medium"
      style={{ background: `${color}20`, color, border: `1px solid ${color}40` }}
    >
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

export default function ProjectsClient() {
  const [projects, setProjects] = useState<ProjectData[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/projects")
      .then((r) => r.json())
      .then((data) => { setProjects(Array.isArray(data) ? data : []); setLoading(false); });
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64" style={{ color: "#8b949e" }}>
        Loading projects…
      </div>
    );
  }

  if (projects.length === 0) {
    return (
      <div className="p-8">
        <h1 className="text-xl font-semibold mb-2" style={{ color: "#e6edf3" }}>Projects</h1>
        <p style={{ color: "#8b949e" }}>No tasks with projects yet. Add a project name to a task to group it here.</p>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-xl font-semibold" style={{ color: "#e6edf3" }}>Projects</h1>
        <p className="text-sm mt-1" style={{ color: "#8b949e" }}>
          {projects.length} projects · grouped from Tasks
        </p>
      </div>

      <div className="space-y-3">
        {projects.map((proj) => {
          const health = getHealth(proj.counts);
          const isExpanded = expanded === proj.name;
          const total = proj.tasks.length;
          const doneCount = proj.counts.done;
          const pct = total > 0 ? Math.round((doneCount / total) * 100) : 0;

          return (
            <div
              key={proj.name}
              className="rounded-xl border"
              style={{ background: "#161b22", borderColor: isExpanded ? "#30363d" : "#21262d" }}
            >
              {/* Header row */}
              <button
                className="w-full text-left px-5 py-4 flex items-center gap-4"
                onClick={() => setExpanded(isExpanded ? null : proj.name)}
              >
                {/* Health dot */}
                <div
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ background: health.color }}
                />

                {/* Name + badges */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <span className="text-sm font-semibold" style={{ color: "#e6edf3" }}>{proj.name}</span>
                    <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: "#21262d", color: "#8b949e" }}>
                      {health.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                    {statusBadge("todo", proj.counts.todo, STATUS_COLOR.todo)}
                    {statusBadge("in progress", proj.counts.in_progress, STATUS_COLOR.in_progress)}
                    {statusBadge("blocked", proj.counts.blocked, STATUS_COLOR.blocked)}
                    {statusBadge("done", proj.counts.done, STATUS_COLOR.done)}
                  </div>
                </div>

                {/* Progress */}
                <div className="shrink-0 text-right w-20">
                  <div className="text-xs mb-1" style={{ color: "#8b949e" }}>{pct}% done</div>
                  <div className="w-20 h-1.5 rounded-full overflow-hidden" style={{ background: "#21262d" }}>
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${pct}%`, background: pct === 100 ? "#3fb950" : "#58a6ff" }}
                    />
                  </div>
                </div>

                {/* Expand arrow */}
                <span className="text-xs shrink-0 ml-2" style={{ color: "#484f58" }}>
                  {isExpanded ? "▲" : "▼"}
                </span>
              </button>

              {/* Expanded task list */}
              {isExpanded && (
                <div className="border-t" style={{ borderColor: "#21262d" }}>
                  <div className="px-5 py-1">
                    {proj.tasks.map((task) => (
                      <div
                        key={task.id}
                        className="flex items-center gap-3 py-2.5 border-b last:border-b-0"
                        style={{ borderColor: "#21262d" }}
                      >
                        <div
                          className="w-1.5 h-1.5 rounded-full shrink-0"
                          style={{ background: STATUS_COLOR[task.status] ?? "#8b949e" }}
                        />
                        <span className="text-sm flex-1" style={{ color: "#c9d1d9" }}>{task.title}</span>
                        <span
                          className="text-xs px-1.5 py-0.5 rounded font-bold shrink-0"
                          style={{ color: PRIORITY_COLOR[task.priority] ?? "#8b949e" }}
                        >
                          {(task.priority ?? "").toUpperCase()}
                        </span>
                        <span className="text-xs shrink-0" style={{ color: "#484f58" }}>
                          {task.assignee}
                        </span>
                        <span
                          className="text-xs px-1.5 py-0.5 rounded shrink-0"
                          style={{ background: "#21262d", color: STATUS_COLOR[task.status] ?? "#8b949e" }}
                        >
                          {task.status.replace("_", " ")}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="px-5 py-3">
                    <Link
                      href={`/tasks?project=${encodeURIComponent(proj.name)}`}
                      className="text-xs"
                      style={{ color: "#58a6ff" }}
                    >
                      → View in Tasks board
                    </Link>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
