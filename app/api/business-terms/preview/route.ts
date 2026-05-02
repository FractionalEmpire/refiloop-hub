import { NextRequest, NextResponse } from "next/server";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const h = () => ({
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
});

// Matches owner names that would be converted to entities by this term.
// Term syntax:
//   _Land  → strip _ → word-boundary regex \mLAND\M (exact word, avoids e.g. HOLLANDER)
//   develop → word-start regex \mDEVELOP (catches DEVELOPER, DEVELOPMENT, etc.)
export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("term");
  const trimmed = raw?.trim();
  if (!trimmed) {
    return NextResponse.json({ error: "term required" }, { status: 400 });
  }

  const isWordBoundary = trimmed.startsWith("_");
  const searchTerm = isWordBoundary ? trimmed.slice(1) : trimmed;
  if (!searchTerm) {
    return NextResponse.json({ error: "term body required after _" }, { status: 400 });
  }

  // Normalize: any _ inside the term body is treated as a space separator.
  // So _bank_ → BANK, _land_group → LAND GROUP, land_group → LAND GROUP
  const upper = searchTerm.replace(/_/g, " ").trim().toUpperCase();

  // Build PostgREST filter.
  // ~* is PostgreSQL case-insensitive regex operator in PostgREST.
  // \m = word start boundary, \M = word end boundary (PostgreSQL regex extensions).
  let filter: string;
  if (isWordBoundary) {
    // Exact word: \mLAND\M  — e.g. _Land prevents matching HOLLANDER
    const pattern = `\\m${upper}\\M`;
    filter = `name=~*.${encodeURIComponent(pattern)}`;
  } else {
    // Word-start prefix: \mDEVELOP — matches DEVELOP, DEVELOPER, DEVELOPMENT
    const pattern = `\\m${upper}`;
    filter = `name=~*.${encodeURIComponent(pattern)}`;
  }

  // Fetch up to 201 so we can detect truncation
  const url = `${SUPABASE_URL}/rest/v1/owners?owner_type=eq.individual&${filter}&select=id,name&order=name&limit=201`;
  const res = await fetch(url, { headers: h(), cache: "no-store" });

  if (!res.ok) {
    const body = await res.text();
    return NextResponse.json({ error: `Query failed: ${body}` }, { status: 500 });
  }

  const data: { id: number; name: string }[] = await res.json();
  const truncated = data.length > 200;
  return NextResponse.json({
    count: data.length,
    truncated,
    names: truncated ? data.slice(0, 200) : data,
  });
}
