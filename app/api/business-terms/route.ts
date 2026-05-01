import { NextRequest, NextResponse } from "next/server";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const h = () => ({
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  "Content-Type": "application/json",
});

export async function GET() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/business_terms?order=id`, {
    headers: h(),
    cache: "no-store",
  });
  return NextResponse.json(await res.json());
}

export async function POST(req: NextRequest) {
  const { term } = await req.json();
  const trimmed = term?.trim();
  if (!trimmed) {
    return NextResponse.json({ error: "term required" }, { status: 400 });
  }

  // Insert into business_terms
  const btRes = await fetch(`${SUPABASE_URL}/rest/v1/business_terms`, {
    method: "POST",
    headers: { ...h(), Prefer: "return=representation" },
    body: JSON.stringify({ term: trimmed }),
  });

  if (!btRes.ok) {
    const body = await btRes.json().catch(() => ({})) as Record<string, unknown>;
    if (btRes.status === 409 || body?.code === "23505") {
      return NextResponse.json({ error: "Term already exists" }, { status: 409 });
    }
    return NextResponse.json({ error: "Insert failed" }, { status: 500 });
  }

  const newTerm = await btRes.json();

  // Derive the pattern for owner_name_patterns.
  // _Land → strip _ → LAND, stored with match_type 'word_boundary' (regex \mLAND\M)
  // develop → DEVELOP, stored with match_type 'word_start' (regex \mDEVELOP — catches DEVELOPER etc.)
  const isWordBoundary = trimmed.startsWith("_");
  const pattern = (isWordBoundary ? trimmed.slice(1) : trimmed).toUpperCase();
  const matchType = isWordBoundary ? "word_boundary" : "word_start";

  // Best-effort insert into owner_name_patterns — don't fail the whole request if already there
  await fetch(`${SUPABASE_URL}/rest/v1/owner_name_patterns`, {
    method: "POST",
    headers: { ...h(), Prefer: "return=minimal,resolution=ignore-duplicates" },
    body: JSON.stringify({
      pattern,
      category: "business_activity",
      action: "sos_lookup",
      match_type: matchType,
      active: true,
      notes: `Added via refiloop-hub business terms`,
    }),
  });

  return NextResponse.json(newTerm);
}

export async function DELETE(req: NextRequest) {
  const { id, term } = await req.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  // Delete from business_terms
  const btRes = await fetch(`${SUPABASE_URL}/rest/v1/business_terms?id=eq.${id}`, {
    method: "DELETE",
    headers: h(),
  });
  if (!btRes.ok) return NextResponse.json({ error: "Delete failed" }, { status: 500 });

  // Best-effort delete from owner_name_patterns
  if (term) {
    const isWordBoundary = (term as string).startsWith("_");
    const pattern = (isWordBoundary ? (term as string).slice(1) : (term as string)).toUpperCase();
    await fetch(
      `${SUPABASE_URL}/rest/v1/owner_name_patterns?pattern=eq.${encodeURIComponent(pattern)}&notes=like.*refiloop-hub*`,
      { method: "DELETE", headers: h() }
    );
  }

  return NextResponse.json({ ok: true });
}
