import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

/**
 * GET /api/hot-leads/enrich?phone=XXX-XXX-XXXX
 *
 * Looks up an owner by phone number and returns:
 *  - All phones (with source: 'idi' | 'mojo', verified flag, quality_score)
 *  - All emails (with source, is_valid)
 *  - Loan details (interest_rate, ltv, lender_type, term, property_type, etc.)
 *
 * Used by the Hot Leads detail panel to show enriched Supabase data alongside
 * the Airtable CRM record.
 */
export async function GET(req: NextRequest) {
  const phone = req.nextUrl.searchParams.get("phone")?.trim() ?? "";
  if (!phone) return NextResponse.json(null);

  const digits = phone.replace(/\D/g, "");
  if (digits.length < 7) return NextResponse.json(null);

  // Match by last 7 digits to handle country-code variations
  const suffix = digits.slice(-7);
  const { data: phonesMatching, error: pErr } = await supabase
    .from("owner_phones")
    .select("owner_id, phone, source, verified, quality_score, phone_type, is_primary, priority")
    .ilike("phone", `%${suffix.slice(0, 3)}-${suffix.slice(3, 6)}-${suffix.slice(6)}%`)
    .limit(10);

  if (pErr || !phonesMatching?.length) {
    const { data: fallback } = await supabase
      .from("owner_phones")
      .select("owner_id, phone, source, verified, quality_score, phone_type, is_primary, priority")
      .filter("phone", "ilike", `%${suffix}%`)
      .limit(10);

    if (!fallback?.length) return NextResponse.json(null);

    const exact = fallback.find((p) => p.phone.replace(/\D/g, "") === digits);
    const match = exact ?? fallback[0];
    return buildResponse(match.owner_id);
  }

  const exact = phonesMatching.find((p) => p.phone.replace(/\D/g, "") === digits);
  const match = exact ?? phonesMatching[0];
  return buildResponse(match.owner_id);
}

async function buildResponse(ownerId: number) {
  const [allPhonesRes, allEmailsRes, ownerRes, jnRes] = await Promise.all([
    supabase
      .from("owner_phones")
      .select("phone, source, verified, quality_score, phone_type, is_primary, priority")
      .eq("owner_id", ownerId)
      .order("priority", { ascending: true, nullsFirst: false }),
    supabase
      .from("owner_emails")
      .select("email, source, is_valid, is_primary, priority, email_type")
      .eq("owner_id", ownerId)
      .order("priority", { ascending: true, nullsFirst: false }),
    supabase
      .from("owners")
      .select("id, name, first_name, last_name, skip_trace_match, skip_trace_source, outreach_status, entity_name, owner_type")
      .eq("id", ownerId)
      .single(),
    supabase
      .from("jn_loan_owners")
      .select("capitalize_loan_id")
      .eq("owner_id", ownerId),
  ]);

  const capIds = (jnRes.data ?? [])
    .map((r) => r.capitalize_loan_id)
    .filter(Boolean);

  const loansRes = capIds.length
    ? await supabase
        .from("loans")
        .select(
          "id, property_type, property_subtype, interest_rate, interest_rate_type, ltv, lender_name, lender_type, mortgage_amount, display_loan_amount, term, due_date, estimated_due_date, address, city, state, year_built, unit_count, building_sqft"
        )
        .in("id", capIds)
    : { data: [] as Record<string, unknown>[] };

  return NextResponse.json({
    owner_id: ownerId,
    owner: ownerRes.data ?? null,
    phones: allPhonesRes.data ?? [],
    emails: allEmailsRes.data ?? [],
    loans: loansRes.data ?? [],
  });
}
