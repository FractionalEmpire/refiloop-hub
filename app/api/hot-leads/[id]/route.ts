import { NextRequest, NextResponse } from "next/server";

const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN!;
const BASE_ID = "appPycNMKgdBR8Xcw";
const TABLE_ID = "tblpbnwzxtN6Pet9F";

const atHeaders = () => ({
  Authorization: `Bearer ${AIRTABLE_TOKEN}`,
  "Content-Type": "application/json",
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const res = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}/${id}`, {
    method: "PATCH",
    headers: atHeaders(),
    body: JSON.stringify({ fields: body }),
  });
  if (!res.ok) return NextResponse.json({ error: "Update failed" }, { status: 500 });
  const data = await res.json();
  return NextResponse.json(data);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const res = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}/${id}`, {
    method: "DELETE",
    headers: atHeaders(),
  });
  if (!res.ok) return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  return NextResponse.json({ deleted: true });
}
