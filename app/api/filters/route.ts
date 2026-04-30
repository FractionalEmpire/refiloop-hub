import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

export async function GET() {
  const { data, error } = await supabase
    .from("filter_rules")
    .select("*")
    .order("id");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function PUT(req: NextRequest) {
  const { id, rule_value } = await req.json();
  if (!id || rule_value === undefined) {
    return NextResponse.json({ error: "id and rule_value required" }, { status: 400 });
  }
  const { error } = await supabase
    .from("filter_rules")
    .update({
      rule_value: String(rule_value),
      updated_at: new Date().toISOString(),
      updated_by: "refiloop-hub",
    })
    .eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
