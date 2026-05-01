import { NextRequest, NextResponse } from "next/server";

const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN!;
const BASE_ID = "appPycNMKgdBR8Xcw";
const TABLE_ID = "tblpbnwzxtN6Pet9F";

const atHeaders = () => ({
  Authorization: `Bearer ${AIRTABLE_TOKEN}`,
  "Content-Type": "application/json",
});

export async function GET() {
  const url = `https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}?sort%5B0%5D%5Bfield%5D=Last+Contact&sort%5B0%5D%5Bdirection%5D=desc`;
  const res = await fetch(url, { headers: atHeaders(), cache: "no-store" });
  if (!res.ok) return NextResponse.json({ error: "Airtable fetch failed" }, { status: 500 });
  const data = await res.json();
  return NextResponse.json(data.records ?? []);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const res = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}`, {
    method: "POST",
    headers: atHeaders(),
    body: JSON.stringify({ fields: body }),
  });
  if (!res.ok) return NextResponse.json({ error: "Create failed" }, { status: 500 });
  const data = await res.json();
  return NextResponse.json(data);
}
