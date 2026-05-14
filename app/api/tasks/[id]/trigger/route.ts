import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { appendTaskTrace } from "@/lib/task-trace";

export const dynamic = "force-dynamic";

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

  const res = await fetch(`${appUrl}/api/tasks/${id}/execute`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-key": internalKey,
    },
    body: JSON.stringify({ model }),
  }).catch((err) => err as Error);

  if (res instanceof Error) {
    await appendTaskTrace(id, `Trigger dispatch failed before executor response: ${res.message}`);
    return NextResponse.json({ ok: false, error: res.message }, { status: 500 });
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    await appendTaskTrace(id, `Executor endpoint returned HTTP ${res.status}: ${text || "no body"}`);
    return NextResponse.json({ ok: false, error: `Executor failed with HTTP ${res.status}` }, { status: 500 });
  }

  const { data: afterDispatch } = await supabase
    .from("collab_tasks")
    .select("status")
    .eq("id", id)
    .single();

  await appendTaskTrace(id, `Executor endpoint finished. Current task status: ${afterDispatch?.status || "unknown"}.`);

  return NextResponse.json({
    ok: true,
    status: afterDispatch?.status || "unknown",
    message: "Claude is on it. Evidence will appear in task notes when done.",
  });
}
