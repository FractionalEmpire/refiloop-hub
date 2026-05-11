// Tasks CRUD endpoint — GET lists all tasks, POST creates a new task. This is a live test of the Claude autonomous executor.
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const assignee = searchParams.get("assignee");
  const status = searchParams.get("status");

  let query = supabase
    .from("collab_tasks")
    .select("*")
    .order("priority", { ascending: true })
    .order("created_at", { ascending: true });

  if (assignee && assignee !== "all") {
    query = query.or(`assignee.eq.${assignee},assignee.eq.both`);
  }
  if (status) {
    query = query.eq("status", status);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const user = getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { title, description, assignee, status, priority, project, notes, type, url } = body;

  const { data, error } = await supabase
    .from("collab_tasks")
    .insert({
      title,
      description,
      assignee,
      status: status || "todo",
      priority: priority || "p1",
      project,
      notes,
      type: type || "task",
      url: url || null,
    })
    .select()
    .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
