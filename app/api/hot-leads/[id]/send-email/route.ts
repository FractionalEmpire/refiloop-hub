import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { sendEmail } from "@/lib/gmail";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { to, subject, body } = await req.json() as {
    to: string;
    subject: string;
    body: string;
  };

  if (!to || !subject || !body) {
    return NextResponse.json({ error: "to, subject, and body are required" }, { status: 400 });
  }

  const { messageId, threadId } = await sendEmail(to, subject, body);

  const summary = `Subject: ${subject}\n\n${body.slice(0, 500)}${body.length > 500 ? "…" : ""}`;

  const [activityRes] = await Promise.all([
    supabase.from("hot_lead_activities").insert({
      hot_lead_id: Number(id),
      type: "Email",
      summary,
      created_by: "David",
      gmail_message_id: messageId,
      gmail_thread_id: threadId,
      direction: "outgoing",
    }).select().single(),
    supabase.from("hot_leads").update({
      last_contact: new Date().toISOString().split("T")[0],
      updated_at: new Date().toISOString(),
      // Store email address on the lead if it's not already set
      email: to,
    }).eq("id", id).is("email", null),
  ]);

  if (activityRes.error) {
    return NextResponse.json({ error: activityRes.error.message }, { status: 500 });
  }

  return NextResponse.json({
    sent: true,
    messageId,
    threadId,
    activity: activityRes.data,
  });
}
