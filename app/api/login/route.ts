import { NextRequest, NextResponse } from "next/server";
import { validatePassword } from "@/lib/auth";
import { cookies } from "next/headers";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { username, password } = body;

  if (!username || !password) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  if (!validatePassword(username, password)) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  const cookieStore = cookies();
  cookieStore.set("rl_user", username, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30, // 30 days
    path: "/",
  });

  return NextResponse.json({ ok: true, user: username });
}
