import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { fetchEODEmails } from "@/lib/gmail";
export const dynamic = "force-dynamic";
const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";
interface ParsedEOD { live_and_running:string; built_not_deployed:string; broken:string; next_steps:string; needs_from_david:string; clarifying_questions:Array<{section:string;question:string}>; }
async function parseEODWithClaude(body:string):Promise<ParsedEOD> {
  const apiKey=process.env.ANTHROPIC_API_KEY; if(!apiKey)throw new Error("No key");
  const system="Parse developer EOD email for RefiLoop. Extract 5 sections. Write Not mentioned. if absent. Return ONLY JSON:{live_and_running,built_not_deployed,broken,next_steps,needs_from_david,clarifying_questions:[{section,question}]}. live_and_running=actually in prod; built_not_deployed=GitHub/local not on server yet; broken=errors open or fixed; next_steps=next 2-3 steps+owner; needs_from_david=blockers.";
  const r=await fetch(ANTHROPIC_API,{method:"POST",headers:{"x-api-key":apiKey,"anthropic-version":"2023-06-01","content-type":"application/json"},body:JSON.stringify({model:"claude-haiku-4-5-20251001",max_tokens:1500,system,messages:[{role:"user",content:body}]})});
  if(!r.ok)throw new Error("Claude error "+r.status);
  const j=await r.json(); const t:string=j.content?.[0]?.text??"{}";
  return JSON.parse(t.replace(/^```jsons*/i,"").replace(/s*```$/i,"").trim()) as ParsedEOD;
}
export async function POST() {
  try {
    const emails=await fetchEODEmails(Date.now()-7*24*60*60*1000);
    if(!emails.length)return NextResponse.json({imported:0,message:"No EOD emails found in the last 7 days."});
    const ids=emails.map(e=>e.messageId);
    const {data:ex}=await supabase.from("collab_eod_updates").select("email_message_id").in("email_message_id",ids);
    const seen=new Set((ex??[]).map(r=>r.email_message_id));
    const fresh=emails.filter(e=>!seen.has(e.messageId));
    if(!fresh.length)return NextResponse.json({imported:0,message:"All already imported."});
    let count=0;
    for(const email of fresh){
      let p:ParsedEOD;
      try{p=await parseEODWithClaude(email.bodyText||email.snippet);}
      catch{p={live_and_running:"Not mentioned.",built_not_deployed:"Not mentioned.",broken:"Not mentioned.",next_steps:"Not mentioned.",needs_from_david:"Not mentioned.",clarifying_questions:[]};}
      const {error}=await supabase.from("collab_eod_updates").insert({author:"gorjan",content:email.bodyText||email.snippet,date:email.date.split("T")[0],email_message_id:email.messageId,raw_email_body:email.bodyText,live_and_running:p.live_and_running,built_not_deployed:p.built_not_deployed,broken:p.broken,next_steps:p.next_steps,needs_from_david:p.needs_from_david,clarifying_questions:p.clarifying_questions});
      if(!error)count++;
    }
    return NextResponse.json({imported:count});
  } catch(err){return NextResponse.json({error:err instanceof Error?err.message:String(err)},{status:500});}
    }
