import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

function toColumns(fields: Record<string, unknown>) {
  const map: Record<string, unknown> = {};
  const aliases: Record<string, string> = {
    "Lead Name": "name",
    "Property Address": "address",
    "Loan Amount": "loan_amount_num",
    "Balloon Maturity": "due_date",
    Status: "status",
    "Call Summary": "call_summary",
    "Next Action": "next_action",
    "Assigned To": "assigned_to",
    "Last Contact": "last_contact",
    "Callback Date": "callback_date",
    "Recommended Steps": "recommended_steps",
    "Lender Name": "lender_name",
    "Property Type": "property_type",
    "Borrower Entity": "borrower_entity",
    Email: "email",
    Phone: "phone",
    Notes: "notes",
  };
  for (const [k, v] of Object.entries(fields)) {
    const col = aliases[k] ?? k;
    map[col] = v;
  }
  map.updated_at = new Date().toISOString();
  return map;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const updates = toColumns(body);
  const { data, error } = await supabase.from("hot_leads").update(updates).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { error } = await supabase.from("hot_leads").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ deleted: true });
}
