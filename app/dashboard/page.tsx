import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { supabase } from "@/lib/supabase";
export const dynamic = "force-dynamic";
import { getRecentCommits } from "@/lib/github";
import AppShell from "@/components/AppShell";
import { formatDistanceToNow } from "date-fns";
import type { Task, EODUpdate } from "@/lib/supabase";

export default async function DashboardPage() {
  const user = getCurrentUser();
  if (!user) redirect("/login");

  const now = new Date().toISOString();

  const [tasksRes, eodRes, commits, eligibleOwnersRes, pendingSkipTraceRes] = await Promise.all([
    supabase.from("collab_tasks").select("*").order("priority").order("created_at"),
    supabase.from("collab_eod_updates").select("*").order("created_at", { ascending: false }).limit(5),
    getRecentCommits(5),
    supabase.from("owners").select("id").eq("skip_trace_match", true).or("dnc.is.null,dnc.eq.false").not("outreach_status", "in", '("dnc","contacted","call_later")'),
    supabase.from("owners").select("*", { count: "exact", head: true }).eq("skip_trace_eligible", true).or("skip_trace_done.is.null,skip_trace_done.eq.false"),
  ]);

  const eligibleOwnerIds = (eligibleOwnersRes.data || []).map((o: { id: number }) => o.id);
  const eligibleOwnerCount = eligibleOwnerIds.length;
  const pendingSkipTrace = pendingSkipTraceRes.count || 0;

  let eligiblePhones = 0;
  if (eligibleOwnerIds.length > 0) {
    const phonesRes = await supabase.from("owner_phones").select("*", { count: "exact", head: true }).in("owner_id", eligibleOwnerIds);
    eligiblePhones = phonesRes.count || 0;
  }

  const DAILY_DIAL_TARGET = 250;
  const pipelineStatus = eligiblePhones < DAILY_DIAL_TARGET ? "critical" : eligiblePhones < DAILY_DIAL_TARGET * 2 ? "low" : "healthy";
  const tasks: Task[] = tasksRes.data || [];
  const eods: EODUpdate[] = eodRes.data || [];
  const myTasks = tasks.filter((t) => t.assignee === user || t.assignee === "both");
  const p0Open = tasks.filter((t) => t.priority === "p0" && t.status !== "done");
  const inProgress = tasks.filter((t) => t.status === "in_progress").length;
  const done = tasks.filter((t) => t.status === "done").length;
  const urgentTasks = tasks.filter((t) => ["p0", "p1"].includes(t.priority) && t.status !== "done").slice(0, 8);
  const PRIORITY_COLOR: Record<string, string> = { p0: "#f85149", p1: "#d29922", p2: "#58a6ff", later: "#484f58" };
  const STATUS_COLOR: Record<string, string> = { todo: "#8b949e", in_progress: "#58a6ff", done: "#3fb950", blocked: "#f85149" };

  const callerIds = [
    { number: "214-894-8571", label: "TX Dallas",         areaState: "TX", calls: 11,  rgAddedDate: "2026-05-04" },
    { number: "346-646-3390", label: "TX Houston (Kirk)",  areaState: "TX", calls: 172, rgAddedDate: "2026-05-05" },
    { number: "919-892-3024", label: "NC 919",            areaState: "NC", calls: 0,   rgAddedDate: "2026-05-06" },
  ];
  // Loan counts by state (loans table — full pipeline, not just skip-traced owners)
  const stateOwners = [
    { state: "TX", count: 72647 }, { state: "FL", count: 61523 }, { state: "NC", count: 33537 },
    { state: "OH", count: 31128 }, { state: "GA", count: 17216 }, { state: "SC", count: 16291 }, { state: "TN", count: 16135 },
  ];
  const coveredStates = new Set(callerIds.map((c) => c.areaState));
  function getRgStatus(addedDate: string) {
    const days = Math.floor((Date.now() - new Date(addedDate).getTime()) / 86400000);
    if (days <= 3) return { label: "Submitted",  color: "#d29922", bg: "#d2992220", days };
    if (days <= 7) return { label: "Processing", color: "#e3b341", bg: "#e3b34120", days };
    return              { label: "Accepted ✓", color: "#3fb950", bg: "#3fb95020", days };
  }
  const anyRgPending  = callerIds.some((c) => getRgStatus(c.rgAddedDate).days < 8);
  const missingStates = stateOwners.filter((s) => !coveredStates.has(s.state) && s.count > 100);

  return (
    <AppShell user={user}>
      <div className="p-8 max-w-6xl">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold" style={{ color: "#e6edf3" }}>
            Good {getGreeting()},{" "}
            <span style={{ color: user === "david" ? "#58a6ff" : "#3fb950" }}>{user === "david" ? "David" : "Gorjan"}</span>
          </h1>
          <p className="mt-1 text-sm" style={{ color: "#8b949e" }}>
            {new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
          </p>
        </div>

        {/* Call Pipeline Alert */}
        <div className="mb-6 rounded-xl border p-5" style={{ background: pipelineStatus === "critical" ? "#2d1a1a" : pipelineStatus === "low" ? "#2d2200" : "#161b22", borderColor: pipelineStatus === "critical" ? "#f85149" : pipelineStatus === "low" ? "#d29922" : "#30363d" }}>
          <div className="flex items-center gap-2 mb-4">
            <span className="text-sm font-semibold" style={{ color: "#e6edf3" }}>
              {pipelineStatus === "critical" ? "🚨" : pipelineStatus === "low" ? "⚠️" : "✅"} Call Pipeline
            </span>
            <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: pipelineStatus === "critical" ? "#f8514920" : pipelineStatus === "low" ? "#d2992220" : "#3fb95020", color: pipelineStatus === "critical" ? "#f85149" : pipelineStatus === "low" ? "#d29922" : "#3fb950" }}>
              {pipelineStatus === "critical" ? `BELOW DAILY TARGET — need ${DAILY_DIAL_TARGET - eligiblePhones} more phones` : pipelineStatus === "low" ? "Running low — less than 2 days of calls queued" : "Healthy"}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-6">
            <div>
              <div className="text-3xl font-bold mb-1" style={{ color: pipelineStatus === "critical" ? "#f85149" : pipelineStatus === "low" ? "#d29922" : "#3fb950" }}>{eligiblePhones.toLocaleString()}</div>
              <div className="text-xs font-medium" style={{ color: "#c9d1d9" }}>Callable phones</div>
              <div className="text-xs mt-0.5" style={{ color: "#484f58" }}>Kirk&apos;s daily target: {DAILY_DIAL_TARGET.toLocaleString()}</div>
            </div>
            <div>
              <div className="text-3xl font-bold mb-1" style={{ color: "#58a6ff" }}>{eligibleOwnerCount.toLocaleString()}</div>
              <div className="text-xs font-medium" style={{ color: "#c9d1d9" }}>Callable owners</div>
              <div className="text-xs mt-0.5" style={{ color: "#484f58" }}>skip traced &amp; eligible</div>
            </div>
            <div>
              <div className="text-3xl font-bold mb-1" style={{ color: pendingSkipTrace > 500 ? "#d29922" : "#8b949e" }}>{pendingSkipTrace.toLocaleString()}</div>
              <div className="text-xs font-medium" style={{ color: "#c9d1d9" }}>Awaiting skip trace</div>
              <div className="text-xs mt-0.5" style={{ color: "#484f58" }}>eligible but not yet traced</div>
            </div>
          </div>
        </div>

        {/* Mojo Dialer Health */}
        <div className="mb-6 rounded-xl border p-5" style={{ background: "#161b22", borderColor: "#30363d" }}>
          <div className="flex items-center gap-3 mb-4">
            <span className="text-sm font-semibold" style={{ color: "#e6edf3" }}>📞 Mojo Dialer Health</span>
            {anyRgPending && <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: "#d2992220", color: "#d29922" }}>Reputation Guard Pending</span>}
            {missingStates.length > 0 && <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: "#f8514920", color: "#f85149" }}>{missingStates.length} top markets missing local #</span>}
          </div>
          <div className="grid grid-cols-2 gap-6">
            <div>
              <div className="text-xs font-semibold mb-2" style={{ color: "#8b949e" }}>CALLER IDs IN ROTATION ({callerIds.length})</div>
              <div className="space-y-2">
                {callerIds.map((c) => {
                  const rg = getRgStatus(c.rgAddedDate);
                  return (
                    <div key={c.number} className="flex items-center justify-between rounded-lg px-3 py-2" style={{ background: "#0d1117", border: "1px solid #21262d" }}>
                      <div>
                        <div className="text-xs font-mono font-semibold" style={{ color: "#e6edf3" }}>{c.number}</div>
                        <div className="text-xs mt-0.5" style={{ color: "#484f58" }}>{c.label} · {c.calls} calls</div>
                      </div>
                      <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: rg.bg, color: rg.color }}>RG: {rg.label}</span>
                    </div>
                  );
                })}
              </div>
              <div className="mt-2 text-xs" style={{ color: "#484f58" }}>
                Accepted after ~8 days. <a href="https://app991.mojosells.com/settings/dialer/caller-id-mojo-voice/" target="_blank" rel="noopener noreferrer" style={{ color: "#58a6ff" }}>Manage in Mojo →</a>
              </div>
            </div>
            <div>
              <div className="text-xs font-semibold mb-2" style={{ color: "#8b949e" }}>LOCAL # COVERAGE BY TOP MARKET</div>
              <div className="space-y-1.5">
                {stateOwners.map((s) => {
                  const covered = coveredStates.has(s.state);
                  return (
                    <div key={s.state} className="flex items-center gap-2">
                      <span className="text-xs w-4 font-mono font-bold" style={{ color: covered ? "#3fb950" : "#f85149" }}>{covered ? "✓" : "✗"}</span>
                      <span className="text-xs font-semibold w-6" style={{ color: "#c9d1d9" }}>{s.state}</span>
                      <div className="flex-1 h-1.5 rounded-full" style={{ background: "#21262d" }}>
                        <div className="h-1.5 rounded-full" style={{ width: `${Math.min(100,(s.count/5121)*100)}%`, background: covered ? "#3fb950" : "#f85149" }} />
                      </div>
                      <span className="text-xs w-12 text-right" style={{ color: "#484f58" }}>{s.count.toLocaleString()}</span>
                    </div>
                  );
                })}
              </div>
              {missingStates.length > 0 && <div className="mt-3 text-xs rounded px-2 py-1.5" style={{ background: "#2d1a1a", color: "#f85149" }}>⚠️ Add local #s for: {missingStates.map((s) => s.state).join(", ")} — biggest uncovered markets</div>}
            </div>
          </div>
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
          <div className="rounded-xl border" style={{ background: "#161b22", borderColor: "#30363d" }}>
            <div className="px-5 py-4 border-b" style={{ borderColor: "#30363d" }}><h2 className="text-sm font-semibold" style={{ color: "#e6edf3" }}>🔴 Open P0 / P1 Tasks</h2></div>
            <div className="divide-y" style={{ borderColor: "#21262d" }}>
              {urgentTasks.map((t) => (
                <div key={t.id} className="px-5 py-3 flex items-center gap-3">
                  <span className="text-xs font-mono px-1.5 py-0.5 rounded shrink-0" style={{ background: `${PRIORITY_COLOR[t.priority]}20`, color: PRIORITY_COLOR[t.priority] }}>{t.priority.toUpperCase()}</span>
                  <div className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0" style={{ background: t.assignee === "david" ? "#1f6feb" : t.assignee === "gorjan" ? "#1a7f37" : "#6e40c9", color: "#fff" }}>
                    {t.assignee === "david" ? "D" : t.assignee === "gorjan" ? "G" : "B"}
                  </div>
                  <span className="text-xs flex-1 truncate" style={{ color: "#c9d1d9" }}>{t.title}</span>
                  <span className="text-xs px-1.5 py-0.5 rounded capitalize shrink-0" style={{ background: `${STATUS_COLOR[t.status]}20`, color: STATUS_COLOR[t.status] }}>{t.status.replace("_", " ")}</span>
                </div>
              ))}
              {urgentTasks.length === 0 && <div className="px-5 py-6 text-sm text-center" style={{ color: "#484f58" }}>All P0/P1 tasks done 🎉</div>}
            </div>
            <div className="px-5 py-3 border-t" style={{ borderColor: "#30363d" }}><a href="/tasks" className="text-xs" style={{ color: "#58a6ff" }}>View all tasks →</a></div>
          </div>

          <div className="rounded-xl border" style={{ background: "#161b22", borderColor: "#30363d" }}>
            <div className="px-5 py-4 border-b" style={{ borderColor: "#30363d" }}><h2 className="text-sm font-semibold" style={{ color: "#e6edf3" }}>📋 Recent EOD Updates</h2></div>
            <div className="divide-y" style={{ borderColor: "#21262d" }}>
              {eods.map((e) => (
                <div key={e.id} className="px-5 py-4">
                  <div className="flex items-center gap-2 mb-1.5">
                    <div className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold" style={{ background: e.author === "david" ? "#1f6feb" : "#1a7f37", color: "#fff" }}>{e.author === "david" ? "D" : "G"}</div>
                    <span className="text-xs font-medium capitalize" style={{ color: "#e6edf3" }}>{e.author}</span>
                    <span className="text-xs" style={{ color: "#484f58" }}>{formatDistanceToNow(new Date(e.created_at), { addSuffix: true })}</span>
                  </div>
                  <p className="text-xs leading-relaxed line-clamp-3" style={{ color: "#8b949e" }}>{e.content}</p>
                  {e.blockers && <p className="text-xs mt-1" style={{ color: "#f85149" }}>🚧 {e.blockers}</p>}
                </div>
              ))}
              {eods.length === 0 && <div className="px-5 py-6 text-sm text-center" style={{ color: "#484f58" }}>No EOD updates yet</div>}
            </div>
            <div className="px-5 py-3 border-t" style={{ borderColor: "#30363d" }}><a href="/eod" className="text-xs" style={{ color: "#58a6ff" }}>Post an EOD update →</a></div>
          </div>

          <div className="rounded-xl border" style={{ background: "#161b22", borderColor: "#30363d" }}>
            <div className="px-5 py-4 border-b" style={{ borderColor: "#30363d" }}>
              <h2 className="text-sm font-semibold" style={{ color: "#e6edf3" }}>🔀 Recent Commits <span className="text-xs font-normal" style={{ color: "#484f58" }}>refiloop-config</span></h2>
            </div>
            <div className="divide-y" style={{ borderColor: "#21262d" }}>
              {commits.length > 0 ? commits.map((c: { sha: string; url: string; message: string; author: string; date: string }) => (
                <a key={c.sha} href={c.url} target="_blank" rel="noopener noreferrer" className="flex items-start gap-3 px-5 py-3 transition-colors block hover:bg-[#21262d]" style={{ textDecoration: "none" }}>
                  <code className="text-xs shrink-0 mt-0.5" style={{ color: "#58a6ff" }}>{c.sha}</code>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs truncate" style={{ color: "#c9d1d9" }}>{c.message}</p>
                    <p className="text-xs mt-0.5" style={{ color: "#484f58" }}>{c.author} · {formatDistanceToNow(new Date(c.date), { addSuffix: true })}</p>
                  </div>
                </a>
              )) : <div className="px-5 py-6 text-sm text-center" style={{ color: "#484f58" }}>Add GITHUB_TOKEN env var to see commits</div>}
            </div>
          </div>

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
                  <div className="w-4 h-4 rounded border flex items-center justify-center shrink-0 text-xs" style={{ borderColor: done ? "#3fb950" : "#30363d", background: done ? "#1a7f3730" : "transparent", color: "#3fb950" }}>{done ? "✓" : ""}</div>
                  <span style={{ color: done ? "#c9d1d9" : "#484f58" }}>{label}</span>
                </div>
              ))}
            </div>
            <div className="px-5 py-3 border-t" style={{ borderColor: "#30363d" }}><a href="/context" className="text-xs" style={{ color: "#58a6ff" }}>Full onboarding guide →</a></div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "morning";
  if (h < 17) return "afternoon";
  return "evening";
    }
