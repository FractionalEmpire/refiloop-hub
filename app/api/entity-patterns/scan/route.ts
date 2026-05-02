import { NextRequest, NextResponse } from "next/server";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const h = () => ({
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
});

// Returns individual owners with long names (most likely mis-classified entities),
// sorted by name length descending.
// We pre-filter to names containing at least 2 spaces (3+ words) which drastically
// narrows the result set without needing a SQL length() function.
// Query params: ?limit=200&min_length=18
export async function GET(req: NextRequest) {
  const limit = Math.min(parseInt(req.nextUrl.searchParams.get("limit") ?? "200"), 500);
  const minLen = parseInt(req.nextUrl.searchParams.get("min_length") ?? "18");

  // Filter: individual owners whose name contains at least 2 spaces (3+ word names).
  // PostgREST like operator: name=like.*%20*%20* means name contains " * " pattern.
  // We encode the space as a literal space in the URL param value.
  // Fetch up to 2000 then sort by length client-side — this is a discovery tool, not prod query.
  const filter = encodeURIComponent("* * *"); // at least 2 spaces
  const url = `${SUPABASE_URL}/rest/v1/owners?owner_type=eq.individual&name=like.${filter}&select=id,name&limit=2000`;
  const res = await fetch(url, { headers: h(), cache: "no-store" });

  if (!res.ok) {
    const body = await res.text();
    return NextResponse.json({ error: `Query failed: ${body}` }, { status: 500 });
  }

  const data: { id: number; name: string }[] = await res.json();

  // Sort by name length descending, apply min length filter, cap at limit
  const results = data
    .filter((r) => r.name && r.name.length >= minLen)
    .sort((a, b) => b.name.length - a.name.length)
    .slice(0, limit);

  return NextResponse.json(results);
}
