import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";
const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";

export async function POST() {
  try {
    // Fetch last 10 call notes + last 10 EODs
    const [notesRes, eodsRes] = await Promise.all([
      supabase.from("collab_call_notes").select("date,content,commitments,decisions,action_items").order("date", { ascending: false }).limit(10),
      supabase.from("collab_eod_updates").select("date,author,content,live_and_running,built_not_deployed,broken,next_steps,needs_from_david").order("date", { ascending: false }).limit(10),
    ]);

    const notes = notesRes.data ?? [];
    const eods = eodsRes.data ?? [];

    if (notes.length === 0 && eods.length === 0) {
      return NextResponse.json({ error: "No data to analyze." }, { status: 400 });
    }

    const notesText = notes.length
      ? notes.map((n) => "CALL NOTES " + n.date + ":\n" + (n.commitments ? "Commitments: " + n.commitments + "\n" : "") + (n.action_items ? "Action items: " + n.action_items + "\n" : "") + (n.content ? "Raw: " + n.content.slice(0, 500) : "")).join("\n\n")
      : "No call notes available.";

    const eodsText = eods.length
      ? eods.map((e) => "EOD " + e.date + " (" + e.author + "):\n" + (e.live_and_running && e.live_and_running !== "Not mentioned." ? "Done: " + e.live_and_running + "\n" : "") + (e.next_steps && e.next_steps !== "Not mentioned." ? "Next steps: " + e.next_steps + "\n" : "") + (e.needs_from_david && e.needs_from_david !== "Not mentioned." ? "Needs from David: " + e.needs_from_david + "\n" : "")).join("\n\n")
      : "No EOD updates available.";

    const prompt = "CALL NOTES (what Gorjan committed to on calls with David):\n" + notesText + "\n\n---\n\nEOD UPDATES (what Gorjan actually reported doing):\n" + eodsText;

    const system = "You are analyzing the alignment between what Gorjan (engineer) committed to on daily calls with David (broker) at RefiLoop, and what he actually did as reported in his EOD updates. " +
      "Provide a structured analysis with exactly these 4 sections: " +
      "1. ALIGNMENT: What Gorjan committed to AND delivered (positive match). " +
      "2. GAPS: Things committed on calls but not mentioned in EODs. " +
      "3. UNREPORTED WORK: Things in EODs not discussed on calls (may be extra effort). " +
      "4. RECOMMENDED NEXT PRIORITIES: Based on gaps and commitments, the top 3-5 things Gorjan should work on next, in priority order. Be specific and actionable. " +
      "Keep each section concise (2-5 bullet points). If there is no data for a section, say \"None identified.\"";

    const apiKey = process.env.ANTHROPIC_API_KEY!;
    const res = await fetch(ANTHROPIC_API, {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 1200, system, messages: [{ role: "user", content: prompt }] }),
    });

    if (!res.ok) throw new Error("Claude API error: " + res.status);
    const json = await res.json();
    const analysis: string = json.content?.[0]?.text ?? "Analysis failed.";
    return NextResponse.json({ analysis, notesCount: notes.length, eodsCount: eods.length });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
        }
