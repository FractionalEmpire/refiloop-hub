import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { appendTaskTrace } from "@/lib/task-trace";
import { runClaudeTask } from "../execute/route";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  const appUrl = new URL(req.url).origin;
  const body = await req.json().catch(() => ({}));
  const model = body.model || "claude-sonnet-4-6";
  const internalKey = process.env.INTERNAL_API_KEY || "";

  const { data: task, error } = await supabase
    .from("collab_tasks")
    .select("id, assignee")
    .eq("id", id)
    .single();

  if (error || !task) return NextResponse.json({ error: "Task not found" }, { status: 404 });
  if (task.assignee !== "claude") {
    return NextResponse.json({ error: "Task is not assigned to Claude" }, { status: 400 });
  }

  await appendTaskTrace(id, `Trigger requested via ${appUrl} using model ${model}.`);
  await appendTaskTrace(
    id,
    `Env check: anthropic=${Boolean(process.env.BUILDER_HUB_ANTHROPIC_KEY || process.env.ANTHROPIC_API_KEY)} github=${Boolean(process.env.GITHUB_TOKEN)} internal_api_key=${Boolean(internalKey)}`
  );

  await supabase
    .from("collab_tasks")
    .update({
      status: "in_progress",
      triggered_at: new Date().toISOString(),
      last_activity_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  await appendTaskTrace(id, "Calling executor directly inside the trigger route to avoid Vercel deployment protection on internal HTTP calls.");
  await runClaudeTask(id, model);

  const { data: afterDispatch } = await supabase
    .from("collab_tasks")
    .select("status, triggered_at")
    .eq("id", id)
    .single();

  await appendTaskTrace(id, `Executor endpoint finished. Current task status: ${afterDispatch?.status || "unknown"}.`);

  return NextResponse.json({
    ok: true,
    status: afterDispatch?.status || "unknown",
    triggered_at: afterDispatch?.triggered_at || null,
    message: "Claude is on it. Evidence will appear in task notes when done.",
  });
}
