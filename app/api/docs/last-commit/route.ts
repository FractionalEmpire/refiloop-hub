import { NextRequest, NextResponse } from "next/server";
import { getFileLastCommit } from "@/lib/github";

export async function GET(req: NextRequest) {
  const path = new URL(req.url).searchParams.get("path");
  if (!path) return NextResponse.json({ error: "path required" }, { status: 400 });

  const date = await getFileLastCommit(path);
  return NextResponse.json({ date });
}
