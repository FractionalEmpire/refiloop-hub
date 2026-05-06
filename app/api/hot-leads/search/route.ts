import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return NextResponse.json([]);
  const digits = q.replace(/\D/g, "");
  const isPhone = digits.length >= 7;

  const nameQuery = supabase.from("owners").select("id, name, entity_name").ilike("name", `%${q}%`).limit(10);
  const phoneQuery = isPhone
    ? supabase.from("owner_phones").select("owner_id, phone").ilike("phone", `%${digits}%`).limit(10)
    : null;

  const [nameRes, phoneRes] = await Promise.all([
    nameQuery,
    phoneQuery ?? Promise.resolve({ data: [] as { owner_id: number }[], error: null }),
  ]);

  const ownerIds = new Set<number>();
  (nameRes.data ?? []).forEach((r) => ownerIds.add(r.id));
  (phoneRes.data ?? []).forEach((r) => ownerIds.add(r.owner_id));
  if (ownerIds.size === 0) return NextResponse.json([]);

  const ids = Array.from(ownerIds);
  const [ownersRes, phonesRes, jnRes] = await Promise.all([
    supabase.from("owners").select("id, name, entity_name").in("id", ids),
    supabase.from("owner_phones").select("owner_id, phone").in("owner_id", ids),
    supabase.from("jn_loan_owners").select("owner_id, capitalize_loan_id").in("owner_id", ids),
  ]);

  const capLoanIds = (jnRes.data ?? []).map((r) => r.capitalize_loan_id).filter(Boolean) as number[];
  const loansRes = capLoanIds.length
    ? await supabase.from("loans").select("id, address, city, state, zip, mortgage_amount, lender_name, property_type, estimated_due_date, due_date, interest_rate, lead_score, display_loan_amount").in("id", capLoanIds)
    : { data: [] as Record<string, unknown>[], error: null };

  const phonesByOwner: Record<number, string[]> = {};
  (phonesRes.data ?? []).forEach((p) => {
    if (!phonesByOwner[p.owner_id]) phonesByOwner[p.owner_id] = [];
    phonesByOwner[p.owner_id].push(p.phone);
  });

  const loanByCapId: Record<number, Record<string, unknown>> = {};
  (loansRes.data ?? []).forEach((l) => { loanByCapId[l.id as number] = l as Record<string, unknown>; });

  const loanByOwner: Record<number, Record<string, unknown>> = {};
  (jnRes.data ?? []).forEach((jn) => {
    if (jn.capitalize_loan_id && loanByCapId[jn.capitalize_loan_id]) {
      loanByOwner[jn.owner_id] = loanByCapId[jn.capitalize_loan_id];
    }
  });

  const results = (ownersRes.data ?? []).map((owner) => {
    const loan = loanByOwner[owner.id];
    const phones = phonesByOwner[owner.id] ?? [];
    return {
      owner_id: owner.id,
      name: owner.name ?? owner.entity_name ?? "Unknown",
      phones,
      loan: loan
        ? {
            loan_id: loan.id,
            capitalize_loan_id: loan.id,
            property_address: loan.address,
            property_city: loan.city,
            property_state: loan.state,
            property_zip: loan.zip,
            property_type: loan.property_type,
            loan_amount: loan.display_loan_amount ?? loan.mortgage_amount,
            loan_amount_num: loan.mortgage_amount ? Number(loan.mortgage_amount) : null,
            lender_name: loan.lender_name,
            due_date: loan.due_date ?? loan.estimated_due_date,
            interest_rate: loan.interest_rate,
            lead_score: loan.lead_score,
          }
        : null,
    };
  });

  return NextResponse.json(results);
}
