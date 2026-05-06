import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { data, error } = await supabase
    .from("hot_lead_activities")
    .select("*")
    .eq("hot_lead_id", id)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const { type, summary, created_by } = body as {
    type: string;
    summary: string;
    created_by?: string;
  };
  if (!type || !summary) {
    return NextResponse.json({ error: "type and summary required" }, { status: 400 });
  }
  const { data, error } = await supabase
    .from("hot_lead_activities")
    .insert({ hot_lead_id: Number(id), type, summary, created_by: created_by ?? "David" })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await supabase
    .from("hot_leads")
    .update({ last_contact: new Date().toISOString().split("T")[0], updated_at: new Date().toISOString() })
    .eq("id", id);

  return NextResponse.json(data);
}
