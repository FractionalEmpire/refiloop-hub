// hot-leads API — Supabase
import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

function toRecord(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    fields: {
      "Lead Name": row.name,
      "Property Address": row.property_address
        ? `${row.property_address}, ${row.property_city} ${row.property_state} ${row.property_zip}`.trim()
        : (row.address ?? ""),
      "Loan Amount": row.loan_amount_num ?? null,
      "Balloon Maturity": row.due_date ?? null,
      Status: row.status ?? "New",
      "Call Summary": row.call_summary ?? "",
      "Next Action": row.next_action ?? "",
      "Assigned To": row.assigned_to ?? "David",
      "Last Contact": row.last_contact ?? null,
      "Callback Date": row.callback_date ?? null,
      "Recommended Steps": row.recommended_steps ?? "",
      "Lender Name": row.lender_name ?? "",
      "Property Type": row.property_type ?? "",
      "Borrower Entity": row.borrower_entity ?? "",
      Email: row.email ?? "",
      Phone: row.phone ?? "",
      Notes: row.notes ?? "",
      owner_id: row.owner_id,
      loan_id: row.loan_id,
      capitalize_loan_id: row.capitalize_loan_id,
      mojo_status: row.mojo_status,
      lead_score: row.lead_score,
    },
  };
}

export async function GET() {
  const { data, error } = await supabase
    .from("hot_leads")
    .select("*")
    .order("added_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json((data ?? []).map(toRecord));
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const isNative = "name" in body;
  const row = isNative ? body : {
    name: body["Lead Name"] ?? "",
    property_address: body["Property Address"]?.split(",")[0]?.trim() ?? "",
    property_city: body["Property Address"]?.split(",")[1]?.trim() ?? "",
    property_state: body["Property Address"]?.split(",")[2]?.trim().split(" ")[0] ?? "",
    property_zip: body["Property Address"]?.split(",")[2]?.trim().split(" ")[1] ?? "",
    loan_amount_num: body["Loan Amount"] ? Number(body["Loan Amount"]) : null,
    loan_amount: body["Loan Amount"] ? `$${Number(body["Loan Amount"]).toLocaleString()}` : null,
    due_date: body["Balloon Maturity"] ?? null,
    status: body["Status"] ?? "New",
    call_summary: body["Call Summary"] ?? null,
    next_action: body["Next Action"] ?? null,
    assigned_to: body["Assigned To"] ?? "David",
    last_contact: body["Last Contact"] ?? new Date().toISOString().split("T")[0],
    callback_date: body["Callback Date"] ?? null,
    lender_name: body["Lender Name"] ?? null,
    property_type: body["Property Type"] ?? null,
    email: body["Email"] ?? null,
    phone: body["Phone"] ?? null,
    notes: body["Notes"] ?? null,
    added_by: "manual",
  };
  const { data, error } = await supabase.from("hot_leads").insert(row).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(toRecord(data));
}
