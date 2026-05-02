import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { supabase } from "@/lib/supabase";
export const dynamic = "force-dynamic";
import { getRecentCommits } from "@/lib/github";
import { formatDistanceToNow } from "date-fns";
import type { Task, EODUpdate } from "@/lib/supabase";

export default async function DashboardPage() {
  const user = getCurrentUser();
  if (!user) redirect("/login");

  const [tasksRes, eodRes, commits] = await Promise.all([
    supabase.from("collab_tasks").select("*").order("priority").order("created_at"),
    supabase.from("collab_eod_updates").select("*").order("created_at", { ascending: false }).limit(5),
    getRecentCommits(5),
  ]);

  const tasks: Task[] = tasksRes.data || [];
  const eods: EODUpdate[] = eodRes.data || [];

  const myTasks = tasks.filter((t) => t.assignee === user || t.assignee === "both");
  const p0Open = tasks.filter((t) => t.priority === "p0" && t.status !== "done");
  const inProgress = tasks.filter((t) => t.status === "in_progress").length;
  const done = tasks.filter((t) => t.status === "done").length;
  const urgentTasks = tasks.filter((t) => ["p0", "p1"].includes(t.priority) && t.status !== "done").slice(0, 8);

  const PRIORITY_COLOR: Record<string, string> = {
    p0: "#f85149", p1: "#d29922", p2: "#58a6ff", later: "#484f58",
  };
  const STATUS_COLOR: Record<string, string> = {
    todo: "#8b949e", in_progress: "#58a6ff", done: "#3fb950", blocked: "#f85149",
  };

  return (
    <div className="p-8 max-w-6xl">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-semibold" style={{ color: "#e6edf3" }}>
          Good {getGreeting()},{" "}
          <span style={{ color: user === "david" ? "#58a6ff" : "#3fb950" }}>
            {user === "david" ? "David" : "Gorjan"}
          </span>
        </h1>
        <p className="mt-1 text-sm" style={{ color: "#8b949e" }}>
          {new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        {[
          { label: "My Open Tasks", value: myTasks.filter((t) => t.status !== "done").length, color: user === "david" ? "#58a6ff" : "#3fb950" },
          { label: "P0 Blockers", value: p0Open.length, color: p0Open.length > 0 ? "#f85149" : "#3fb950" },
          { label: "In Progress", value: inProgress, color: "#d29922" },
          { label: "Completed", value: done, color: "#3fb950" },
        ].map((s) => (
          <div key={s.label} className="rounded-xl p-4 border" style={{ background: "#161b22", borderColor: "#30363d" }}>
            <div className="text-2xl font-bold mb-1" style={{ color: s.color }}>{s.value}</div>
            <div className="text-xs" style={{ color: "#8b949e" }}>{s.label}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Urgent Tasks */}
        <div className="rounded-xl border" style={{ background: "#161b22", borderColor: "#30363d" }}>
          <div className="px-5 py-4 border-b" style={{ borderColor: "#30363d" }}>
            <h2 className="text-sm font-semibold" style={{ color: "#e6edf3" }}>🔴 Open P0 / P1 Tasks</h2>
          </div>
          <div className="divide-y" style={{ borderColor: "#21262d" }}>
            {urgentTasks.map((t) => (
              <div key={t.id} className="px-5 py-3 flex items-center gap-3">
                <span
                  className="text-xs font-mono px-1.5 py-0.5 rounded shrink-0"
                  style={{ background: `${PRIORITY_COLOR[t.priority]}20`, color: PRIORITY_COLOR[t.priority] }}
                >
                  {t.priority.toUpperCase()}
                </span>
                <div
                  className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                  style={{
                    background: t.assignee === "david" ? "#1f6feb" : t.assignee === "gorjan" ? "#1a7f37" : "#6e40c9",
                    color: "#fff",
                  }}
                >
                  {t.assignee === "david" ? "D" : t.assignee === "gorjan" ? "G" : "B"}
                </div>
                <span className="text-xs flex-1 truncate" style={{ color: "#c9d1d9" }}>{t.title}</span>
                <span
                  className="text-xs px-1.5 py-0.5 rounded capitalize shrink-0"
                  style={{ background: `${STATUS_COLOR[t.status]}20`, color: STATUS_COLOR[t.status] }}
                >
                  {t.status.replace("_", " ")}
                </span>
              </div>
            ))}
            {urgentTasks.length === 0 && (
              <div className="px-5 py-6 text-sm text-center" style={{ color: "#484f58" }}>
                All P0/P1 tasks done 🎉
              </div>
            )}
          </div>
          <div className="px-5 py-3 border-t" style={{ borderColor: "#30363d" }}>
            <a href="/tasks" className="text-xs" style={{ color: "#58a6ff" }}>View all tasks →</a>
          </div>
        </div>

        {/* EOD Feed */}
        <div className="rounded-xl border" style={{ background: "#161b22", borderColor: "#30363d" }}>
          <div className="px-5 py-4 border-b" style={{ borderColor: "#30363d" }}>
            <h2 className="text-sm font-semibold" style={{ color: "#e6edf3" }}>📋 Recent EOD Updates</h2>
          </div>
          <div className="divide-y" style={{ borderColor: "#21262d" }}>
            {eods.map((e) => (
              <div key={e.id} className="px-5 py-4">
                <div className="flex items-center gap-2 mb-1.5">
                  <div
                    className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold"
                    style={{ background: e.author === "david" ? "#1f6feb" : "#1a7f37", color: "#fff" }}
                  >
                    {e.author === "david" ? "D" : "G"}
                  </div>
                  <span className="text-xs font-medium capitalize" style={{ color: "#e6edf3" }}>{e.author}</span>
                  <span className="text-xs" style={{ color: "#484f58" }}>
                    {formatDistanceToNow(new Date(e.created_at), { addSuffix: true })}
                  </span>
                </div>
                <p className="text-xs leading-relaxed line-clamp-3" style={{ color: "#8b949e" }}>{e.content}</p>
                {e.blockers && (
                  <p className="text-xs mt-1" style={{ color: "#f85149" }}>🚧 {e.blockers}</p>
                )}
              </div>
            ))}
            {eods.length === 0 && (
              <div className="px-5 py-6 text-sm text-center" style={{ color: "#484f58" }}>No EOD updates yet</div>
            )}
          </div>
          <div className="px-5 py-3 border-t" style={{ borderColor: "#30363d" }}>
            <a href="/eod" className="text-xs" style={{ color: "#58a6ff" }}>Post an EOD update →</a>
          </div>
        </div>

        {/* Recent Commits */}
        <div className="rounded-xl border" style={{ background: "#161b22", borderColor: "#30363d" }}>
          <div className="px-5 py-4 border-b" style={{ borderColor: "#30363d" }}>
            <h2 className="text-sm font-semibold" style={{ color: "#e6edf3" }}>
              🔀 Recent Commits{" "}
              <span className="text-xs font-normal" style={{ color: "#484f58" }}>refiloop-config</span>
            </h2>
          </div>
          <div className="divide-y" style={{ borderColor: "#21262d" }}>
            {commits.length > 0 ? (
              commits.map((c: { sha: string; url: string; message: string; author: string; date: string }) => (
                <a key={c.sha} href={c.url} target="_blank" rel="noopener noreferrer"
                  className="flex items-start gap-3 px-5 py-3 transition-colors block hover:bg-[#21262d]"
                  style={{ textDecoration: "none" }}
                >
                  <code className="text-xs shrink-0 mt-0.5" style={{ color: "#58a6ff" }}>{c.sha}</code>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs truncate" style={{ color: "#c9d1d9" }}>{c.message}</p>
                    <p className="text-xs mt-0.5" style={{ color: "#484f58" }}>
                      {c.author} · {formatDistanceToNow(new Date(c.date), { addSuffix: true })}
                    </p>
                  </div>
                </a>
              ))
            ) : (
              <div className="px-5 py-6 text-sm text-center" style={{ color: "#484f58" }}>
                Add GITHUB_TOKEN env var to see commits
              </div>
            )}
          </div>
        </div>

        {/* Gorjan Access Tracker */}
        <div className="rounded-xl border" style={{ background: "#161b22", borderColor: "#30363d" }}>
          <div className="px-5 py-4 border-b flex items-center justify-between" style={{ borderColor: "#30363d" }}>
            <h2 className="text-sm font-semibold" style={{ color: "#e6edf3" }}>🔑 Gorjan System Access</h2>
            <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "#1a7f3720", color: "#3fb950" }}>5 / 9 done</span>
          </div>
          <div className="px-5 py-4 space-y-2">
            {[
              { label: "Gmail (gorjan@texastax.loan)", done: true },
              { label: "Supabase (dxvanitpqvvxvroywdml)", done: true },
              { label: "GitHub (FractionalEmpire org)", done: true },
              { label: "Vercel (david-greenbaums-projects)", done: true },
              { label: "RefiLoop Hub (refiloop-hub.vercel.app)", done: true },
              { label: "Hostinger VPS (2.24.197.63)", done: false },
              { label: "1Password (Clawd vault)", done: false },
              { label: "Nordlayer VPN", done: false },
              { label: "Mojo Dialer (account 493218)", done: false },
            ].map(({ label, done }) => (
              <div key={label} className="flex items-center gap-2.5 text-xs">
                <div className="w-4 h-4 rounded border flex items-center justify-center shrink-0 text-xs"
                  style={{ borderColor: done ? "#3fb950" : "#30363d", background: done ? "#1a7f3730" : "transparent", color: "#3fb950" }}>
                  {done ? "✓" : ""}
                </div>
                <span style={{ color: done ? "#c9d1d9" : "#484f58" }}>{label}</span>
              </div>
            ))}
          </div>
          <div className="px-5 py-3 border-t" style={{ borderColor: "#30363d" }}>
            <a href="/context" className="text-xs" style={{ color: "#58a6ff" }}>Full onboarding guide →</a>
          </div>
        </div>
      </div>
    </div>
  );
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "morning";
  if (h < 17) return "afternoon";
  return "evening";
}
