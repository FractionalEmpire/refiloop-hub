"use client";
import { useState, useEffect, useCallback, useRef } from "react";

// ─── Types ───────────────────────────────────────────────────────────────────

// Activity stored in hot_lead_activities table
interface DbActivity {
  id: number;
  hot_lead_id: number;
  type: string;
  summary: string;
  created_by: string;
  created_at: string;
  direction?: string;       // "outgoing" | "incoming"
  gmail_message_id?: string;
  gmail_thread_id?: string;
}

// Legacy JSON format kept for backward-compat parse
interface LegacyEntry {
  type: string;
  text: string;
  ts: string;
}

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
    "Connected Via"?: string;
  };
}

interface EnrichPhone {
  phone: string; source: string; verified: boolean;
  quality_score: number | null; phone_type: string | null;
  is_primary: boolean; priority: number | null;
}
interface EnrichEmail {
  email: string; source: string; is_valid: boolean;
  is_primary: boolean; priority: number | null; email_type: string | null;
}
interface EnrichLoan {
  id: number; property_type: string | null; property_subtype: string | null;
  interest_rate: number | null; interest_rate_type: string | null; ltv: number | null;
  lender_name: string | null; lender_type: string | null; mortgage_amount: number | null;
  display_loan_amount: string | null; term: string | null; due_date: string | null;
  estimated_due_date: string | null; address: string | null; city: string | null;
  state: string | null; year_built: number | null; unit_count: number | null;
  building_sqft: number | null;
}
interface EnrichData {
  owner_id: number;
  owner: { name: string | null; first_name: string | null; last_name: string | null;
    skip_trace_match: boolean | null; outreach_status: string | null; } | null;
  phones: EnrichPhone[]; emails: EnrichEmail[]; loans: EnrichLoan[];
}


// ─── Constants ────────────────────────────────────────────────────────────────
const STATUSES = ["New", "Follow-Up", "Proposal Sent", "Engaged", "Closed Won", "Dead"];

const STATUS_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  New:             { bg: "#0d1117", text: "#58a6ff", border: "#1f6feb" },
  "Follow-Up":     { bg: "#0d1117", text: "#d29922", border: "#9e6a03" },
  "Proposal Sent": { bg: "#0d1117", text: "#a371f7", border: "#6e40c9" },
  Engaged:         { bg: "#0d1117", text: "#3fb950", border: "#238636" },
  "Closed Won":    { bg: "#0d1117", text: "#3fb950", border: "#238636" },
  Dead:            { bg: "#0d1117", text: "#484f58", border: "#30363d" },
};

const NEXT_ACTIONS = [
  "Callback", "Send Email", "Send Proposal", "Verify Loan Data",
  "Schedule Follow-Up", "Add to Pipeline", "No Action",
];

const PROPERTY_TYPES = [
  "Multifamily", "Mixed Use", "Retail", "Office", "Industrial",
  "Self Storage", "Hotel/Motel", "Land", "Other",
];

const ACTIVITY_TYPES = ["Call", "Email", "Text", "Meeting", "Note"];

const ACTIVITY_ICONS: Record<string, string> = {
  Call: "📞", Email: "✉️", Text: "💬", Meeting: "🤝", Note: "📝",
};

const ACTIVITY_COLORS: Record<string, string> = {
  Call: "#58a6ff", Email: "#a371f7", Text: "#3fb950", Meeting: "#d29922", Note: "#8b949e",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function daysUntil(dateStr?: string): number | null {
  if (!dateStr) return null;
  const diff = new Date(dateStr).getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function urgencyColor(days: number | null): string {
  if (days === null) return "#484f58";
  if (days < 60)  return "#f85149";
  if (days < 120) return "#d29922";
  return "#3fb950";
}

function fmt(n?: number) {
  if (!n) return "—";
  return "$" + n.toLocaleString();
}

// Legacy Notes JSON → DbActivity-shaped objects for display
function legacyActivities(notes?: string, callSummary?: string, lastContact?: string): DbActivity[] {
  const entries: LegacyEntry[] = [];
  if (notes) {
    try {
      const parsed = JSON.parse(notes);
      if (Array.isArray(parsed)) entries.push(...parsed);
    } catch {
      const noteDate = (lastContact ?? new Date().toISOString().split("T")[0]) + "T00:00:00.000Z";
      entries.push({ type: "Note", text: notes, ts: noteDate });
    }
  }
  if (callSummary && lastContact && !entries.some(e => e.text === callSummary)) {
    entries.push({ type: "Call", text: callSummary, ts: lastContact + "T00:00:00.000Z" });
  }
  return entries
    .sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime())
    .map((e, i) => ({
      id: -(i + 1),
      hot_lead_id: 0,
      type: e.type,
      summary: e.text,
      created_by: "legacy",
      created_at: e.ts,
    }));
}

function generateEmailDraft(lead: Lead): { subject: string; body: string } {
  const f = lead.fields;
  const name = f["Lead Name"] ?? "there";
  const firstName = name.split(" ")[0];
  const address = f["Property Address"] ?? "your property";
  const amount = f["Loan Amount"] ? `$${f["Loan Amount"].toLocaleString()}` : null;
  const maturity = f["Balloon Maturity"]
    ? new Date(f["Balloon Maturity"]).toLocaleDateString("en-US", { month: "long", year: "numeric" })
    : null;
  const lender = f["Lender Name"] ?? null;

  const maturityLine = maturity
    ? `I know your balloon note${lender ? ` with ${lender}` : ""} on ${address} is maturing in ${maturity}${amount ? ` – roughly ${amount}` : ""}.`
    : `I wanted to follow up regarding your property at ${address}.`;

  const subject = `Re: Refinancing ${address} – Next Steps`;
  const body = `Hi ${firstName},

Great speaking with you earlier. ${maturityLine}

My team specializes in commercial mortgage refinancing for exactly these situations. We work with 50+ lenders and typically close in 30–60 days, so you'd have a commitment well before the maturity date.

Here's what the next step looks like:
• 15-minute call to review your property's financials
• We pull competing term sheets (no cost, no obligation)
• You pick the best rate and we handle the rest

Are you free for a quick call this week? I can work around your schedule.

Best,
David
RefiLoop Commercial Mortgage
NMLS #2510864
david@refiloop.com`;

  return { subject, body };
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function StatusBadge({ status }: { status?: string }) {
  const s = status ?? "New";
  const c = STATUS_COLORS[s] ?? STATUS_COLORS["New"];
  return (
    <span
      className="text-xs px-2 py-0.5 rounded-full font-medium"
      style={{ color: c.text, border: `1px solid ${c.border}`, background: "transparent" }}
    >
      {s}
    </span>
  );
}

function UrgencyPill({ days }: { days: number | null }) {
  if (days === null) return null;
  const color = urgencyColor(days);
  const label = days <= 0 ? "MATURED" : days < 30 ? `${days}d 🔥` : `${days}d`;
  return (
    <span
      className="text-xs px-2 py-0.5 rounded font-mono font-bold"
      style={{ color, background: color + "18", border: `1px solid ${color}40` }}
    >
      {label}
    </span>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs mb-1 font-medium" style={{ color: "#484f58" }}>
        {label.toUpperCase()}
      </label>
      {children}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
function SourceBadge({ source, verified }: { source: string; verified?: boolean }) {
  if (source === "mojo") return <span className="text-xs px-1.5 py-0.5 rounded font-medium" style={{ background: "#238636", color: "#3fb950", border: "1px solid #2ea04340" }}>✓ Called</span>;
  if (source === "idi") return <span className="text-xs px-1.5 py-0.5 rounded font-medium" style={{ background: "#9e6a0320", color: "#d29922", border: "1px solid #9e6a0340" }}>IDI Trace</span>;
  if (verified) return <span className="text-xs px-1.5 py-0.5 rounded font-medium" style={{ background: "#1f6feb20", color: "#58a6ff", border: "1px solid #1f6feb40" }}>✓ Verified</span>;
  return <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: "#21262d", color: "#484f58" }}>{source}</span>;
}

export default function HotLeadsClient({ user }: { user: "david" | "gorjan" }) {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Lead | null>(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [saving, setSaving] = useState(false);
  const [showNewLead, setShowNewLead] = useState(false);

  // Email compose state
  const [showEmail, setShowEmail] = useState(false);
  const [emailTo, setEmailTo] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  // Edit state
  const [editFields, setEditFields] = useState<Lead["fields"]>({});

  // Activity log state (from hot_lead_activities table)
  const [activityType, setActivityType] = useState("Call");
  const [activityText, setActivityText] = useState("");
  const [activityLog, setActivityLog] = useState<DbActivity[]>([]);
  const [activitiesLoading, setActivitiesLoading] = useState(false);
  const [enrichData, setEnrichData] = useState<EnrichData | null>(null);
  const [enrichLoading, setEnrichLoading] = useState(false);

  // Inbox sync state
  const [syncing, setSyncing] = useState(false);
  const [lastSynced, setLastSynced] = useState<Date | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/hot-leads");
    const data = await res.json();
    setLeads(Array.isArray(data) ? data : []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function fetchActivities(leadId: string, lead: Lead) {
    setActivitiesLoading(true);
    try {
      const res = await fetch(`/api/hot-leads/${leadId}/activities`);
      const data: DbActivity[] = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        setActivityLog(data);
      } else {
        // Fall back to legacy Notes JSON for existing leads
        setActivityLog(legacyActivities(
          lead.fields.Notes,
          lead.fields["Call Summary"],
          lead.fields["Last Contact"],
        ));
      }
    } finally {
      setActivitiesLoading(false);
    }
  }

  function openLead(lead: Lead) {
    setSelected(lead);
    setEditFields({ ...lead.fields });
    const draft = generateEmailDraft(lead);
    setEmailTo((lead.fields.Email as string) ?? "");
    setEmailSubject(draft.subject);
    setEmailBody(draft.body);
    setShowEmail(false);
    setEmailSent(false);
    setActivityText("");
    setActivityType("Call");
    setEnrichData(null);
    const _ph = lead.fields.Phone;
    if (_ph) {
      setEnrichLoading(true);
      const _url = "/api/hot-leads/enrich" + "?phone=" + encodeURIComponent(_ph);
      fetch(_url).then(r=>r.json()).then(d=>{setEnrichData(d??null);setEnrichLoading(false);}).catch(()=>setEnrichLoading(false));
    }
    fetchActivities(lead.id, lead);
  }

  async function saveFields() {
    if (!selected) return;
    setSaving(true);
    await fetch(`/api/hot-leads/${selected.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editFields),
    });
    setLeads((prev) =>
      prev.map((l) => (l.id === selected.id ? { ...l, fields: { ...l.fields, ...editFields } } : l))
    );
    setSelected((prev) => prev ? { ...prev, fields: { ...prev.fields, ...editFields } } : null);
    setSaving(false);
  }

  async function logActivity() {
    if (!selected || !activityText.trim()) return;
    setSaving(true);
    const res = await fetch(`/api/hot-leads/${selected.id}/activities`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: activityType,
        summary: activityText.trim(),
        created_by: user === "david" ? "David" : "Gorjan",
      }),
    });
    if (res.ok) {
      const newEntry: DbActivity = await res.json();
      setActivityLog((prev) => [newEntry, ...prev]);
      if (activityType === "Call") {
        const updates = { "Call Summary": activityText.trim(), "Last Contact": new Date().toISOString().split("T")[0] };
        await fetch(`/api/hot-leads/${selected.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(updates),
        });
        setEditFields((p) => ({ ...p, ...updates }));
      }
    }
    setActivityText("");
    setSaving(false);
  }

  async function sendEmailToLead() {
    if (!selected || !emailTo || !emailSubject || !emailBody) return;
    setSendingEmail(true);
    try {
      const res = await fetch(`/api/hot-leads/${selected.id}/send-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: emailTo, subject: emailSubject, body: emailBody }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.activity) setActivityLog((prev) => [data.activity as DbActivity, ...prev]);
        setEmailSent(true);
        setTimeout(() => setEmailSent(false), 3000);
        if (!editFields.Email && emailTo) {
          setEditFields((p) => ({ ...p, Email: emailTo }));
          setLeads((prev) =>
            prev.map((l) => l.id === selected.id ? { ...l, fields: { ...l.fields, Email: emailTo } } : l)
          );
        }
      }
    } finally {
      setSendingEmail(false);
    }
  }

  async function syncInbox() {
    setSyncing(true);
    try {
      const res = await fetch("/api/gmail/sync");
      const data = await res.json();
      setLastSynced(new Date());
      if (data.synced > 0 && selected) {
        await fetchActivities(selected.id, selected);
      }
    } finally {
      setSyncing(false);
    }
  }

  const filtered = statusFilter === "all"
    ? leads
    : leads.filter((l) => (l.fields.Status ?? "New") === statusFilter);

  const statusCounts = leads.reduce<Record<string, number>>((acc, l) => {
    const s = l.fields.Status ?? "New";
    acc[s] = (acc[s] ?? 0) + 1;
    return acc;
  }, {});

  const relatedLoans = selected
    ? leads.filter(
        (l) =>
          l.id !== selected.id &&
          l.fields["Lead Name"] &&
          l.fields["Lead Name"] === selected.fields["Lead Name"]
      )
    : [];

  const connectedVia = (editFields["Connected Via"] as string) ?? "";
  const connectedContact =
    connectedVia === "Phone" ? editFields.Phone :
    connectedVia === "Email" ? editFields.Email :
    null;

  // ─── New Lead Form state ────────────────────────────────────────────────────
  const [newLead, setNewLead] = useState({
    "Lead Name": "", "Property Address": "", "Loan Amount": "",
    "Balloon Maturity": "", "Lender Name": "", "Property Type": "",
    Status: "New", "Call Summary": "", "Next Action": "Callback",
    "Assigned To": user === "david" ? "David" : "Gorjan",
  });

  async function createLead() {
    setSaving(true);
    const fields: Record<string, string | number> = {};
    Object.entries(newLead).forEach(([k, v]) => {
      if (!v) return;
      if (k === "Loan Amount") fields[k] = Number(v);
      else fields[k] = v;
    });
    fields["Last Contact"] = new Date().toISOString().split("T")[0];
    await fetch("/api/hot-leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fields),
    });
    await load();
    setShowNewLead(false);
    setNewLead({
      "Lead Name": "", "Property Address": "", "Loan Amount": "",
      "Balloon Maturity": "", "Lender Name": "", "Property Type": "",
      Status: "New", "Call Summary": "", "Next Action": "Callback",
      "Assigned To": user === "david" ? "David" : "Gorjan",
    });
    setSaving(false);
  }

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-full" style={{ color: "#e6edf3" }}>

      {/* Left: Lead List */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b" style={{ borderColor: "#30363d" }}>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-xl font-semibold" style={{ color: "#e6edf3" }}>Hot Leads</h1>
              <p className="text-sm mt-0.5" style={{ color: "#8b949e" }}>
                {leads.length} leads &middot; {leads.filter(l => {
                  const d = daysUntil(l.fields["Balloon Maturity"]);
                  return d !== null && d < 90;
                }).length} maturing within 90 days
                {lastSynced && (
                  <span style={{ color: "#484f58" }}> &middot; synced {lastSynced.toLocaleTimeString()}</span>
                )}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={syncInbox}
                disabled={syncing}
                title="Sync david@refiloop.com inbox for replies"
                className="px-3 py-1.5 rounded-md text-sm transition-colors"
                style={{
                  background: syncing ? "#21262d" : "#161b22",
                  color: syncing ? "#484f58" : "#8b949e",
                  border: "1px solid #30363d",
                }}
              >
                {syncing ? "Syncing…" : "↻ Inbox"}
              </button>
              <button
                onClick={() => setShowNewLead(true)}
                className="px-3 py-1.5 rounded-md text-sm font-medium transition-colors"
                style={{ background: "#238636", color: "#fff", border: "1px solid #2ea043" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#2ea043")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "#238636")}
              >
                + Add Lead
              </button>
            </div>
          </div>

          {/* Status filter tabs */}
          <div className="flex gap-1 overflow-x-auto pb-1">
            {["all", ...STATUSES].map((s) => {
              const count = s === "all" ? leads.length : (statusCounts[s] ?? 0);
              const active = statusFilter === s;
              return (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className="shrink-0 px-3 py-1 rounded text-xs transition-colors"
                  style={{
                    background: active ? "#21262d" : "transparent",
                    color: active ? "#e6edf3" : "#8b949e",
                    border: active ? "1px solid #30363d" : "1px solid transparent",
                  }}
                >
                  {s === "all" ? "All" : s} {count > 0 ? <span style={{ color: "#484f58" }}>({count})</span> : null}
                </button>
              );
            })}
          </div>
        </div>

        {/* Lead cards */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {loading ? (
            <div className="flex items-center justify-center h-40" style={{ color: "#8b949e" }}>Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 gap-2" style={{ color: "#8b949e" }}>
              <span className="text-2xl">🔭</span>
              <span className="text-sm">No leads in this status</span>
            </div>
          ) : (
            filtered.map((lead) => {
              const f = lead.fields;
              const days = daysUntil(f["Balloon Maturity"]);
              const isActive = selected?.id === lead.id;
              const loanCount = leads.filter(l => l.fields["Lead Name"] === f["Lead Name"]).length;
              return (
                <div
                  key={lead.id}
                  onClick={() => openLead(lead)}
                  className="rounded-lg p-4 cursor-pointer transition-colors"
                  style={{
                    background: isActive ? "#21262d" : "#0d1117",
                    border: `1px solid ${isActive ? "#58a6ff40" : "#21262d"}`,
                  }}
                  onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.borderColor = "#30363d"; }}
                  onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.borderColor = "#21262d"; }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="font-medium text-sm" style={{ color: "#e6edf3" }}>
                          {f["Lead Name"] ?? "Unknown"}
                        </span>
                        <StatusBadge status={f.Status} />
                        {days !== null && <UrgencyPill days={days} />}
                        {loanCount > 1 && (
                          <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: "#1f2937", color: "#58a6ff", border: "1px solid #1f6feb40" }}>
                            {loanCount} loans
                          </span>
                        )}
                      </div>
                      <div className="text-xs mb-1.5" style={{ color: "#8b949e" }}>
                        📍 {f["Property Address"] ?? "—"}
                        {f["Property Type"] && <span className="ml-2 px-1.5 py-0.5 rounded text-xs" style={{ background: "#21262d", color: "#8b949e" }}>{f["Property Type"]}</span>}
                      </div>
                      {f["Call Summary"] && (
                        <div className="text-xs line-clamp-2 mb-1.5" style={{ color: "#8b949e" }}>
                          📞 {f["Call Summary"]}
                        </div>
                      )}
                      <div className="flex items-center gap-3 text-xs" style={{ color: "#484f58" }}>
                        {f["Loan Amount"] && <span>💰 {fmt(f["Loan Amount"])}</span>}
                        {f["Lender Name"] && <span>🏦 {f["Lender Name"]}</span>}
                        {f["Next Action"] && (
                          <span className="px-1.5 py-0.5 rounded" style={{ background: "#161b22", color: "#58a6ff" }}>
                            → {f["Next Action"]}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Right: Detail Panel */}
      {selected && (
        <div
          className="flex flex-col border-l overflow-hidden"
          style={{ width: 500, borderColor: "#30363d", background: "#0d1117" }}
        >
          {/* Panel header */}
          <div className="flex items-center justify-between px-5 py-4 border-b shrink-0" style={{ borderColor: "#30363d" }}>
            <div>
              <div className="font-semibold text-sm" style={{ color: "#e6edf3" }}>
                {selected.fields["Lead Name"] ?? "Lead"}
              </div>
              <div className="text-xs mt-0.5" style={{ color: "#8b949e" }}>
                {selected.fields["Property Address"] ?? ""}
              </div>
            </div>
            <button
              onClick={() => setSelected(null)}
              className="text-lg leading-none"
              style={{ color: "#484f58" }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "#e6edf3")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "#484f58")}
            >
              &times;
            </button>
          </div>

          {/* Scrollable body */}
          <div className="flex-1 overflow-y-auto">
            <div className="p-5 space-y-5">

              {/* Quick Stats */}
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-md p-3" style={{ background: "#161b22", border: "1px solid #21262d" }}>
                  <div className="text-xs mb-1" style={{ color: "#484f58" }}>LOAN AMOUNT</div>
                  <div className="text-sm font-medium" style={{ color: "#e6edf3" }}>{fmt(editFields["Loan Amount"] as number | undefined)}</div>
                </div>
                <div className="rounded-md p-3" style={{ background: "#161b22", border: "1px solid #21262d" }}>
                  <div className="text-xs mb-1" style={{ color: "#484f58" }}>MATURES</div>
                  <div className="text-sm font-medium" style={{ color: urgencyColor(daysUntil(editFields["Balloon Maturity"] as string | undefined)) }}>
                    {editFields["Balloon Maturity"]
                      ? new Date(editFields["Balloon Maturity"] as string).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                      : "—"}
                  </div>
                </div>
                <div className="rounded-md p-3" style={{ background: "#161b22", border: "1px solid #21262d" }}>
                  <div className="text-xs mb-1" style={{ color: "#484f58" }}>LENDER</div>
                  <div className="text-sm font-medium" style={{ color: "#e6edf3" }}>{(editFields["Lender Name"] as string) || "—"}</div>
                </div>
                <div className="rounded-md p-3" style={{ background: "#161b22", border: "1px solid #21262d" }}>
                  <div className="text-xs mb-1" style={{ color: "#484f58" }}>
                    {connectedVia ? `CONNECTED VIA ${connectedVia.toUpperCase()}` : "CONTACT"}
                  </div>
                  <div className="text-sm font-medium" style={{ color: connectedVia ? "#3fb950" : "#484f58" }}>
                    {connectedContact || (connectedVia ? "—" : "Not set")}
                  </div>
                </div>
              </div>

              {/* Other Loans */}
              {relatedLoans.length > 0 && (
                <div>
                  <div className="text-xs font-medium mb-2" style={{ color: "#484f58" }}>
                    OTHER LOANS — {selected.fields["Lead Name"]}
                  </div>
                  <div className="space-y-2">
                    {relatedLoans.map((loan) => {
                      const d = daysUntil(loan.fields["Balloon Maturity"]);
                      return (
                        <div
                          key={loan.id}
                          onClick={() => openLead(loan)}
                          className="rounded-md p-3 cursor-pointer transition-colors"
                          style={{ background: "#161b22", border: "1px solid #21262d" }}
                          onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#30363d")}
                          onMouseLeave={(e) => (e.currentTarget.style.borderColor = "#21262d")}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="text-xs truncate" style={{ color: "#8b949e" }}>
                                📍 {loan.fields["Property Address"] ?? "—"}
                              </div>
                              <div className="flex items-center gap-2 mt-1 text-xs" style={{ color: "#484f58" }}>
                                {loan.fields["Loan Amount"] && <span>{fmt(loan.fields["Loan Amount"])}</span>}
                                {loan.fields["Lender Name"] && <span>{loan.fields["Lender Name"]}</span>}
                              </div>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <StatusBadge status={loan.fields.Status} />
                              {d !== null && <UrgencyPill days={d} />}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Recommended Steps */}
              {editFields["Recommended Steps"] && (
                <div className="rounded-md p-3" style={{ background: "#161b22", border: "1px solid #21262d" }}>
                  <div className="text-xs mb-2" style={{ color: "#484f58" }}>RECOMMENDED STEPS</div>
                  <div className="text-xs whitespace-pre-wrap" style={{ color: "#8b949e" }}>
                    {editFields["Recommended Steps"] as string}
                  </div>
                </div>
              )}

              {enrichLoading && <div className="text-xs mb-3" style={{color:"#8b949e"}}>Loading database record…</div>}
              {enrichData && !enrichLoading && (() => {
                const loan = enrichData.loans[0] ?? null;
                return (
                  <div className="mb-4 rounded-lg p-3" style={{background:"#161b22",border:"1px solid #30363d"}}>
                    <div className="text-xs font-semibold mb-3" style={{color:"#8b949e",letterSpacing:"0.08em"}}>
                      DATABASE RECORD{enrichData.loans.length > 1 ? ` (${enrichData.loans.length} loans)` : ""}
                    </div>
                    {loan && (
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1 mb-3 text-xs">
                        {loan.property_type&&<div><span style={{color:"#484f58"}}>TYPE </span><span style={{color:"#e6edf3"}}>{loan.property_type}</span></div>}
                        {loan.interest_rate!=null&&<div><span style={{color:"#484f58"}}>RATE </span><span style={{color:"#e6edf3"}}>{loan.interest_rate}%</span></div>}
                        {loan.ltv!=null&&<div><span style={{color:"#484f58"}}>LTV </span><span style={{color:"#e6edf3"}}>{loan.ltv}%</span></div>}
                        {loan.interest_rate_type&&<div><span style={{color:"#484f58"}}>RATE TYPE </span><span style={{color:"#e6edf3"}}>{loan.interest_rate_type}</span></div>}
                        {loan.lender_type&&<div><span style={{color:"#484f58"}}>LENDER TYPE </span><span style={{color:"#e6edf3"}}>{loan.lender_type}</span></div>}
                        {loan.term&&<div><span style={{color:"#484f58"}}>TERM </span><span style={{color:"#e6edf3"}}>{loan.term}</span></div>}
                        {loan.unit_count!=null&&<div><span style={{color:"#484f58"}}>UNITS </span><span style={{color:"#e6edf3"}}>{loan.unit_count}</span></div>}
                        {loan.year_built!=null&&<div><span style={{color:"#484f58"}}>BUILT </span><span style={{color:"#e6edf3"}}>{loan.year_built}</span></div>}
                      </div>
                    )}
                    {enrichData.phones.length>0&&(
                      <div className="mb-2">
                        <div className="text-xs mb-1" style={{color:"#484f58"}}>ALL PHONES ON FILE</div>
                        {enrichData.phones.map((p,i)=>(
                          <div key={i} className="flex items-center gap-2 mb-0.5">
                            <span className="text-xs font-mono" style={{color:"#e6edf3"}}>{p.phone}</span>
                            <SourceBadge source={p.source} verified={p.verified}/>
                            {p.phone_type&&<span className="text-xs" style={{color:"#8b949e"}}>{p.phone_type}</span>}
                          </div>
                        ))}
                      </div>
                    )}
                    {enrichData.emails.length>0&&(
                      <div>
                        <div className="text-xs mb-1" style={{color:"#484f58"}}>ALL EMAILS ON FILE</div>
                        {enrichData.emails.map((e,i)=>(
                          <div key={i} className="flex items-center gap-2 mb-0.5">
                            <span className="text-xs" style={{color:"#e6edf3"}}>{e.email}</span>
                            <SourceBadge source={e.source} verified={e.is_valid}/>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}
              {/* Editable Fields */}
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Status">
                    <select
                      value={(editFields.Status as string) ?? "New"}
                      onChange={(e) => setEditFields((p) => ({ ...p, Status: e.target.value }))}
                      style={{ background: "#161b22", color: "#e6edf3", border: "1px solid #30363d" }}
                      className="w-full rounded px-2 py-1.5 text-sm"
                    >
                      {STATUSES.map((s) => <option key={s}>{s}</option>)}
                    </select>
                  </Field>
                  <Field label="Next Action">
                    <select
                      value={(editFields["Next Action"] as string) ?? ""}
                      onChange={(e) => setEditFields((p) => ({ ...p, "Next Action": e.target.value }))}
                      style={{ background: "#161b22", color: "#e6edf3", border: "1px solid #30363d" }}
                      className="w-full rounded px-2 py-1.5 text-sm"
                    >
                      <option value="">—</option>
                      {NEXT_ACTIONS.map((a) => <option key={a}>{a}</option>)}
                    </select>
                  </Field>
                </div>

                <Field label="Callback Date">
                  <input
                    type="date"
                    value={(editFields["Callback Date"] as string) ?? ""}
                    onChange={(e) => setEditFields((p) => ({ ...p, "Callback Date": e.target.value }))}
                    style={{ background: "#161b22", color: "#e6edf3", border: "1px solid #30363d" }}
                    className="w-full rounded px-2 py-1.5 text-sm"
                  />
                </Field>

                <Field label="Connected Via">
                  <div className="flex gap-2">
                    {["", "Phone", "Email"].map((opt) => (
                      <button
                        key={opt}
                        onClick={() => setEditFields((p) => ({ ...p, "Connected Via": opt }))}
                        className="flex-1 py-1.5 rounded text-xs font-medium transition-colors"
                        style={{
                          background: connectedVia === opt ? "#1f6feb" : "#161b22",
                          color: connectedVia === opt ? "#fff" : "#8b949e",
                          border: `1px solid ${connectedVia === opt ? "#1f6feb" : "#30363d"}`,
                        }}
                      >
                        {opt === "" ? "None" : opt === "Phone" ? "📞 Phone" : "✉️ Email"}
                      </button>
                    ))}
                  </div>
                </Field>

                {(connectedVia === "Phone" || !connectedVia) && (
                  <Field label="Phone">
                    <input
                      type="tel"
                      value={(editFields.Phone as string) ?? ""}
                      onChange={(e) => setEditFields((p) => ({ ...p, Phone: e.target.value }))}
                      style={{ background: "#161b22", color: "#e6edf3", border: "1px solid #30363d" }}
                      className="w-full rounded px-2 py-1.5 text-sm"
                      placeholder="(555) 000-0000"
                    />
                  </Field>
                )}

                {(connectedVia === "Email" || !connectedVia) && (
                  <Field label="Email">
                    <input
                      type="email"
                      value={(editFields.Email as string) ?? ""}
                      onChange={(e) => {
                        setEditFields((p) => ({ ...p, Email: e.target.value }));
                        setEmailTo(e.target.value);
                      }}
                      style={{ background: "#161b22", color: "#e6edf3", border: "1px solid #30363d" }}
                      className="w-full rounded px-2 py-1.5 text-sm"
                      placeholder="borrower@email.com"
                    />
                  </Field>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <Field label="Property Type">
                    <select
                      value={(editFields["Property Type"] as string) ?? ""}
                      onChange={(e) => setEditFields((p) => ({ ...p, "Property Type": e.target.value }))}
                      style={{ background: "#161b22", color: "#e6edf3", border: "1px solid #30363d" }}
                      className="w-full rounded px-2 py-1.5 text-sm"
                    >
                      <option value="">—</option>
                      {PROPERTY_TYPES.map((t) => <option key={t}>{t}</option>)}
                    </select>
                  </Field>
                  <Field label="Loan Amount ($)">
                    <input
                      type="number"
                      value={(editFields["Loan Amount"] as number) ?? ""}
                      onChange={(e) => setEditFields((p) => ({ ...p, "Loan Amount": Number(e.target.value) }))}
                      style={{ background: "#161b22", color: "#e6edf3", border: "1px solid #30363d" }}
                      className="w-full rounded px-2 py-1.5 text-sm"
                      placeholder="e.g. 1500000"
                    />
                  </Field>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={saveFields}
                  disabled={saving}
                  className="flex-1 py-2 rounded-md text-sm font-medium transition-colors"
                  style={{
                    background: saving ? "#21262d" : "#1f6feb",
                    color: saving ? "#484f58" : "#fff",
                    border: "1px solid #30363d",
                  }}
                >
                  {saving ? "Saving…" : "Save Changes"}
                </button>
                <button
                  onClick={() => setShowEmail(!showEmail)}
                  className="px-3 py-2 rounded-md text-sm transition-colors"
                  style={{
                    background: showEmail ? "#21262d" : "#161b22",
                    color: "#a371f7",
                    border: `1px solid ${showEmail ? "#6e40c9" : "#30363d"}`,
                  }}
                >
                  ✉️ Email
                </button>
              </div>

              {/* Email Compose (collapsible) */}
              {showEmail && (
                <div className="space-y-3 rounded-lg p-4" style={{ background: "#161b22", border: "1px solid #6e40c940" }}>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium" style={{ color: "#a371f7" }}>COMPOSE EMAIL</span>
                    <button
                      onClick={() => {
                        const draft = generateEmailDraft(selected);
                        setEmailSubject(draft.subject);
                        setEmailBody(draft.body);
                      }}
                      className="text-xs px-2 py-1 rounded"
                      style={{ color: "#8b949e", border: "1px solid #30363d", background: "#0d1117" }}
                    >
                      ↺ Reset draft
                    </button>
                  </div>

                  <Field label="To">
                    <input
                      type="email"
                      value={emailTo}
                      onChange={(e) => setEmailTo(e.target.value)}
                      style={{ background: "#0d1117", color: "#e6edf3", border: "1px solid #30363d" }}
                      className="w-full rounded px-2 py-1.5 text-sm"
                      placeholder="borrower@email.com"
                    />
                  </Field>

                  <Field label="Subject">
                    <input
                      type="text"
                      value={emailSubject}
                      onChange={(e) => setEmailSubject(e.target.value)}
                      style={{ background: "#0d1117", color: "#e6edf3", border: "1px solid #30363d" }}
                      className="w-full rounded px-2 py-1.5 text-sm"
                    />
                  </Field>

                  <textarea
                    rows={10}
                    value={emailBody}
                    onChange={(e) => setEmailBody(e.target.value)}
                    className="w-full rounded-md p-3 text-xs font-mono"
                    style={{ background: "#0d1117", color: "#e6edf3", border: "1px solid #30363d", resize: "vertical", lineHeight: 1.6 }}
                  />

                  <button
                    onClick={sendEmailToLead}
                    disabled={sendingEmail || !emailTo || !emailSubject || !emailBody || emailSent}
                    className="w-full py-2 rounded-md text-sm font-medium transition-colors"
                    style={{
                      background: emailSent ? "#238636" : sendingEmail || !emailTo ? "#21262d" : "#6e40c9",
                      color: sendingEmail || !emailTo ? "#484f58" : "#fff",
                      border: "1px solid #30363d",
                    }}
                  >
                    {emailSent ? "✓ Sent!" : sendingEmail ? "Sending…" : "Send from david@refiloop.com"}
                  </button>
                </div>
              )}

              {/* Activity Log */}
              <div style={{ borderTop: "1px solid #21262d", paddingTop: 20 }}>
                <div className="flex items-center justify-between mb-3">
                  <div className="text-xs font-medium" style={{ color: "#484f58" }}>ACTIVITY</div>
                  <button
                    onClick={syncInbox}
                    disabled={syncing}
                    className="text-xs px-2 py-1 rounded transition-colors"
                    style={{ color: syncing ? "#484f58" : "#8b949e", border: "1px solid #30363d", background: "#161b22" }}
                  >
                    {syncing ? "Syncing…" : "↻ Sync inbox"}
                  </button>
                </div>

                {activitiesLoading ? (
                  <div className="text-xs text-center py-4 mb-4" style={{ color: "#484f58" }}>Loading…</div>
                ) : activityLog.length === 0 ? (
                  <div className="text-xs text-center py-4 mb-4 rounded-md" style={{ color: "#484f58", background: "#161b22", border: "1px solid #21262d" }}>
                    No activity yet — log the first interaction below.
                  </div>
                ) : (
                  <div className="mb-4" style={{ position: "relative" }}>
                    <div style={{ position: "absolute", left: 15, top: 0, bottom: 0, width: 1, background: "#21262d" }} />
                    <div className="space-y-3">
                      {activityLog.map((entry) => {
                        const date = new Date(entry.created_at);
                        const dateStr = date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
                        const timeStr = date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
                        const color = ACTIVITY_COLORS[entry.type] ?? "#8b949e";
                        const isGmail = !!entry.gmail_message_id;
                        const isIncoming = entry.direction === "incoming";
                        return (
                          <div key={entry.id} className="flex gap-3" style={{ position: "relative" }}>
                            <div
                              className="shrink-0 flex items-center justify-center rounded-full text-xs"
                              style={{ width: 30, height: 30, background: color + "20", border: `1px solid ${color}60`, color, zIndex: 1 }}
                            >
                              {ACTIVITY_ICONS[entry.type]}
                            </div>
                            <div className="flex-1 min-w-0 rounded-md p-3" style={{ background: "#161b22", border: "1px solid #21262d" }}>
                              <div className="flex items-center gap-2 mb-1 flex-wrap">
                                <span className="text-xs font-semibold" style={{ color }}>
                                  {entry.type}
                                </span>
                                {isGmail && (
                                  <span
                                    className="text-xs px-1.5 py-0.5 rounded"
                                    style={{
                                      background: isIncoming ? "#3fb95020" : "#a371f720",
                                      color: isIncoming ? "#3fb950" : "#a371f7",
                                      border: `1px solid ${isIncoming ? "#3fb95040" : "#a371f740"}`,
                                    }}
                                  >
                                    {isIncoming ? "↩ Reply" : "↗ Sent"}
                                  </span>
                                )}
                                <span className="text-xs" style={{ color: "#484f58" }}>
                                  {dateStr} &middot; {timeStr}
                                </span>
                                {entry.created_by && entry.created_by !== "legacy" && (
                                  <span className="text-xs" style={{ color: "#484f58" }}>&middot; {entry.created_by}</span>
                                )}
                              </div>
                              <div className="text-xs whitespace-pre-wrap" style={{ color: "#8b949e", lineHeight: 1.6 }}>
                                {entry.summary}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Log new entry */}
                <div className="rounded-md p-3 space-y-2" style={{ background: "#161b22", border: "1px solid #30363d" }}>
                  <div className="text-xs font-medium mb-2" style={{ color: "#484f58" }}>LOG NEW INTERACTION</div>
                  <div className="flex gap-1">
                    {ACTIVITY_TYPES.map((t) => (
                      <button
                        key={t}
                        onClick={() => setActivityType(t)}
                        className="flex-1 py-1.5 rounded text-xs font-medium transition-colors"
                        style={{
                          background: activityType === t ? ACTIVITY_COLORS[t] + "25" : "#0d1117",
                          color: activityType === t ? ACTIVITY_COLORS[t] : "#484f58",
                          border: `1px solid ${activityType === t ? ACTIVITY_COLORS[t] + "60" : "#21262d"}`,
                        }}
                      >
                        {ACTIVITY_ICONS[t]}
                        <span className="ml-1 hidden sm:inline">{t}</span>
                      </button>
                    ))}
                  </div>
                  <textarea
                    rows={2}
                    value={activityText}
                    onChange={(e) => setActivityText(e.target.value)}
                    style={{ background: "#0d1117", color: "#e6edf3", border: "1px solid #21262d", resize: "vertical" }}
                    className="w-full rounded px-2 py-1.5 text-sm"
                    placeholder={
                      activityType === "Call" ? "What happened on this call?" :
                      activityType === "Email" ? "What did you send or receive?" :
                      activityType === "Text" ? "What was the text exchange?" :
                      activityType === "Meeting" ? "What was discussed?" :
                      "Add a note…"
                    }
                  />
                  <button
                    onClick={logActivity}
                    disabled={saving || !activityText.trim()}
                    className="w-full py-1.5 rounded text-sm font-medium transition-colors"
                    style={{
                      background: saving || !activityText.trim() ? "#21262d" : ACTIVITY_COLORS[activityType] + "30",
                      color: saving || !activityText.trim() ? "#484f58" : ACTIVITY_COLORS[activityType],
                      border: `1px solid ${saving || !activityText.trim() ? "#30363d" : ACTIVITY_COLORS[activityType] + "60"}`,
                    }}
                  >
                    {saving ? "Saving…" : `${ACTIVITY_ICONS[activityType]} Log ${activityType}`}
                  </button>
                </div>
              </div>

            </div>
          </div>
        </div>
      )}

      {/* New Lead Modal */}
      {showNewLead && (
        <div
          className="fixed inset-0 flex items-center justify-center z-50"
          style={{ background: "rgba(0,0,0,0.7)" }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowNewLead(false); }}
        >
          <div
            className="rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden"
            style={{ background: "#161b22", border: "1px solid #30363d" }}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: "#30363d" }}>
              <span className="font-semibold text-sm" style={{ color: "#e6edf3" }}>Add Hot Lead</span>
              <button onClick={() => setShowNewLead(false)} style={{ color: "#484f58" }}>&times;</button>
            </div>
            <div className="p-5 space-y-3 max-h-[70vh] overflow-y-auto">
              {[
                { key: "Lead Name", placeholder: "John Smith", type: "text" },
                { key: "Property Address", placeholder: "123 Main St, Miami FL", type: "text" },
                { key: "Loan Amount", placeholder: "1500000", type: "number" },
                { key: "Balloon Maturity", placeholder: "", type: "date" },
                { key: "Lender Name", placeholder: "Wells Fargo", type: "text" },
              ].map(({ key, placeholder, type }) => (
                <Field key={key} label={key}>
                  <input
                    type={type}
                    value={(newLead as Record<string, string>)[key] ?? ""}
                    onChange={(e) => setNewLead((p) => ({ ...p, [key]: e.target.value }))}
                    style={{ background: "#0d1117", color: "#e6edf3", border: "1px solid #30363d" }}
                    className="w-full rounded px-2 py-1.5 text-sm"
                    placeholder={placeholder}
                  />
                </Field>
              ))}

              <Field label="Property Type">
                <select
                  value={newLead["Property Type"]}
                  onChange={(e) => setNewLead((p) => ({ ...p, "Property Type": e.target.value }))}
                  style={{ background: "#0d1117", color: "#e6edf3", border: "1px solid #30363d" }}
                  className="w-full rounded px-2 py-1.5 text-sm"
                >
                  <option value="">—</option>
                  {PROPERTY_TYPES.map((t) => <option key={t}>{t}</option>)}
                </select>
              </Field>

              <Field label="Call Summary">
                <textarea
                  rows={3}
                  value={newLead["Call Summary"]}
                  onChange={(e) => setNewLead((p) => ({ ...p, "Call Summary": e.target.value }))}
                  style={{ background: "#0d1117", color: "#e6edf3", border: "1px solid #30363d", resize: "vertical" }}
                  className="w-full rounded px-2 py-1.5 text-sm"
                  placeholder="What happened on the call?"
                />
              </Field>

              <Field label="Next Action">
                <select
                  value={newLead["Next Action"]}
                  onChange={(e) => setNewLead((p) => ({ ...p, "Next Action": e.target.value }))}
                  style={{ background: "#0d1117", color: "#e6edf3", border: "1px solid #30363d" }}
                  className="w-full rounded px-2 py-1.5 text-sm"
                >
                  {NEXT_ACTIONS.map((a) => <option key={a}>{a}</option>)}
                </select>
              </Field>
            </div>
            <div className="flex gap-2 px-5 py-4 border-t" style={{ borderColor: "#30363d" }}>
              <button
                onClick={() => setShowNewLead(false)}
                className="flex-1 py-2 rounded-md text-sm"
                style={{ background: "#21262d", color: "#8b949e", border: "1px solid #30363d" }}
              >
                Cancel
              </button>
              <button
                onClick={createLead}
                disabled={saving || !newLead["Lead Name"]}
                className="flex-1 py-2 rounded-md text-sm font-medium"
                style={{
                  background: saving || !newLead["Lead Name"] ? "#21262d" : "#238636",
                  color: saving || !newLead["Lead Name"] ? "#484f58" : "#fff",
                  border: "1px solid #30363d",
                }}
              >
                {saving ? "Saving…" : "Add Lead"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
