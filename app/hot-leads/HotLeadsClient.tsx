"use client";
import { useState, useEffect, useCallback, useRef } from "react";

interface Lead {
  id: string;
  fields: {
    "Lead Name"?: string;
    "Property Address"?: string;
    "Loan Amount"?: number;
    "Balloon Maturity"?: string;
    Status?: string;
    "Call Summary"?: string;
    "Next Action"?: string;
    "Assigned To"?: string;
    "Last Contact"?: string;
    "Callback Date"?: string;
    "Recommended Steps"?: string;
    "Lender Name"?: string;
    "Property Type"?: string;
    "Borrower Entity"?: string;
    Email?: string;
    Phone?: string;
    Notes?: string;
    lead_score?: number;
    mojo_status?: string;
  };
}

interface Activity {
  id: number;
  hot_lead_id: number;
  type: string;
  summary: string;
  created_at: string;
  created_by: string;
}

interface SearchResult {
  owner_id: number;
  name: string;
  phones: string[];
  loan: {
    loan_id: number;
    capitalize_loan_id: number;
    property_address: string;
    property_city: string;
    property_state: string;
    property_zip: string;
    property_type: string;
    loan_amount: string;
    loan_amount_num: number | null;
    lender_name: string;
    due_date: string;
    interest_rate: string;
    lead_score: number;
  } | null;
}

const STATUSES = ["New", "Follow-Up", "Proposal Sent", "Engaged", "Closed Won", "Dead"];
const STATUS_COLORS: Record<string, { text: string; border: string }> = {
  New: { text: "#58a6ff", border: "#1f6feb" },
  "Follow-Up": { text: "#d29922", border: "#9e6a03" },
  "Proposal Sent": { text: "#a371f7", border: "#6e40c9" },
  Engaged: { text: "#3fb950", border: "#238636" },
  "Closed Won": { text: "#3fb950", border: "#238636" },
  Dead: { text: "#484f58", border: "#30363d" },
};
const NEXT_ACTIONS = ["Callback","Send Email","Send Proposal","Verify Loan Data","Schedule Follow-Up","Add to Pipeline","No Action"];
const PROPERTY_TYPES = ["Multifamily","Mixed Use","Retail","Office","Industrial","Self Storage","Hotel/Motel","Mobile Home Park","Land","Other"];
const ACTIVITY_TYPES = ["Call", "Email", "Text", "Meeting", "Note"];
const ACTIVITY_ICONS: Record<string, string> = {
  Call: "📞",
  Email: "✉️",
  Text: "💬",
  Meeting: "🤝",
  Note: "📝",
};

function daysUntil(dateStr?: string): number | null {
  if (!dateStr) return null;
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000);
}
function urgencyColor(days: number | null) {
  if (days === null) return "#484f58";
  if (days < 60) return "#f85149";
  if (days < 120) return "#d29922";
  return "#3fb950";
}
function fmt(n?: number | null) { return n ? "$" + n.toLocaleString() : "—"; }
function fmtPhone(p: string) {
  const d = p.replace(/\D/g, "");
  return d.length === 10 ? `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}` : p;
}
function fmtDateTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) +
    " " + d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}
function generateEmailDraft(lead: Lead) {
  const f = lead.fields;
  const firstName = (f["Lead Name"] ?? "there").split(" ")[0];
  const address = f["Property Address"] ?? "your property";
  const amount = f["Loan Amount"] ? `$${f["Loan Amount"].toLocaleString()}` : null;
  const maturity = f["Balloon Maturity"] ? new Date(f["Balloon Maturity"]).toLocaleDateString("en-US",{month:"long",year:"numeric"}) : null;
  const lender = f["Lender Name"] ?? null;
  const maturityLine = maturity
    ? `I know your balloon note${lender ? ` with ${lender}` : ""} on ${address} is maturing in ${maturity}${amount ? ` — roughly ${amount}` : ""}.`
    : `I wanted to follow up regarding your property at ${address}.`;
  return `Subject: Re: Refinancing ${address} — Next Steps\n\nHi ${firstName},\n\nGreat speaking with you earlier. ${maturityLine}\n\nMy team specializes in commercial mortgage refinancing for exactly these situations. We work with 50+ lenders and typically close in 30–60 days, so you'd have a commitment well before the maturity date.\n\nHere's what the next step looks like:\n• 15-minute call to review your property's financials\n• We pull competing term sheets (no cost, no obligation)\n• You pick the best rate and we handle the rest\n\nAre you free for a quick call this week? I can work around your schedule.\n\nBest,\nDavid\nRefiLoop Commercial Mortgage\nNMLS #2510864\ndavid@refiloop.com`;
}
function StatusBadge({ status }: { status?: string }) {
  const s = status ?? "New"; const c = STATUS_COLORS[s] ?? STATUS_COLORS["New"];
  return <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ color: c.text, border: `1px solid ${c.border}`, background: "transparent" }}>{s}</span>;
}
function UrgencyPill({ days }: { days: number | null }) {
  if (days === null) return null;
  const color = urgencyColor(days);
  const label = days <= 0 ? "MATURED" : days < 30 ? `${days}d 🔥` : `${days}d`;
  return <span className="text-xs px-2 py-0.5 rounded font-mono font-bold" style={{ color, background: color+"18", border: `1px solid ${color}40` }}>{label}</span>;
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="block text-xs mb-1 font-medium" style={{ color: "#484f58" }}>{label.toUpperCase()}</label>{children}</div>;
}

export default function HotLeadsClient({ user }: { user: "david" | "gorjan" }) {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Lead | null>(null);
  const [tab, setTab] = useState<"details"|"email"|"log">("details");
  const [statusFilter, setStatusFilter] = useState("all");
  const [saving, setSaving] = useState(false);
  const [emailBody, setEmailBody] = useState("");
  const [copied, setCopied] = useState(false);
  const [showNewLead, setShowNewLead] = useState(false);
  const [editFields, setEditFields] = useState<Lead["fields"]>({});
  const [addMode, setAddMode] = useState<"search"|"manual">("search");
  const [searchQ, setSearchQ] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedResult, setSelectedResult] = useState<SearchResult | null>(null);
  const [pickPhone, setPickPhone] = useState("");
  const [callNote, setCallNote] = useState("");

  const [activities, setActivities] = useState<Activity[]>([]);
  const [activitiesLoading, setActivitiesLoading] = useState(false);
  const [activityType, setActivityType] = useState("Call");
  const [activitySummary, setActivitySummary] = useState("");

  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/hot-leads");
    const data = await res.json();
    setLeads(Array.isArray(data) ? data : []);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const loadActivities = useCallback(async (leadId: string) => {
    setActivitiesLoading(true);
    const res = await fetch(`/api/hot-leads/${leadId}/activities`);
    const data = await res.json();
    setActivities(Array.isArray(data) ? data : []);
    setActivitiesLoading(false);
  }, []);

  useEffect(() => {
    if (searchQ.length < 2) { setSearchResults([]); return; }
    if (searchTimer.current) clearTimeout(searchTimer.current);
    setSearching(true);
    searchTimer.current = setTimeout(async () => {
      const res = await fetch(`/api/hot-leads/search?q=${encodeURIComponent(searchQ)}`);
      const data = await res.json();
      setSearchResults(Array.isArray(data) ? data : []);
      setSearching(false);
    }, 350);
  }, [searchQ]);

  function openLead(lead: Lead) {
    setSelected(lead); setEditFields({ ...lead.fields });
    setEmailBody(generateEmailDraft(lead)); setTab("details");
    setActivitySummary(""); setActivityType("Call");
    loadActivities(lead.id);
  }

  async function saveFields() {
    if (!selected) return; setSaving(true);
    await fetch(`/api/hot-leads/${selected.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(editFields) });
    setLeads(prev => prev.map(l => l.id === selected.id ? { ...l, fields: { ...l.fields, ...editFields } } : l));
    setSelected(prev => prev ? { ...prev, fields: { ...prev.fields, ...editFields } } : null);
    setSaving(false);
  }

  async function logActivity() {
    if (!selected || !activitySummary.trim()) return;
    setSaving(true);
    const res = await fetch(`/api/hot-leads/${selected.id}/activities`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: activityType, summary: activitySummary, created_by: user === "david" ? "David" : "Gorjan" }),
    });
    if (res.ok) {
      const newAct = await res.json() as Activity;
      setActivities(prev => [newAct, ...prev]);
      const now = new Date().toISOString().split("T")[0];
      setLeads(prev => prev.map(l => l.id === selected.id ? { ...l, fields: { ...l.fields, "Last Contact": now } } : l));
      setSelected(prev => prev ? { ...prev, fields: { ...prev.fields, "Last Contact": now } } : null);
      setActivitySummary("");
    }
    setSaving(false);
  }

  function copyEmail() { navigator.clipboard.writeText(emailBody); setCopied(true); setTimeout(() => setCopied(false), 2000); }

  async function addFromSearch() {
    if (!selectedResult) return; setSaving(true);
    const loan = selectedResult.loan;
    const phone = pickPhone || selectedResult.phones[0] || "";
    await fetch("/api/hot-leads", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
      name: selectedResult.name, owner_id: selectedResult.owner_id,
      loan_id: loan?.loan_id ?? null, capitalize_loan_id: loan?.capitalize_loan_id ?? null,
      phone, property_address: loan?.property_address ?? "", property_city: loan?.property_city ?? "",
      property_state: loan?.property_state ?? "", property_zip: loan?.property_zip ?? "",
      property_type: loan?.property_type ?? "", loan_amount: loan?.loan_amount ?? null,
      loan_amount_num: loan?.loan_amount_num ?? null, lender_name: loan?.lender_name ?? null,
      due_date: loan?.due_date ?? null, interest_rate: loan?.interest_rate ?? null,
      lead_score: loan?.lead_score ?? null, status: "Follow-Up",
      call_summary: callNote || "Positive response — added manually.",
      last_contact: new Date().toISOString().split("T")[0],
      assigned_to: user === "david" ? "David" : "Gorjan", added_by: "manual",
    })});
    await load(); resetModal();
  }

  const [newLead, setNewLead] = useState({ "Lead Name":"","Property Address":"","Loan Amount":"","Balloon Maturity":"","Lender Name":"","Property Type":"",Status:"New","Call Summary":"","Next Action":"Callback","Assigned To":user==="david"?"David":"Gorjan",Phone:"",Email:"" });

  async function createManualLead() {
    setSaving(true);
    const fields: Record<string,string|number> = {};
    Object.entries(newLead).forEach(([k,v]) => { if (!v) return; if (k==="Loan Amount") fields[k]=Number(v); else fields[k]=v; });
    fields["Last Contact"] = new Date().toISOString().split("T")[0];
    await fetch("/api/hot-leads", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(fields) });
    await load(); resetModal();
  }

  function resetModal() {
    setShowNewLead(false); setSearchQ(""); setSearchResults([]); setSelectedResult(null);
    setPickPhone(""); setCallNote(""); setSaving(false);
    setNewLead({ "Lead Name":"","Property Address":"","Loan Amount":"","Balloon Maturity":"","Lender Name":"","Property Type":"",Status:"New","Call Summary":"","Next Action":"Callback","Assigned To":user==="david"?"David":"Gorjan",Phone:"",Email:"" });
  }

  const filtered = statusFilter==="all" ? leads : leads.filter(l => (l.fields.Status??"New")===statusFilter);
  const statusCounts = leads.reduce<Record<string,number>>((acc,l) => { const s=l.fields.Status??"New"; acc[s]=(acc[s]??0)+1; return acc; }, {});

  return (
    <div className="flex h-full" style={{color:"#e6edf3"}}>
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <div className="px-6 pt-6 pb-4 border-b" style={{borderColor:"#30363d"}}>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-xl font-semibold" style={{color:"#e6edf3"}}>Hot Leads</h1>
              <p className="text-sm mt-0.5" style={{color:"#8b949e"}}>{leads.length} leads · {leads.filter(l=>{const d=daysUntil(l.fields["Balloon Maturity"]);return d!==null&&d<90;}).length} maturing within 90 days</p>
            </div>
            <button onClick={()=>{setAddMode("search");setShowNewLead(true);}} className="px-3 py-1.5 rounded-md text-sm font-medium" style={{background:"#238636",color:"#fff",border:"1px solid #2ea043"}}>+ Add Lead</button>
          </div>
          <div className="flex gap-1 overflow-x-auto pb-1">
            {["all",...STATUSES].map(s => {
              const count=s==="all"?leads.length:(statusCounts[s]??0); const active=statusFilter===s;
              return <button key={s} onClick={()=>setStatusFilter(s)} className="shrink-0 px-3 py-1 rounded text-xs" style={{background:active?"#21262d":"transparent",color:active?"#e6edf3":"#8b949e",border:active?"1px solid #30363d":"1px solid transparent"}}>{s==="all"?"All":s}{count>0?` (${count})`:""}</button>;
            })}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {loading ? <div className="flex items-center justify-center h-40" style={{color:"#8b949e"}}>Loading…</div>
          : filtered.length===0 ? <div className="flex flex-col items-center justify-center h-40 gap-2" style={{color:"#8b949e"}}><span className="text-2xl">📭</span><span className="text-sm">No leads in this status</span></div>
          : filtered.map(lead => {
            const f=lead.fields; const days=daysUntil(f["Balloon Maturity"]); const isActive=selected?.id===lead.id;
            return <div key={lead.id} onClick={()=>openLead(lead)} className="rounded-lg p-4 cursor-pointer" style={{background:isActive?"#21262d":"#0d1117",border:`1px solid ${isActive?"#58a6ff40":"#21262d"}`}}>
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="font-medium text-sm" style={{color:"#e6edf3"}}>{f["Lead Name"]??"Unknown"}</span>
                    <StatusBadge status={f.Status} />
                    {days!==null&&<UrgencyPill days={days}/>}
                    {f.mojo_status&&<span className="text-xs px-1.5 py-0.5 rounded" style={{background:"#0d1117",color:"#58a6ff",border:"1px solid #1f6feb"}}>Mojo: {f.mojo_status}</span>}
                  </div>
                  <div className="text-xs mb-1.5" style={{color:"#8b949e"}}>📍 {f["Property Address"]??"—"}{f["Property Type"]&&<span className="ml-2 px-1.5 py-0.5 rounded" style={{background:"#21262d",color:"#8b949e"}}>{f["Property Type"]}</span>}</div>
                  {f["Call Summary"]&&<div className="text-xs line-clamp-2 mb-1.5" style={{color:"#8b949e"}}>💬 {f["Call Summary"]}</div>}
                  <div className="flex items-center gap-3 text-xs" style={{color:"#484f58"}}>
                    {f["Loan Amount"]&&<span>💰 {fmt(f["Loan Amount"])}</span>}
                    {f["Lender Name"]&&<span>🏦 {f["Lender Name"]}</span>}
                    {f["Next Action"]&&<span className="px-1.5 py-0.5 rounded" style={{background:"#161b22",color:"#58a6ff"}}>→ {f["Next Action"]}</span>}
                  </div>
                </div>
              </div>
            </div>;
          })}
        </div>
      </div>

      {selected&&(
        <div className="flex flex-col border-l overflow-hidden" style={{width:480,borderColor:"#30363d",background:"#0d1117"}}>
          <div className="flex items-center justify-between px-5 py-4 border-b" style={{borderColor:"#30363d"}}>
            <div><div className="font-semibold text-sm" style={{color:"#e6edf3"}}>{selected.fields["Lead Name"]??"Lead"}</div><div className="text-xs mt-0.5" style={{color:"#8b949e"}}>{selected.fields["Property Address"]??""}</div></div>
            <button onClick={()=>setSelected(null)} style={{color:"#484f58"}}>×</button>
          </div>
          <div className="flex border-b" style={{borderColor:"#30363d"}}>
            {(["details","email","log"] as const).map(t=>(
              <button key={t} onClick={()=>setTab(t)} className="flex-1 py-2.5 text-xs font-medium capitalize" style={{color:tab===t?"#e6edf3":"#8b949e",borderBottom:tab===t?"2px solid #58a6ff":"2px solid transparent"}}>
                {t==="details"?"📋 Details":t==="email"?"✉️ Email":"🗂 Activity"}
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-y-auto">
            {tab==="details"&&(
              <div className="p-5 space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  {[{label:"Loan Amount",value:fmt(editFields["Loan Amount"] as number|undefined)},{label:"Matures",value:editFields["Balloon Maturity"]?new Date(editFields["Balloon Maturity"] as string).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}):"—",accent:urgencyColor(daysUntil(editFields["Balloon Maturity"] as string|undefined))},{label:"Lender",value:(editFields["Lender Name"] as string)||"—"},{label:"Phone",value:(editFields["Phone"] as string)?fmtPhone(editFields["Phone"] as string):"—"}].map(({label,value,accent})=>(
                    <div key={label} className="rounded-md p-3" style={{background:"#161b22",border:"1px solid #21262d"}}><div className="text-xs mb-1" style={{color:"#484f58"}}>{label}</div><div className="text-sm font-medium" style={{color:accent??"#e6edf3"}}>{value}</div></div>
                  ))}
                </div>
                <div className="space-y-3">
                  <Field label="Status"><select value={(editFields.Status as string)??"New"} onChange={e=>setEditFields(p=>({...p,Status:e.target.value}))} style={{background:"#161b22",color:"#e6edf3",border:"1px solid #30363d"}} className="w-full rounded px-2 py-1.5 text-sm">{STATUSES.map(s=><option key={s}>{s}</option>)}</select></Field>
                  <Field label="Next Action"><select value={(editFields["Next Action"] as string)??""} onChange={e=>setEditFields(p=>({...p,"Next Action":e.target.value}))} style={{background:"#161b22",color:"#e6edf3",border:"1px solid #30363d"}} className="w-full rounded px-2 py-1.5 text-sm"><option value="">—</option>{NEXT_ACTIONS.map(a=><option key={a}>{a}</option>)}</select></Field>
                  <Field label="Callback Date"><input type="date" value={(editFields["Callback Date"] as string)??""} onChange={e=>setEditFields(p=>({...p,"Callback Date":e.target.value}))} style={{background:"#161b22",color:"#e6edf3",border:"1px solid #30363d"}} className="w-full rounded px-2 py-1.5 text-sm"/></Field>
                  <Field label="Email"><input type="email" value={(editFields.Email as string)??""} onChange={e=>setEditFields(p=>({...p,Email:e.target.value}))} style={{background:"#161b22",color:"#e6edf3",border:"1px solid #30363d"}} className="w-full rounded px-2 py-1.5 text-sm" placeholder="borrower@email.com"/></Field>
                  <Field label="Notes"><textarea rows={3} value={(editFields.Notes as string)??""} onChange={e=>setEditFields(p=>({...p,Notes:e.target.value}))} style={{background:"#161b22",color:"#e6edf3",border:"1px solid #30363d",resize:"vertical"}} className="w-full rounded px-2 py-1.5 text-sm" placeholder="Free-form notes…"/></Field>
                </div>
                <button onClick={saveFields} disabled={saving} className="w-full py-2 rounded-md text-sm font-medium" style={{background:saving?"#21262d":"#1f6feb",color:saving?"#484f58":"#fff",border:"1px solid #30363d"}}>{saving?"Saving…":"Save Changes"}</button>
              </div>
            )}
            {tab==="email"&&(
              <div className="p-5 space-y-3">
                <div className="flex items-center justify-between"><span className="text-xs font-medium" style={{color:"#484f58"}}>FOLLOW-UP EMAIL DRAFT</span><button onClick={()=>setEmailBody(generateEmailDraft(selected))} className="text-xs px-2 py-1 rounded" style={{color:"#8b949e",border:"1px solid #30363d",background:"#161b22"}}>↺ Regenerate</button></div>
                <textarea rows={20} value={emailBody} onChange={e=>setEmailBody(e.target.value)} className="w-full rounded-md p-3 text-xs font-mono" style={{background:"#161b22",color:"#e6edf3",border:"1px solid #30363d",resize:"vertical",lineHeight:1.6}}/>
                <div className="flex gap-2">
                  <button onClick={copyEmail} className="flex-1 py-2 rounded-md text-sm font-medium" style={{background:copied?"#238636":"#1f6feb",color:"#fff",border:"1px solid #30363d"}}>{copied?"✓ Copied!":"Copy to Clipboard"}</button>
                  {selected.fields.Email&&<a href={`mailto:${selected.fields.Email}?subject=Refinancing%20${encodeURIComponent(selected.fields["Property Address"]??"")}&body=${encodeURIComponent(emailBody)}`} className="flex-1 py-2 rounded-md text-sm font-medium text-center" style={{background:"#161b22",color:"#8b949e",border:"1px solid #30363d"}}>Open in Mail App</a>}
                </div>
              </div>
            )}
            {tab==="log"&&(
              <div className="p-5 space-y-4">
                <div className="rounded-lg p-4 space-y-3" style={{background:"#161b22",border:"1px solid #21262d"}}>
                  <div className="text-xs font-medium" style={{color:"#8b949e"}}>LOG ACTIVITY</div>
                  <div className="flex gap-1">
                    {ACTIVITY_TYPES.map(t => (
                      <button key={t} onClick={()=>setActivityType(t)} className="flex-1 py-1.5 rounded text-xs font-medium" style={{background:activityType===t?"#21262d":"transparent",color:activityType===t?"#e6edf3":"#484f58",border:activityType===t?"1px solid #30363d":"1px solid #21262d"}}>
                        {ACTIVITY_ICONS[t]} {t}
                      </button>
                    ))}
                  </div>
                  <textarea
                    rows={3}
                    value={activitySummary}
                    onChange={e=>setActivitySummary(e.target.value)}
                    style={{background:"#0d1117",color:"#e6edf3",border:"1px solid #30363d",resize:"vertical"}}
                    className="w-full rounded px-2 py-1.5 text-sm"
                    placeholder={
                      activityType==="Call" ? "What happened on the call? Tone, objections, interest level…" :
                      activityType==="Email" ? "What did you send? Subject, key points…" :
                      activityType==="Text" ? "What did you text? Their response?" :
                      activityType==="Meeting" ? "What was discussed? Outcomes, next steps…" :
                      "Note…"
                    }
                  />
                  <button
                    onClick={logActivity}
                    disabled={saving||!activitySummary.trim()}
                    className="w-full py-2 rounded-md text-sm font-medium"
                    style={{background:saving||!activitySummary.trim()?"#21262d":"#238636",color:saving||!activitySummary.trim()?"#484f58":"#fff",border:"1px solid #30363d"}}
                  >
                    {saving?"Saving…":`Log ${activityType}`}
                  </button>
                </div>
                <div>
                  <div className="text-xs font-medium mb-3" style={{color:"#484f58"}}>HISTORY</div>
                  {activitiesLoading ? (
                    <div className="text-xs py-4 text-center" style={{color:"#484f58"}}>Loading…</div>
                  ) : activities.length === 0 ? (
                    <div className="text-xs py-4 text-center" style={{color:"#484f58"}}>No activity yet — log the first interaction above.</div>
                  ) : (
                    <div className="space-y-2">
                      {activities.map(act => (
                        <div key={act.id} className="rounded-md p-3" style={{background:"#161b22",border:"1px solid #21262d"}}>
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-xs font-medium" style={{color:"#e6edf3"}}>
                              {ACTIVITY_ICONS[act.type] ?? "•"} {act.type}
                            </span>
                            <span className="text-xs" style={{color:"#484f58"}}>{fmtDateTime(act.created_at)}</span>
                          </div>
                          <div className="text-xs" style={{color:"#8b949e",lineHeight:1.5}}>{act.summary}</div>
                          <div className="text-xs mt-1.5" style={{color:"#484f58"}}>{act.created_by}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {showNewLead&&(
        <div className="fixed inset-0 flex items-center justify-center z-50" style={{background:"rgba(0,0,0,0.75)"}} onClick={e=>{if(e.target===e.currentTarget)resetModal();}}>
          <div className="rounded-xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden" style={{background:"#161b22",border:"1px solid #30363d"}}>
            <div className="flex items-center justify-between px-5 py-4 border-b" style={{borderColor:"#30363d"}}><span className="font-semibold text-sm" style={{color:"#e6edf3"}}>Add Hot Lead</span><button onClick={resetModal} style={{color:"#484f58"}}>×</button></div>
            <div className="flex border-b" style={{borderColor:"#30363d"}}>
              {(["search","manual"] as const).map(m=>(
                <button key={m} onClick={()=>setAddMode(m)} className="flex-1 py-2.5 text-xs font-medium" style={{color:addMode===m?"#e6edf3":"#8b949e",borderBottom:addMode===m?"2px solid #58a6ff":"2px solid transparent"}}>
                  {m==="search"?"🔍 Search Database":"✏️ Manual Entry"}
                </button>
              ))}
            </div>
            {addMode==="search"&&(
              <div className="p-5 space-y-3 max-h-[70vh] overflow-y-auto">
                <input autoFocus type="text" value={searchQ} onChange={e=>{setSearchQ(e.target.value);setSelectedResult(null);}} style={{background:"#0d1117",color:"#e6edf3",border:"1px solid #30363d"}} className="w-full rounded px-3 py-2 text-sm" placeholder="Search by name or phone number…"/>
                {searching&&<div className="text-xs" style={{color:"#8b949e"}}>Searching…</div>}
                {searchResults.length>0&&!selectedResult&&(
                  <div className="space-y-2">
                    {searchResults.map(r=>(
                      <div key={r.owner_id} onClick={()=>{setSelectedResult(r);setPickPhone(r.phones[0]??"");}} className="rounded-lg p-3 cursor-pointer" style={{background:"#0d1117",border:"1px solid #21262d"}}>
                        <div className="font-medium text-sm mb-1" style={{color:"#e6edf3"}}>{r.name}</div>
                        <div className="text-xs space-y-0.5" style={{color:"#8b949e"}}>
                          {r.phones.length>0&&<div>📞 {r.phones.map(fmtPhone).join(" · ")}</div>}
                          {r.loan?<><div>📍 {r.loan.property_address}, {r.loan.property_city} {r.loan.property_state}</div><div>💰 {r.loan.loan_amount} · 🏦 {r.loan.lender_name} · Due {r.loan.due_date?.slice(0,7)}</div></>:<div style={{color:"#484f58"}}>No loan found</div>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {searchQ.length>=2&&!searching&&searchResults.length===0&&<div className="text-sm text-center py-4" style={{color:"#484f58"}}>No matches — try manual entry</div>}
                {selectedResult&&(
                  <div className="space-y-3">
                    <div className="rounded-lg p-3" style={{background:"#0d1117",border:"1px solid #238636"}}>
                      <div className="font-semibold text-sm mb-2" style={{color:"#3fb950"}}>✓ {selectedResult.name}</div>
                      {selectedResult.loan&&<div className="text-xs space-y-0.5" style={{color:"#8b949e"}}><div>📍 {selectedResult.loan.property_address}, {selectedResult.loan.property_city} {selectedResult.loan.property_state}</div><div>💰 {selectedResult.loan.loan_amount} · 🏦 {selectedResult.loan.lender_name}</div><div>📅 Due: {selectedResult.loan.due_date} · Rate: {selectedResult.loan.interest_rate}</div><div>🏗 {selectedResult.loan.property_type}</div></div>}
                    </div>
                    {selectedResult.phones.length>1&&<Field label="Select Phone"><select value={pickPhone} onChange={e=>setPickPhone(e.target.value)} style={{background:"#0d1117",color:"#e6edf3",border:"1px solid #30363d"}} className="w-full rounded px-2 py-1.5 text-sm">{selectedResult.phones.map(p=><option key={p} value={p}>{fmtPhone(p)}</option>)}</select></Field>}
                    <Field label="Call Note"><textarea rows={2} value={callNote} onChange={e=>setCallNote(e.target.value)} style={{background:"#0d1117",color:"#e6edf3",border:"1px solid #30363d",resize:"vertical"}} className="w-full rounded px-2 py-1.5 text-sm" placeholder="Positive response from call…"/></Field>
                    <button onClick={()=>setSelectedResult(null)} className="text-xs" style={{color:"#8b949e"}}>← Back to results</button>
                  </div>
                )}
              </div>
            )}
            {addMode==="manual"&&(
              <div className="p-5 space-y-3 max-h-[70vh] overflow-y-auto">
                {[{key:"Lead Name",placeholder:"John Smith",type:"text"},{key:"Phone",placeholder:"229-400-8533",type:"tel"},{key:"Property Address",placeholder:"123 Main St, Iron City GA",type:"text"},{key:"Loan Amount",placeholder:"806000",type:"number"},{key:"Balloon Maturity",placeholder:"",type:"date"},{key:"Lender Name",placeholder:"Peoples South Bank",type:"text"},{key:"Email",placeholder:"borrower@email.com",type:"email"}].map(({key,placeholder,type})=>(
                  <Field key={key} label={key}><input type={type} value={(newLead as Record<string,string>)[key]??""} onChange={e=>setNewLead(p=>({...p,[key]:e.target.value}))} style={{background:"#0d1117",color:"#e6edf3",border:"1px solid #30363d"}} className="w-full rounded px-2 py-1.5 text-sm" placeholder={placeholder}/></Field>
                ))}
                <Field label="Property Type"><select value={newLead["Property Type"]} onChange={e=>setNewLead(p=>({...p,"Property Type":e.target.value}))} style={{background:"#0d1117",color:"#e6edf3",border:"1px solid #30363d"}} className="w-full rounded px-2 py-1.5 text-sm"><option value="">—</option>{PROPERTY_TYPES.map(t=><option key={t}>{t}</option>)}</select></Field>
                <Field label="Call Summary"><textarea rows={3} value={newLead["Call Summary"]} onChange={e=>setNewLead(p=>({...p,"Call Summary":e.target.value}))} style={{background:"#0d1117",color:"#e6edf3",border:"1px solid #30363d",resize:"vertical"}} className="w-full rounded px-2 py-1.5 text-sm" placeholder="What happened on the call?"/></Field>
              </div>
            )}
            <div className="flex gap-2 px-5 py-4 border-t" style={{borderColor:"#30363d"}}>
              <button onClick={resetModal} className="flex-1 py-2 rounded-md text-sm" style={{background:"#21262d",color:"#8b949e",border:"1px solid #30363d"}}>Cancel</button>
              <button onClick={addMode==="search"?addFromSearch:createManualLead} disabled={saving||(addMode==="search"&&!selectedResult)||(addMode==="manual"&&!newLead["Lead Name"])} className="flex-1 py-2 rounded-md text-sm font-medium" style={{background:(saving||(addMode==="search"&&!selectedResult)||(addMode==="manual"&&!newLead["Lead Name"]))?"#21262d":"#238636",color:(saving||(addMode==="search"&&!selectedResult)||(addMode==="manual"&&!newLead["Lead Name"]))?"#484f58":"#fff",border:"1px solid #30363d"}}>{saving?"Adding…":"Add as Hot Lead"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
