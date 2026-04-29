import { NextRequest, NextResponse } from "next/server";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const headers = () => ({
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  "Content-Type": "application/json",
});

export async function GET() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/filter_rules?order=id`, {
    headers: headers(),
    cache: "no-store",
  });
  const data = await res.json();
  return NextResponse.json(data);
}

export async function PUT(req: NextRequest) {
  const { id, rule_value } = await req.json();
  if (!id || rule_value === undefined) {
    return NextResponse.json({ error: "id and rule_value required" }, { status: 400 });
  }
  const res = await fetch(`${SUPABASE_URL}/rest/v1/filter_rules?id=eq.${id}`, {
    method: "PATCH",
    headers: { ...headers(), Prefer: "return=representation" },
    body: JSON.stringify({
      rule_value: String(rule_value),
      updated_at: new Date().toISOString(),
      updated_by: "refiloop-hub",
    }),
  });
  if (!res.ok) return NextResponse.json({ error: "Update failed" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
