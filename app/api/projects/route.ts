import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  const [tasksRes, metaRes] = await Promise.all([
    supabase
      .from("collab_tasks")
      .select("id, project, status, priority, title, assignee")
      .not("project", "is", null)
      .neq("project", "")
      .order("project"),
    supabase.from("project_meta").select("name, is_done"),
  ]);

  if (tasksRes.error) return NextResponse.json({ error: tasksRes.error.message }, { status: 500 });

  const doneMap: Record<string, boolean> = {};
  for (const row of metaRes.data ?? []) doneMap[row.name] = row.is_done;

  const tasks = tasksRes.data ?? [];
  const projectMap: Record<string, {
    name: string;
    is_done: boolean;
    tasks: typeof tasks;
    counts: Record<string, number>;
  }> = {};

  for (const task of tasks) {
    const name = task.project || "Uncategorized";
    if (!projectMap[name]) {
      projectMap[name] = { name, is_done: doneMap[name] ?? false, tasks: [], counts: { todo: 0, in_progress: 0, blocked: 0, done: 0 } };
    }
    projectMap[name].tasks.push(task);
    const s = task.status as string;
    if (s in projectMap[name].counts) projectMap[name].counts[s]++;
  }

  const projects = Object.values(projectMap).sort((a, b) => {
    const aActive = a.counts.in_progress + a.counts.blocked;
    const bActive = b.counts.in_progress + b.counts.blocked;
    if (bActive !== aActive) return bActive - aActive;
    return b.tasks.length - a.tasks.length;
  });

  return NextResponse.json(projects);
}

export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const { action, name } = body as { action: string; name: string };

  if (action === "set_done") {
    const { is_done } = body as { is_done: boolean };
    const { error } = await supabase
      .from("project_meta")
      .upsert({ name, is_done, updated_at: new Date().toISOString() }, { onConflict: "name" });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (action === "rename") {
    const { new_name } = body as { new_name: string };
    if (!new_name?.trim()) return NextResponse.json({ error: "new_name required" }, { status: 400 });

    const { error: taskErr } = await supabase
      .from("collab_tasks")
      .update({ project: new_name.trim() })
      .eq("project", name);
    if (taskErr) return NextResponse.json({ error: taskErr.message }, { status: 500 });

    const { data: existing } = await supabase.from("project_meta").select("is_done").eq("name", name).single();
    if (existing) {
      await supabase.from("project_meta").delete().eq("name", name);
      await supabase.from("project_meta").upsert({ name: new_name.trim(), is_done: existing.is_done, updated_at: new Date().toISOString() }, { onConflict: "name" });
    }

    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
