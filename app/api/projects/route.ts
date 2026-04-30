import { NextResponse } from "next/server";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const headers = () => ({
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  "Content-Type": "application/json",
});

export async function GET() {
  // Fetch all tasks with a project set
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/tasks?select=id,project,status,priority,title,assignee&project=neq.&order=project`,
    { headers: headers(), cache: "no-store" }
  );
  const tasks = await res.json();

  if (!Array.isArray(tasks)) return NextResponse.json([]);

  // Group by project
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
    // Sort: projects with in_progress first, then by total task count
    const aActive = a.counts.in_progress + a.counts.blocked;
    const bActive = b.counts.in_progress + b.counts.blocked;
    if (bActive !== aActive) return bActive - aActive;
    return b.tasks.length - a.tasks.length;
  });

  return NextResponse.json(projects);
}
