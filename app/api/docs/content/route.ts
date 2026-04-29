import { NextRequest, NextResponse } from "next/server";
import { getFileContent, updateFileContent } from "@/lib/github";

export async function GET(req: NextRequest) {
  const path = new URL(req.url).searchParams.get("path");
  if (!path) return NextResponse.json({ error: "path required" }, { status: 400 });

  const file = await getFileContent(path);
  if (!file) return NextResponse.json({ error: "not found" }, { status: 404 });

  return NextResponse.json(file);
}

export async function PUT(req: NextRequest) {
  const body = await req.json();
  const { path, content, sha, message } = body;

  if (!path || !content || !sha) {
    return NextResponse.json({ error: "path, content, sha required" }, { status: 400 });
  }

  const ok = await updateFileContent(
    path,
    content,
    sha,
    message || `docs: update ${path} via RefiLoop Hub`
  );

  if (!ok) return NextResponse.json({ error: "GitHub update failed" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
