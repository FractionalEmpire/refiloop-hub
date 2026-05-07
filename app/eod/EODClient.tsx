"use client";
import { useState, useEffect } from "react";
import type { Task } from "@/lib/supabase";
import { formatDistanceToNow, format } from "date-fns";

type CQ = { section: string; question: string };
type EODUpdate = {
  id: string; author: "david" | "gorjan"; content: string; blockers: string | null;
  task_ids_completed: string[] | null; created_at: string; date: string;
  email_message_id?: string | null; live_and_running?: string | null;
  built_not_deployed?: string | null; broken?: string | null; next_steps?: string | null;
  needs_from_david?: string | null; clarifying_questions?: CQ[] | null;
};
const SM = [
  { key:"live_and_running",   label:"Live & Running",      icon:"✅", color:"#3fb950", bg:"#3fb95012" },
  { key:"built_not_deployed", label:"Built, Not Deployed", icon:"🔧", color:"#d29922", bg:"#d2992212" },
  { key:"broken",             label:"Broken / Issues",     icon:"🚨", color:"#f85149", bg:"#f8514912" },
  { key:"next_steps",         label:"Next Steps",          icon:"👣", color:"#58a6ff", bg:"#58a6ff12" },
  { key:"needs_from_david",   label:"Needs from David",    icon:"🙋", color:"#bc8cff", bg:"#bc8cff12" },
] as const;
const blank = (v: string|null|undefined) => !v || v.trim().toLowerCase() === "not mentioned.";

export default function EODClient({ user }: { user: "david"|"gorjan" }) {
  const [updates, setUpdates] = useState<EODUpdate[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [pulling, setPulling] = useState(false);
  const [pullMsg, setPullMsg] = useState<string|null>(null);
  const [posting, setPosting] = useState(false);
  const [content, setContent] = useState("");
  const [blockers, setBlockers] = useState("");
  const [completedIds, setCompletedIds] = useState<string[]>([]);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    Promise.all([fetch("/api/eod").then(r=>r.json()), fetch("/api/tasks?status=in_progress").then(r=>r.json())])
      .then(([e,t])=>{ setUpdates(Array.isArray(e)?e:[]); setTasks(Array.isArray(t)?t:[]); setLoading(false); });
  }, []);

  async function pullFromEmail() {
    setPulling(true); setPullMsg(null);
    const d = await fetch("/api/eod/pull-email",{method:"POST"}).then(r=>r.json());
    if (d.error) { setPullMsg("Error: "+d.error); }
    else if (!d.imported) { setPullMsg(d.message??"No new EODs found."); }
    else { setPullMsg("✓ Imported "+d.imported+" new EOD"+(d.imported>1?"s":".")); setUpdates(await fetch("/api/eod").then(r=>r.json())); }
    setPulling(false);
  }

  async function postEOD() {
    if (!content.trim()) return; setPosting(true);
    const u = await fetch("/api/eod",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({author:user,content,blockers:blockers||null,task_ids_completed:completedIds})}).then(r=>r.json());
    setUpdates(p=>[u,...p]);
    await Promise.all(completedIds.map(id=>fetch("/api/tasks/"+id,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({status:"done"})})));
    setContent(""); setBlockers(""); setCompletedIds([]); setShowForm(false); setPosting(false);
  }

  const uc=(a:string)=>a==="david"?"#1f6feb":"#1a7f37";

  return (
    <div className="p-8 max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold" style={{color:"#e6edf3"}}>EOD Updates</h1>
          <p className="text-sm mt-0.5" style={{color:"#8b949e"}}>Daily standups, blockers, and completed work</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={pullFromEmail} disabled={pulling} className="px-3 py-2 rounded-md text-sm font-medium flex items-center gap-1.5" style={{background:"#21262d",border:"1px solid #30363d",color:"#e6edf3",opacity:pulling?0.7:1}}>
            {pulling?"⏳ Pulling…":"📧 Pull Gorjan's EOD"}
          </button>
          <button onClick={()=>setShowForm(!showForm)} className="px-4 py-2 rounded-md text-sm font-semibold" style={{background:uc(user),color:"#fff"}}>
            {showForm?"Cancel":"+ Post EOD"}
          </button>
        </div>
      </div>
      {pullMsg&&<div className="mb-4 px-3 py-2 rounded-md text-sm" style={{background:pullMsg.startsWith("Error")?"#f8514912":"#3fb95012",border:"1px solid "+(pullMsg.startsWith("Error")?"#f85149":"#3fb950")+"30",color:pullMsg.startsWith("Error")?"#f85149":"#3fb950"}}>{pullMsg}</div>}
      {showForm&&(
        <div className="rounded-xl border p-5 mb-6" style={{background:"#161b22",borderColor:"#30363d"}}>
          <div className="flex items-center gap-2 mb-4">
            <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold" style={{background:uc(user),color:"#fff"}}>{user==="david"?"D":"G"}</div>
            <span className="text-sm font-medium" style={{color:"#e6edf3"}}>{user==="david"?"David":"Gorjan"}&apos;s EOD — {format(new Date(),"MMM d, yyyy")}</span>
          </div>
          <div className="space-y-3">
            <textarea className="w-full px-3 py-2.5 rounded-md text-sm outline-none resize-none" style={{background:"#0d1117",border:"1px solid #30363d",color:"#e6edf3"}} rows={5} placeholder="What did you work on today?" value={content} onChange={e=>setContent(e.target.value)}/>
            {tasks.length>0&&<div className="space-y-1.5">{tasks.map(t=>(
              <label key={t.id} className="flex items-center gap-2.5 cursor-pointer p-2 rounded-md" style={{background:completedIds.includes(t.id)?"#1f6feb10":"transparent"}}>
                <input type="checkbox" checked={completedIds.includes(t.id)} onChange={e=>setCompletedIds(p=>e.target.checked?[...p,t.id]:p.filter(i=>i!==t.id))} className="w-3.5 h-3.5" style={{accentColor:"#58a6ff"}}/>
                <span className="text-xs flex-1" style={{color:"#c9d1d9"}}>{t.title}</span>
              </label>
            ))}</div>}
            <textarea className="w-full px-3 py-2 rounded-md text-sm outline-none resize-none" style={{background:"#0d1117",border:"1px solid #30363d",color:"#e6edf3"}} rows={2} placeholder="Blockers / needs from David" value={blockers} onChange={e=>setBlockers(e.target.value)}/>
            <button onClick={postEOD} disabled={posting||!content.trim()} className="w-full py-2.5 rounded-md text-sm font-semibold" style={{background:uc(user),color:"#fff",opacity:posting||!content.trim()?0.6:1}}>{posting?"Posting…":"Post EOD"}</button>
          </div>
        </div>
      )}
      {loading?<div style={{color:"#484f58"}}>Loading…</div>:updates.length===0?(
        <div className="rounded-xl border p-10 text-center" style={{background:"#161b22",borderColor:"#30363d"}}><p style={{color:"#484f58"}}>No EOD updates yet.</p></div>
      ):(
        <div className="space-y-4">{updates.map(u=>{
          const parsed=!!u.email_message_id, qs=u.clarifying_questions??[];
          return(
            <div key={u.id} className="rounded-xl border" style={{background:"#161b22",borderColor:"#30363d"}}>
              <div className="flex items-center gap-2.5 px-5 pt-4 pb-3 border-b" style={{borderColor:"#21262d"}}>
                <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0" style={{background:uc(u.author),color:"#fff"}}>{u.author==="david"?"D":"G"}</div>
                <div className="flex-1">
                  <span className="text-sm font-semibold capitalize" style={{color:"#e6edf3"}}>{u.author}</span>
                  {parsed&&<span className="ml-2 text-xs px-1.5 py-0.5 rounded" style={{background:"#1a7f3730",color:"#3fb950",fontSize:"10px"}}>from email</span>}
                  <span className="text-xs ml-2" style={{color:"#484f58"}}>{format(new Date(u.date),"MMM d")} · {formatDistanceToNow(new Date(u.created_at),{addSuffix:true})}</span>
                </div>
              </div>
              {parsed?(
                <div className="divide-y" style={{borderColor:"#21262d"}}>{SM.map(({key,label,icon,color,bg})=>{
                  const val=u[key as keyof EODUpdate] as string|null|undefined;
                  return(
                    <div key={key} className="px-5 py-3">
                      <div className="flex items-center gap-1.5 mb-1"><span>{icon}</span><span className="text-xs font-semibold uppercase tracking-wide" style={{color}}>{label}</span></div>
                      {blank(val)?<p className="text-xs italic" style={{color:"#484f58"}}>Not mentioned</p>:<p className="text-sm leading-relaxed whitespace-pre-wrap" style={{color:"#c9d1d9"}}>{val}</p>}
                      {qs.filter(q=>q.section===key).map((q,i)=>(
                        <div key={i} className="mt-2 px-3 py-2 rounded-md flex items-start gap-2" style={{background:bg,border:"1px solid "+color+"30"}}>
                          <span className="text-xs">❓</span><p className="text-xs" style={{color}}><span className="font-semibold">Ask Gorjan: </span>{q.question}</p>
                        </div>
                      ))}
                    </div>
                  );
                })}</div>
              ):(
                <div className="px-5 py-4">
                  <p className="text-sm whitespace-pre-wrap" style={{color:"#c9d1d9"}}>{u.content}</p>
                  {u.blockers&&<div className="mt-3 px-3 py-2 rounded-md flex gap-2" style={{background:"#f8514910",border:"1px solid #f8514930"}}><span>🚧</span><p className="text-xs" style={{color:"#f85149"}}><b>Blocker: </b>{u.blockers}</p></div>}
                </div>
              )}
            </div>
          );
        })}</div>
      )}
    </div>
  );
    }
