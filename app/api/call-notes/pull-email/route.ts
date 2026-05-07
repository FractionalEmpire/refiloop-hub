import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { fetchInboxSince } from "@/lib/gmail";

export const dynamic = "force-dynamic";

const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";

interface ParsedNote { commitments: string; decisions: string; action_items: string; }

async function parseCallNote(body: string): Promise<ParsedNote> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("No ANTHROPIC_API_KEY");
  const system = "You are parsing notes from a daily call between David (broker) and Gorjan (engineer) at RefiLoop. " +
    "Extract into 3 sections. If missing write \"Not mentioned.\" " +
    "Return ONLY valid JSON: {commitments, decisions, action_items}. " +
    "commitments: what Gorjan said he would do/build/fix with timeframes. " +
    "decisions: key decisions made (tech, priority, scope). " +
    "action_items: specific next steps with owner (David vs Gorjan) and deadlines.";
  const res = await fetch(ANTHROPIC_API, {
    method: "POST",
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: "claude-haiku-4-5-20251001", max_tokens: 800, system, messages: [{ role: "user", content: body }] }),
  });
  if (!res.ok) throw new Error("Claude API error: " + res.status);
  const json = await res.json();
  const text: string = json.content?.[0]?.text ?? "{}";
  const cleaned = text.replace(/^```json\s*/i, "").replace(/\s*```$/i, "").trim();
  return JSON.parse(cleaned) as ParsedNote;
}

export async function POST() {
  try {
    const sinceMs = Date.now() - 14 * 24 * 60 * 60 * 1000;
    const allEmails = await fetchInboxSince(sinceMs);
    const noteKw = /notes|call|meeting|standup|stand-up|daily|sync/i;
    const eodKw = /eod|end.of.day/i;
    const candidates = allEmails.filter((e) => {
      if (eodKw.test(e.subject)) return false;
      return e.fromEmail.includes("gorjan") || noteKw.test(e.subject) || noteKw.test(e.snippet);
    });
    if (candidates.length === 0) return NextResponse.json({ imported: 0, message: "No call note emails found." });
    const ids = candidates.map((e) => e.messageId);
    const { data: existing } = await supabase.from("collab_call_notes").select("email_message_id").in("email_message_id", ids);
    const already = new Set((existing ?? []).map((r) => r.email_message_id));
    const fresh = candidates.filter((e) => !already.has(e.messageId));
    if (fresh.length === 0) return NextResponse.json({ imported: 0, message: "All already imported." });
    const imported: string[] = [];
    for (const email of fresh) {
      let parsed: ParsedNote;
      try { parsed = await parseCallNote(email.bodyText || email.snippet); }
      catch { parsed = { commitments: "Not mentioned.", decisions: "Not mentioned.", action_items: "Not mentioned." }; }
      const { error } = await supabase.from("collab_call_notes").insert({
        date: email.date.split("T")[0], content: email.bodyText || email.snippet, source: "email",
        email_message_id: email.messageId, raw_email_body: email.bodyText,
        commitments: parsed.commitments, decisions: parsed.decisions, action_items: parsed.action_items,
      });
      if (!error) imported.push(email.messageId);
    }
    return NextResponse.json({ imported: imported.length });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
      }
