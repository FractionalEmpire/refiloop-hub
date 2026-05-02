import { NextRequest, NextResponse } from "next/server";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const headers = () => ({
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  "Content-Type": "application/json",
});

export async function GET() {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/owner_name_patterns?order=action,category,pattern`,
    { headers: headers(), cache: "no-store" }
  );
  const data = await res.json();
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { pattern, action, category, match_type, notes } = body;
  if (!pattern || !action) {
    return NextResponse.json({ error: "pattern and action are required" }, { status: 400 });
  }
  const res = await fetch(`${SUPABASE_URL}/rest/v1/owner_name_patterns`, {
    method: "POST",
    headers: { ...headers(), Prefer: "return=representation" },
    body: JSON.stringify({
      pattern: pattern.toUpperCase().trim(),
      action,
      category: category || "entity_suffix",
      match_type: match_type || "contains",
      active: true,
      notes: notes || null,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    return NextResponse.json({ error: err }, { status: 500 });
  }
  const data = await res.json();
  return NextResponse.json(data[0] ?? data, { status: 201 });
}

export async function PUT(req: NextRequest) {
  const body = await req.json();
  const { id, ...fields } = body;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const allowed = ["pattern", "action", "category", "match_type", "active", "notes"];
  const update: Record<string, unknown> = {};
  for (const k of allowed) {
    if (k in fields) update[k] = fields[k];
  }
  if (update.pattern) update.pattern = String(update.pattern).toUpperCase().trim();

  const res = await fetch(`${SUPABASE_URL}/rest/v1/owner_name_patterns?id=eq.${id}`, {
    method: "PATCH",
    headers: { ...headers(), Prefer: "return=representation" },
    body: JSON.stringify(update),
  });
  if (!res.ok) return NextResponse.json({ error: "Update failed" }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const res = await fetch(`${SUPABASE_URL}/rest/v1/owner_name_patterns?id=eq.${id}`, {
    method: "DELETE",
    headers: headers(),
  });
  if (!res.ok) return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
