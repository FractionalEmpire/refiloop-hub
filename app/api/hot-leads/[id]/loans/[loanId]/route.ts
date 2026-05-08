import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; loanId: string }> }
) {
  const { loanId } = await params;
  const body = await req.json();
  const { data, error } = await supabase
    .from("hot_lead_loans")
    .update({ ...body, updated_at: new Date().toISOString() })
    .eq("id", loanId)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; loanId: string }> }
) {
  const { loanId } = await params;
  const { error } = await supabase
    .from("hot_lead_loans")
    .delete()
    .eq("id", loanId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ deleted: true });
}
