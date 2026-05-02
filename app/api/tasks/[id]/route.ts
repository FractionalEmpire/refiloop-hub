import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
export const dynamic = "force-dynamic";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const body = await req.json();
  const { id } = params;

  // Force reset — clears triggered_at and last_activity_at, resets to todo
  if (body.reset === true) {
    const { data, error } = await supabase
      .from("collab_tasks")
      .update({
        status: "todo",
        triggered_at: null,
        last_activity_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  }

  const allowed = ["title", "description", "assignee", "status", "priority", "project", "notes", "type", "last_activity_at"];
  const updates: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) updates[key] = body[key];
  }

  const { data, error } = await supabase
    .from("collab_tasks")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  const { error } = await supabase.from("collab_tasks").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
