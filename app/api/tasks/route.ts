import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
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
  const body = await req.json();
  const { title, description, assignee, status, priority, project, notes, type } = body;

  const { data, error } = await supabase
    .from("collab_tasks")
    .insert({ title, description, assignee, status: status || "todo", priority: priority || "p1", project, notes, type: type || "task" })
    .select()
    .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
