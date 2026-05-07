import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { fetchInboxSince } from "@/lib/gmail";

// Called by Vercel cron (*/5 * * * *) and from the hub UI "Sync Inbox" button.
export async function GET() {
  // Find the timestamp of the newest Gmail-sourced activity to avoid re-processing.
  const { data: latestRow } = await supabase
    .from("hot_lead_activities")
    .select("created_at")
    .not("gmail_message_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  // Default: go back 48 hours on first run.
  const sinceMs = latestRow?.created_at
    ? new Date(latestRow.created_at).getTime() - 60_000 // 1 min overlap to avoid gaps
    : Date.now() - 48 * 60 * 60 * 1000;

  const messages = await fetchInboxSince(sinceMs);
  if (messages.length === 0) return NextResponse.json({ synced: 0 });

  // Build a lookup: email address → hot_lead id
  const { data: leads } = await supabase
    .from("hot_leads")
    .select("id, email")
    .not("email", "is", null);

  const emailToLeadId: Record<string, number> = {};
  for (const lead of leads ?? []) {
    if (lead.email) emailToLeadId[lead.email.toLowerCase()] = lead.id as number;
  }

  // Get already-imported gmail_message_ids to skip duplicates (belt-and-suspenders
  // on top of the UNIQUE index — avoids unnecessary upsert attempts).
  const incomingIds = messages.map((m) => m.messageId);
  const { data: existing } = await supabase
    .from("hot_lead_activities")
    .select("gmail_message_id")
    .in("gmail_message_id", incomingIds);
  const alreadyImported = new Set((existing ?? []).map((r) => r.gmail_message_id));

  let synced = 0;
  for (const msg of messages) {
    if (alreadyImported.has(msg.messageId)) continue;

    const leadId = emailToLeadId[msg.fromEmail];
    if (!leadId) continue;

    const summary = `Subject: ${msg.subject}\n\n${msg.bodyText.slice(0, 500)}${msg.bodyText.length > 500 ? "…" : ""}`;

    const { error } = await supabase.from("hot_lead_activities").insert({
      hot_lead_id: leadId,
      type: "Email",
      summary,
      created_by: msg.fromName || msg.fromEmail,
      gmail_message_id: msg.messageId,
      gmail_thread_id: msg.threadId,
      direction: "incoming",
    });

    if (!error) {
      synced++;
      // Bump last_contact on the lead
      await supabase
        .from("hot_leads")
        .update({ last_contact: msg.date.split("T")[0], updated_at: new Date().toISOString() })
        .eq("id", leadId);
    }
  }

  return NextResponse.json({ synced });
}
