import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  const { data: tasks, error } = await supabase
    .from("collab_tasks")
    .select("id, project, status, priority, title, assignee")
    .not("project", "is", null)
    .neq("project", "")
    .order("project");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!tasks) return NextResponse.json([]);

  const projectMap: Record<string, {
    name: string;
    tasks: typeof tasks;
    counts: Record<string, number>;
  }> = {};

  for (const task of tasks) {
    const name = task.project || "Uncategorized";
    if (!projectMap[name]) {
      projectMap[name] = { name, tasks: [], counts: { todo: 0, in_progress: 0, blocked: 0, done: 0 } };
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
