import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
export const dynamic = "force-dynamic";

export async function GET() {
  const { data, error } = await supabase
    .from("collab_eod_updates")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { author, content, blockers, task_ids_completed } = body;

  if (!author || !content) {
    return NextResponse.json({ error: "author and content required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("collab_eod_updates")
    .insert({ author, content, blockers, task_ids_completed })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
