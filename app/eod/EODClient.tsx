"use client";
import { useState, useEffect } from "react";
import type { Task, EODUpdate } from "@/lib/supabase";
import { formatDistanceToNow, format } from "date-fns";

export default function EODClient({ user }: { user: "david" | "gorjan" }) {
  const [updates, setUpdates] = useState<EODUpdate[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const [content, setContent] = useState("");
  const [blockers, setBlockers] = useState("");
  const [completedIds, setCompletedIds] = useState<string[]>([]);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/eod").then((r) => r.json()),
      fetch("/api/tasks?status=in_progress").then((r) => r.json()),
    ]).then(([eods, openTasks]) => {
      setUpdates(Array.isArray(eods) ? eods : []);
      setTasks(Array.isArray(openTasks) ? openTasks : []);
      setLoading(false);
    });
  }, []);

  async function postEOD() {
    if (!content.trim()) return;
    setPosting(true);
    const res = await fetch("/api/eod", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ author: user, content, blockers: blockers || null, task_ids_completed: completedIds }),
    });
    const update = await res.json();
    setUpdates((prev) => [update, ...prev]);

    // Mark selected tasks as done
    await Promise.all(
      completedIds.map((id) =>
        fetch(`/api/tasks/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "done" }),
        })
      )
    );

    setContent("");
    setBlockers("");
    setCompletedIds([]);
    setShowForm(false);
    setPosting(false);
  }

  const userColor = (author: string) => (author === "david" ? "#1f6feb" : "#1a7f37");
  const userName = (author: string) => (author === "david" ? "David" : "Gorjan");

  return (
    <div className="p-8 max-w-3xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold" style={{ color: "#e6edf3" }}>EOD Updates</h1>
          <p className="text-sm mt-0.5" style={{ color: "#8b949e" }}>
            Daily standups, blockers, and completed work
          </p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-4 py-2 rounded-md text-sm font-semibold"
          style={{ background: user === "david" ? "#1f6feb" : "#1a7f37", color: "#fff" }}
        >
          {showForm ? "Cancel" : "+ Post EOD Update"}
        </button>
      </div>

      {/* Post Form */}
      {showForm && (
        <div
          className="rounded-xl border p-5 mb-6"
          style={{ background: "#161b22", borderColor: "#30363d" }}
        >
          <div className="flex items-center gap-2 mb-4">
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
              style={{ background: userColor(user), color: "#fff" }}
            >
              {user === "david" ? "D" : "G"}
            </div>
            <span className="text-sm font-medium" style={{ color: "#e6edf3" }}>
              {userName(user)}&apos;s EOD — {format(new Date(), "MMM d, yyyy")}
            </span>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-xs mb-1.5" style={{ color: "#8b949e" }}>
                What did you work on today? *
              </label>
              <textarea
                className="w-full px-3 py-2.5 rounded-md text-sm outline-none resize-none"
                style={{ background: "#0d1117", border: "1px solid #30363d", color: "#e6edf3" }}
                rows={5}
                placeholder="Summarize what you shipped, investigated, or made progress on today…"
                value={content}
                onChange={(e) => setContent(e.target.value)}
              />
            </div>

            {/* Tasks to check off */}
            {tasks.length > 0 && (
              <div>
                <label className="block text-xs mb-1.5" style={{ color: "#8b949e" }}>
                  Tick off completed tasks
                </label>
                <div className="space-y-1.5">
                  {tasks.map((t) => (
                    <label
                      key={t.id}
                      className="flex items-center gap-2.5 cursor-pointer p-2 rounded-md"
                      style={{ background: completedIds.includes(t.id) ? "#1f6feb10" : "transparent" }}
                    >
                      <input
                        type="checkbox"
                        checked={completedIds.includes(t.id)}
                        onChange={(e) =>
                          setCompletedIds((prev) =>
                            e.target.checked ? [...prev, t.id] : prev.filter((id) => id !== t.id)
                          )
                        }
                        className="w-3.5 h-3.5"
                        style={{ accentColor: "#58a6ff" }}
                      />
                      <span className="text-xs flex-1" style={{ color: "#c9d1d9" }}>
                        {t.title}
                      </span>
                      <span className="text-xs" style={{ color: "#484f58" }}>
                        {t.assignee === "david" ? "David" : t.assignee === "gorjan" ? "Gorjan" : "Both"}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs mb-1.5" style={{ color: "#8b949e" }}>
                Blockers / needs from David
              </label>
              <textarea
                className="w-full px-3 py-2 rounded-md text-sm outline-none resize-none"
                style={{ background: "#0d1117", border: "1px solid #30363d", color: "#e6edf3" }}
                rows={2}
                placeholder="Anything blocking you? Access needed? Decision required?"
                value={blockers}
                onChange={(e) => setBlockers(e.target.value)}
              />
            </div>

            <button
              onClick={postEOD}
              disabled={posting || !content.trim()}
              className="w-full py-2.5 rounded-md text-sm font-semibold"
              style={{
                background: user === "david" ? "#1f6feb" : "#1a7f37",
                color: "#fff",
                opacity: posting || !content.trim() ? 0.6 : 1,
              }}
            >
              {posting ? "Posting…" : "Post EOD Update"}
            </button>
          </div>
        </div>
      )}

      {/* Updates feed */}
      {loading ? (
        <div className="text-sm" style={{ color: "#484f58" }}>Loading updates…</div>
      ) : updates.length === 0 ? (
        <div
          className="rounded-xl border p-10 text-center"
          style={{ background: "#161b22", borderColor: "#30363d" }}
        >
          <p className="text-sm" style={{ color: "#484f58" }}>No EOD updates yet. Post the first one!</p>
        </div>
      ) : (
        <div className="space-y-3">
          {updates.map((u) => (
            <div
              key={u.id}
              className="rounded-xl border p-5"
              style={{ background: "#161b22", borderColor: "#30363d" }}
            >
              <div className="flex items-center gap-2.5 mb-3">
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                  style={{ background: userColor(u.author), color: "#fff" }}
                >
                  {u.author === "david" ? "D" : "G"}
                </div>
                <div>
                  <span className="text-sm font-semibold capitalize" style={{ color: "#e6edf3" }}>
                    {u.author}
                  </span>
                  <span className="text-xs ml-2" style={{ color: "#484f58" }}>
                    {format(new Date(u.date), "MMM d, yyyy")} · {formatDistanceToNow(new Date(u.created_at), { addSuffix: true })}
                  </span>
                </div>
              </div>
              <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: "#c9d1d9" }}>
                {u.content}
              </p>
              {u.blockers && (
                <div
                  className="mt-3 px-3 py-2 rounded-md flex items-start gap-2"
                  style={{ background: "#f8514910", border: "1px solid #f8514930" }}
                >
                  <span className="text-sm">🚧</span>
                  <p className="text-xs leading-relaxed" style={{ color: "#f85149" }}>
                    <span className="font-semibold">Blocker: </span>{u.blockers}
                  </p>
                </div>
              )}
              {u.task_ids_completed && u.task_ids_completed.length > 0 && (
                <div className="mt-3 flex items-center gap-1.5">
                  <span className="text-xs" style={{ color: "#3fb950" }}>✓</span>
                  <span className="text-xs" style={{ color: "#3fb950" }}>
                    {u.task_ids_completed.length} task{u.task_ids_completed.length > 1 ? "s" : ""} completed
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
