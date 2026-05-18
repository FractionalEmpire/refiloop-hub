import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";
const PULL_TIMEOUT_MS = 5 * 60 * 1000;

function redirectAfterPost(url: URL) {
  return NextResponse.redirect(url, 303);
}

function wantsJson(request: NextRequest) {
  return request.headers.get("accept")?.includes("application/json");
}

function cleanDate(value: FormDataEntryValue | null, fallback: string) {
  const text = String(value || "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : fallback;
}

export async function POST(request: NextRequest) {
  const returnJson = wantsJson(request);

  if (!getCurrentUser()) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const form = await request.formData();
  const today = new Date().toISOString().slice(0, 10);
  const start = cleanDate(form.get("start"), today);
  const end = cleanDate(form.get("end"), start);
  const bridgeUrl = process.env.MOJO_BRIDGE_URL || process.env.MOJO_API_URL || "http://2.24.197.63:5050";
  const secret = process.env.MOJO_PUSH_SECRET;

  const redirectUrl = new URL("/mojo-stats", request.url);
  redirectUrl.searchParams.set("start", start);
  redirectUrl.searchParams.set("end", end);
  for (const key of ["agent", "disposition", "asset", "pageSize", "sort", "dir"]) {
    const value = String(form.get(key) || "");
    if (value) redirectUrl.searchParams.set(key, value);
  }
  redirectUrl.searchParams.set("page", "1");

  const { count: existingCount } = await supabase
    .from("mojo_session_reports")
    .select("id", { count: "exact", head: true })
    .gte("report_date", start)
    .lte("report_date", end);
  redirectUrl.searchParams.set("sessionExisting", String(existingCount ?? 0));

  if (!secret) {
    if (returnJson) {
      return NextResponse.json({
        ok: false,
        status: "missing-secret",
        message: "MOJO_PUSH_SECRET is missing, so Hub cannot call the VPS scraper.",
        existing: existingCount ?? 0,
      });
    }
    redirectUrl.searchParams.set("sessionPull", "missing-secret");
    return redirectAfterPost(redirectUrl);
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), PULL_TIMEOUT_MS);
    const response = await fetch(`${bridgeUrl.replace(/\/$/, "")}/pull-mojo-session-report`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ start, end }),
      cache: "no-store",
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    const text = await response.text();
    let payload: { pulled?: number; saved?: number; error?: string } = {};
    try {
      payload = text ? JSON.parse(text) : {};
    } catch {
      payload = { error: text.slice(0, 180) };
    }

    if (!response.ok) {
      if (returnJson) {
        return NextResponse.json({
          ok: false,
          status: "error",
          statusCode: response.status,
          message: payload.error || `VPS returned HTTP ${response.status}.`,
          existing: existingCount ?? 0,
        });
      }
      redirectUrl.searchParams.set("sessionPull", "error");
      redirectUrl.searchParams.set("sessionPullStatus", String(response.status));
      if (payload.error) redirectUrl.searchParams.set("sessionPullMessage", payload.error.slice(0, 180));
      return redirectAfterPost(redirectUrl);
    }

    const pulled = Number(payload.pulled ?? 0);
    const saved = Number(payload.saved ?? 0);
    const status = pulled > 0 || saved > 0 ? "ok" : "empty";
    const emptyMessage = "Scraper ran, but Mojo returned 0 session rows for this range. Check date selector/table parsing in VPS logs.";
    if (returnJson) {
      return NextResponse.json({
        ok: status === "ok",
        status,
        pulled,
        saved,
        existing: existingCount ?? 0,
        message: status === "ok" ? `Done. Pulled ${pulled} session rows and saved ${saved}.` : emptyMessage,
      });
    }
    redirectUrl.searchParams.set("sessionPull", status);
    redirectUrl.searchParams.set("sessionPulled", String(payload.pulled ?? 0));
    redirectUrl.searchParams.set("sessionSaved", String(payload.saved ?? 0));
    if (pulled <= 0 && saved <= 0) {
      redirectUrl.searchParams.set("sessionPullMessage", emptyMessage);
    }
    return redirectAfterPost(redirectUrl);
  } catch (error) {
    const message =
      error instanceof Error && error.name === "AbortError"
        ? "Mojo pull timed out after 5 minutes. Check the VPS Mojo API log before retrying."
        : "Mojo pull request failed before the VPS returned a result. Check local and VPS logs.";
    if (returnJson) {
      return NextResponse.json({
        ok: false,
        status: "error",
        message,
        existing: existingCount ?? 0,
      });
    }
    redirectUrl.searchParams.set("sessionPull", "error");
    redirectUrl.searchParams.set("sessionPullMessage", message);
    return redirectAfterPost(redirectUrl);
  }
}
