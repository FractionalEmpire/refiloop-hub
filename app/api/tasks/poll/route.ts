import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// Called by Vercel cron every 5 minutes (configured in vercel.json).
// Picks up any claude-assigned tasks in "todo" state and triggers the executor.

export async function GET(req: NextRequest) {
  // Vercel cron sends this header; block external calls
  const cronSecret = req.headers.get("authorization");
  if (process.env.CRON_SECRET && cronSecret !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: tasks, error } = await supabase
    .from("collab_tasks")
    .select("id, title")
    .eq("assignee", "claude")
    .eq("status", "todo");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!tasks || tasks.length === 0) return NextResponse.json({ ok: true, triggered: 0 });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://refiloop-hub.vercel.app";
  const key = process.env.INTERNAL_API_KEY || "";

  // Trigger executor for each pending claude task (fire and forget, one at a time)
  for (const task of tasks) {
    // Mark in_progress first so we don't double-trigger on next poll
    await supabase
      .from("collab_tasks")
      .update({ status: "in_progress", triggered_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", task.id);

    fetch(`${appUrl}/api/tasks/${task.id}/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-internal-key": key },
    }).catch(() => {});
  }

  return NextResponse.json({ ok: true, triggered: tasks.length, tasks: tasks.map((t) => t.title) });
}
