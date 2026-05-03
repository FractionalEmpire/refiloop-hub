import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// Called by Vercel cron every 5 minutes (configured in vercel.json).
// Two jobs: (1) reset stuck in_progress tasks, (2) trigger new todo tasks.
const STUCK_MINUTES = 10;

export async function GET(req: NextRequest) {
  const cronSecret = req.headers.get("authorization");
  if (process.env.CRON_SECRET && cronSecret !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://refiloop-hub.vercel.app";
  const key = process.env.INTERNAL_API_KEY || "";
  const stuckCutoff = new Date(Date.now() - STUCK_MINUTES * 60 * 1000).toISOString();

  // --- Step 1: reset tasks Vercel killed mid-execution ---
  // Case A: had a heartbeat but it's stale (Vercel hit maxDuration and was killed)
  const { data: stuckWithActivity } = await supabase
    .from("collab_tasks")
    .select("id, title")
    .eq("assignee", "claude")
    .eq("status", "in_progress")
    .lt("last_activity_at", stuckCutoff);

  // Case B: triggered but never got a first heartbeat (executor crashed on startup)
  const { data: stuckNoActivity } = await supabase
    .from("collab_tasks")
    .select("id, title")
    .eq("assignee", "claude")
    .eq("status", "in_progress")
    .is("last_activity_at", null)
    .lt("triggered_at", stuckCutoff);

  const stuckTasks = [...(stuckWithActivity ?? []), ...(stuckNoActivity ?? [])];
  let reset = 0;
  for (const t of stuckTasks) {
    await supabase
      .from("collab_tasks")
      .update({ status: "todo", triggered_at: null, last_activity_at: null, updated_at: new Date().toISOString() })
      .eq("id", t.id);
    reset++;
  }

  // --- Step 2: pick up todo tasks ---
  const { data: tasks, error } = await supabase
    .from("collab_tasks")
    .select("id, title")
    .eq("assignee", "claude")
    .eq("status", "todo");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let triggered = 0;
  for (const task of tasks ?? []) {
    await supabase
      .from("collab_tasks")
      .update({ status: "in_progress", triggered_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", task.id);

    fetch(`${appUrl}/api/tasks/${task.id}/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-internal-key": key },
    }).catch(() => {});

    triggered++;
  }

  return NextResponse.json({
    ok: true,
    reset,
    triggered,
    stuckReset: stuckTasks.map((t) => t.title),
    tasks: (tasks ?? []).map((t) => t.title),
  });
}
