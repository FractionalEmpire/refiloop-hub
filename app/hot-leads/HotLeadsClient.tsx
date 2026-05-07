"use client";

import { useState, useEffect, useCallback } from "react";



// âââ Types âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ



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



interface HotLoanRecord {

  id: number;

  hot_lead_id: number;

  position: number;

  lien_label?: string;

  lender_name?: string;

  loan_amount?: number;

  interest_rate?: number;

  due_date?: string;

  loan_type?: string;

  notes?: string;

}



interface DbSearchResult {

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

    loan_amount: string | number;

    loan_amount_num: number | null;

    lender_name: string;

    due_date: string;

    interest_rate: string;

    lead_score: number;

  } | null;

  loans: DbSearchResult["loan"][];

}



// âââ Constants ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

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



const LOAN_TYPES = ["Conventional", "SBA", "Seller Note", "Bridge", "CMBS", "Hard Money", "Other"];



function mapsUrl(address?: string) {

  if (!address) return null;

  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;

}



function fmtRate(r?: number) {

  if (!r) return "â";

  return r + "%";

}



const ACTIVITY_ICONS: Record<string, string> = {

  Call: "ð", Email: "âï¸", Text: "ð¬", Meeting: "ð¤", Note: "ð",

};



const ACTIVITY_COLORS: Record<string, string> = {

  Call: "#58a6ff", Email: "#a371f7", Text: "#3fb950", Meeting: "#d29922", Note: "#8b949e",

};



// âââ Helpers ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

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

  if (!n) return "â";

  return "$" + n.toLocaleString();

}



// Legacy Notes JSON â DbActivity-shaped objects for display

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

    ? `I know your balloon note${lender ? ` with ${lender}` : ""} on ${address} is maturing in ${maturity}${amount ? ` â roughly ${amount}` : ""}.`

    : `I wanted to follow up regarding your property at ${address}.`;



  const subject = `Re: Refinancing ${address} â Next Steps`;

  const body = `Hi ${firstName},



Great speaking with you earlier. ${maturityLine}



My team specializes in commercial mortgage refinancing for exactly these situations. We work with 50+ lenders and typically close in 30â60 days, so you'd have a commitment well before the maturity date.



Here's what the next step looks like:

â¢ 15-minute call to review your property's financials

â¢ We pull competing term sheets (no cost, no obligation)

â¢ You pick the best rate and we handle the rest



Are you free for a quick call this week? I can work around your schedule.



Best,

David

RefiLoop Commercial Mortgage

NMLS #2510864

david@refiloop.com`;



  return { subject, body };

}



// âââ Sub-components âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

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

  const label = days <= 0 ? "MATURED" : days < 30 ? `${days}d ð¥` : `${days}d`;

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



// âââ Main Component âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

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



  // Loan stack state

  const [loanStack, setLoanStack] = useState<HotLoanRecord[]>([]);

  const [loansLoading, setLoansLoading] = useState(false);

  const [showAddLoan, setShowAddLoan] = useState(false);

  const [editingLoanId, setEditingLoanId] = useState<number | null>(null);

  const [loanForm, setLoanForm] = useState<Partial<HotLoanRecord>>({

    position: 1, lien_label: "1st Lien", loan_type: "Conventional",

  });



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



  async function fetchLoans(leadId: string) {

    setLoansLoading(true);

    try {

      const res = await fetch(`/api/hot-leads/${leadId}/loans`);

      const data = await res.json();

      setLoanStack(Array.isArray(data) ? data : []);

    } finally {

      setLoansLoading(false);

    }

  }



  async function saveLoan() {

    if (!selected) return;

    setSaving(true);

    if (editingLoanId) {

      const res = await fetch(`/api/hot-leads/${selected.id}/loans/${editingLoanId}`, {

        method: "PATCH",

        headers: { "Content-Type": "application/json" },

        body: JSON.stringify(loanForm),

      });

      if (res.ok) {

        const updated = await res.json();

        setLoanStack((prev) => prev.map((l) => l.id === editingLoanId ? updated : l));

      }

    } else {

      const res = await fetch(`/api/hot-leads/${selected.id}/loans`, {

        method: "POST",

        headers: { "Content-Type": "application/json" },

        body: JSON.stringify(loanForm),

      });

      if (res.ok) {

        const created = await res.json();

        setLoanStack((prev) => [...prev, created].sort((a, b) => a.position - b.position));

      }

    }

    setShowAddLoan(false);

    setEditingLoanId(null);

    setLoanForm({ position: 1, lien_label: "1st Lien", loan_type: "Conventional" });

    setSaving(false);

  }



  async function deleteLoan(loanId: number) {

    if (!selected) return;

    await fetch(`/api/hot-leads/${selected.id}/loans/${loanId}`, { method: "DELETE" });

    setLoanStack((prev) => prev.filter((l) => l.id !== loanId));

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

    fetchActivities(lead.id, lead);

    fetchLoans(lead.id);

    setShowAddLoan(false);

    setEditingLoanId(null);

    setLoanForm({ position: 1, lien_label: "1st Lien", loan_type: "Conventional" });

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

 if (res.ok) {

        const updated = await res.json();

        setLoanStack((prev) => prev.map((l) => l.id === editingLoanId ? updated : l));

      }

    } else {

      const res = await fetch(`/api/hot-leads/${selected.id}/loans`, {

        method: "POST",

        headers: { "Content-Type": "application/json" },

        body: JSON.stringify(loanForm),

      });

      if (res.ok) {

        const created = await res.json();

        setLoanStack((prev) => [...prev, created].sort((a, b) => a.position - b.position));

      }

    }

    setShowAddLoan(false);

    setEditingLoanId(null);

    setLoanForm({ position: 1, lien_label: "1st Lien", loan_type: "Conventional" });

    setSaving(false);

  }



  async function deleteLoan(loanId: number) {

    if (!selected) return;

    await fetch(`/api/hot-leads/${selected.id}/loans/${loanId}`, { method: "DELETE" });

    setLoanStack((prev) => prev.filter((l) => l.id !== loanId));

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

    fetchActivities(lead.id, lead);

    fetchLoans(lead.id);

    setShowAddLoan(false);

    setEditingLoanId(null);

    setLoanForm({ position: 1, lien_label: "1st Lien", loan_type: "Conventional" });

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



  // âââ New Lead Form state ââââââââââââââââââââââââââââââââââââââââââââââââââââ

  const [addMode, setAddMode] = useState<"manual" | "search">("search");

  const [dbQuery, setDbQuery] = useState("");

  const [dbResults, setDbResults] = useState<DbSearchResult[]>([]);

  const [dbSearching, setDbSearching] = useState(false);



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



  // Debounced DB search

  useEffect(() => {

    if (!showNewLead || addMode !== "search" || dbQuery.length < 2) {

      setDbResults([]);

      return;

    }

    setDbSearching(true);

    const t = setTimeout(async () => {

      try {

        const res = await fetch(`/api/hot-leads/search?q=${encodeURIComponent(dbQuery)}`);

        const data = await res.json();

        setDbResults(Array.isArray(data) ? data : []);

      } finally {

        setDbSearching(false);

      }

    }, 350);

    return () => clearTimeout(t);

  }, [dbQuery, addMode, showNewLead]);



  async function addFromSearch(result: DbSearchResult) {

    setSaving(true);

    const loan = result.loan;

    const phone = result.phones[0] ?? null;

    const addrParts = loan

      ? [loan.property_address, loan.property_city, loan.property_state, loan.property_zip].filter(Boolean)

      : [];

    const row: Record<string, unknown> = {

      name: result.name,

      phone,

      owner_id: result.owner_id,

      status: "New",

      next_action: "Callback",

      assigned_to: user === "david" ? "David" : "Gorjan",

      last_contact: new Date().toISOString().split("T")[0],

      added_by: "search",

    };

    if (loan) {

      row.loan_id = loan.loan_id;

      row.capitalize_loan_id = loan.capitalize_loan_id;

      row.property_address = loan.property_address;

      row.property_city = loan.property_city;

      row.property_state = loan.property_state;

      row.property_zip = loan.property_zip;

      row.property_type = loan.property_type;

      row.loan_amount_num = loan.loan_amount_num;

      row.loan_amount = loan.loan_amount ? `$${Number(loan.loan_amount_num ?? loan.loan_amount).toLocaleString()}` : null;

      row.due_date = loan.due_date ?? null;

      row.lender_name = loan.lender_name ?? null;

    }

    await fetch("/api/hot-leads", {

      method: "POST",

      headers: { "Content-Type": "application/json" },

      body: JSON.stringify(row),

    });

    await load();

    setShowNewLead(false);

    setDbQgery("");

    setDbResults([]);

    setSaving(false);

    void addrParts; // suppress unused var warning

  }



  // âââ Render ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

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

                {syncing ? "Syncingâ¦" : "â» Inbox"}

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

            <div className="flex items-center justify-center h-40" style={{ color: "#8b949e" }}>Loadingâ¦</div>

          ) : filtered.length === 0 ? (

            <div className="flex flex-col items-center justify-center h-40 gap-2" style={{ color: "#8b949e" }}>

              <span className="text-2xl">ð­</span>

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

                      <div className="text-xs mb-1.5 flex items-center gap-2 flex-wrap" style={{ color: "#8b949e" }}>

                        <span>ð {f["Property Address"] ?? "â"}</span>

                        {f["Property Type"] && <span className="px-1.5 ssName="flex-1 overflow-y-auto">

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

                      : "â"}

                  </div>

                </div>

                <div className="rounded-md p-3" style={{ background: "#161b22", border: "1px solid #21262d" }}>

                  <div className="text-xs mb-1" style={{ color: "#484f58" }}>LENDER</div>

                  <div className="text-sm font-medium" style={{ color: "#e6edf3" }}>{(editFields["Lender Name"] as string) || "â"}</div>

                </div>

                <div className="rounded-md p-3" style={{ background: "#161b22", border: "1px solid #21262d" }}>

                  <div className="text-xs mb-1" style={{ color: "#484f58" }}>

                    {connectedVia ? `CONNECTED VIA ${connectedVia.toUpperCase()}` : "CONTACT"}

                  </div>

                  <div className="text-sm font-medium" style={{ color: connectedVia ? "#3fb950" : "#484f58" }}>

                    {connectedContact || (connectedVia ? "â" : "Not set")}

                  </div>

                </div>

              </div>



              {/* Maps link in detail panel */}

              {selected.fields["Property Address"] && (

                <a

                  href={mapsUrl(selected.fields["Property Address"]) ?? "#"}

                  target="_blank"

                  rel="noopener noreferrer"

                  className="flex items-center gap-2 rounded-md p-3 text-sm transition-colors"

                  style={{ background: "#161b22", border: "1px solid #21262d", color: "#58a6ff", textDecoration: "none" }}

                  onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#1f6feb")}

                  onMouseLeave={(e) => (e.currentTarget.style.borderColor = "#21262d")}

                >

                  ðºï¸ <span style={{ fontSize: 12 }}>View on Google Maps</span>

                  <span className="ml-auto text-xs" style={{ color: "#484f58" }}>â</span>

                </a>

              )}



              {/* Loan Stack */}

              <div>

                <div className="flex items-center justify-between mb-2">

                  <div className="text-xs font-medium" style={{ color: "#484f58" }}>LOAN STACK</div>

                  <button

                    onClick={() => { setShowAddLoan(true); setEditingLoanId(null); setLoanForm({ position: (loanStack.length + 1), lien_label: `${loanStack.length + 1 === 1 ? "1st" : loanStack.length + 1 === 2 ? "2nd" : "3rd"} Lien`, loan_type: "Conventional" }); }}

                    className="text-xs px-2 py-1 rounded"

                    style={{ background: "#1f6feb20", color: "#58a6ff", border: "1px solid #1f6feb40" }}

                  >

                    + Add Loan

                  </button>

                </div>



                {loansLoading ? (

                  <div className="text-xs py-3 text-center" style={{ color: "#484f58" }}>Loadingâ¦</div>

                ) : loanStack.length === 0 ? (

                  <div className="text-xs py-3 text-center rounded-md" style={{ color: "#484f58", background: "#161b22", border: "1px solid #21262d" }}>

                    No loans added yet â click + Add Loan

                  </div>

                ) : (

                  <div className="space-y-2">

                    {loanStack.map((loan) => {

                      const days = loan.due_date ? daysUntil(loan.due_date) : null;

                      return (

                        <div key={loan.id} className="rounded-md p-3" style={{ background: "#161b22", border: "1px solid #21262d" }}>

                          <div className="flex items-start justify-between gap-2">

                            <div className="flex-1 min-w-0">

                              <div className="flex items-center gap-2 flex-wrap mb-1">

                                <span className="text-xs font-semibold" style={{ color: "#e6edf3" }}>

                                  {loan.lien_label || `Position ${loan.position}`}

                                </span>

                                {loan.loan_type && (

                                  <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: "#21262d", color: "#8b949e" }}>{loan.loan_type}</span>

                                )}

                                {days !== null && <UrgencyPill days={days} />}

                              </div>

                              <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs" style={{ color: "#8b949e" }}>

                                {loan.lender_name && <span>ð¦ {loan.lender_name}</span>}

                                {loan.loan_amount && <span>ð° {fmt(loan.loan_amount)}</span>}

                                {loan.interest_rate && <span>ð {fmtRate(loan.interest_rate)}</span>}

                                {loan.due_date && <span>ð {new Date(loan.due_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>}

                              </div>

                              {loan.notes && <div className="text-xs mt-1" style={{ color: "#484f58" }}>{loan.notes}</div>}

                            </div>

                            <div className="flex gap-1 shrink-0">

                              <button

                                onClick={() => { setEditingLoanId(loan.id); setLoanForm({ ...loan }); setShowAddLoan(true); }}

                                className="text-xs px-2 py-1 rounded"

                                style={{ color: "#8b949e", border: "1px solid #30363d", background: "#0d1117" }}

                              >

                                âï¸

                              </button>

                              <button

                                onClick={() => deleteLoan(loan.id)}

                                className="text-xs px-2 py-1 rounded"

                                style={{ color: "#f85149", border: "1px solid #30363d", background: "#0d1117" }}

                              >

                                â

                              </button>

                            </div>

                          </div>

                        </div>

                      );

                    })}



                    {/* Blended rate summary */}

                    {loanStack.filter(l => l.loan_amount && l.interest_rate).length > 1 && (() => {

                      const withRates = loanStack.filter(l => l.loan_amount && l.interest_rate);

                      const totalAmt = withRates.reduce((s, l) => s + (l.loan_amount ?? 0), 0);

                      const weightedInt = withRates.reduce((s, l) => s + (l.loan_amount ?? 0) * (l.interest_rate ?? 0), 0);

                      const blended = totalAmt > 0 ? (weightedInt / totalAmt).toFixed(2) : null;

                      return blended ? (

                        <div className="rounded-md p-2 flex justify-between text-xs" style={{ background: "#0d1117", border: "1px solid #30363d" }}>

                          <span style={{ color: "#484f58" }}>Total stack: {fmt(totalAmt)}</span>

                          <span style={{ color: "#d29922" }}>Blended rate: {blended}%</span>

                        </div>

                      ) : null;

                    })()}

                  </div>

                )}



                {/* Add / Edit loan form */}

                {showAddLoan && (

                  <div className="mt-3 rounded-md p-3 space-y-2" style={{ background: "#0d1117", border: "1px solid #1f6feb40" }}>

                    <div className="text-xs font-medium" style={{ color: "#58a6ff" }}>

                      {editingLoanId ? "EDIT LOAN" : "ADD LOAN"}

                    </div>

                    <div className="grid grid-cols-2 gap-2">

                      <div>

                        <label className="block text-xs mb-1" style={{ color: "#484f58" }}>POSITION</label>

                        <input type="number" min={1} max={10}

                          value={loanForm.position ?? ""}

                          onChange={(e) => setLoanForm((p) => ({ ...p, position: Number(e.target.value) }))}

                          className="w-full rounded px-2 py-1.5 text-sm"

                          style={{ background: "#161b22", color: "#e6edf3", border: "1px solid #30363d" }}

                        />

                      </div>

                      <div>

                        <label className="block text-xs mb-1" style={{ color: "#484f58" }}>LABEL</label>

                        <input type="text"

                          value={loanForm.lien_label ?? ""}

                          onChange={(e) => setLoanForm((p) => ({ ...p, lien_label: e.target.value }))}

                          placeholder="e.g. 1st Lien"

                          className="w-full rounded px-2 py-1.5 text-sm"

                          style={{ background: "#161b22", color: "#e6edf3", border: "1px solid #30363d" }}

                        />

                      </div>

                    </div>

                    <div>

                      <label className="block text-xs mb-1" style={{ color: "#484f58" }}>LENDER</label>

                      <input type="text"

                        value={loanForm.lender_name ?? ""}

                        onChange={(e) => setLoanForm((p) => ({ ...p, lender_name: e.target.value }))}

                        placeholder="e.g. FAY Properties LLC"

                        className="w-full rounded px-2 py-1.5 text-sm"

                        style={{ background: "#161b22", color: "#e6edf3", border: "1px solid #30363d" }}

                      />

                    </div>

                    <div className="grid grid-cols-2 gap-2">

                      <div>

                        <label className="block text-xs mb-1" style={{ color: "#484f58" }}>AMOUNT ($)</label>

                        <input type="number"

                          value={loanForm.loan_amount ?? ""}

                          onChange={(e) => setLoanForm((p) => ({ ...p, loan_amount: Number(e.target.value) }))}

                          placeholder="5000000"

                          className="w-full rounded px-2 py-1.5 text-sm"

                          style={{ background: "#161b22", color: "#e6edf3", border: "1px solid #30363d" }}

                        />

                      </div>

                      <div>

                        <label className="block text-xs mb-1" style={{ color: "#484f58" }}>RATE (%)</label>

                        <input type="number" step="0.01"

                          value={loanForm.interest_rate ?? ""}

                          onChange={(e) => setLoanForm((p) => ({ ...p, interest_rate: Number(e.target.value) }))}

                          placeholder="8.9"

                          className="w-full rounded px-2 py-1.5 text-sm"

                          style={{ background: "#161b22", color: "#e6edf3", border: "1px solid #30363d" }}

                        />

                      </div>

                    </div>

                    <div className="grid grid-cols-2 gap-2">

                      <div>

                        <label className="block text-xs mb-1" style={{ color: "#484f58" }}>MATURITY DATE</label>

                        <input type="date"

                          value={loanForm.due_date ?? ""}

                          onChange={(e) => setLoanForm((p) => ({ ...p, due_date: e.target.value }))}

                          className="w-full rounded px-2 py-1.5 text-sm"

                          style={{ background: "#161b22", color: "#e6edf3", border: "1px solid #30363d" }}

                        />

                      </div>

                      <div>

                        <label className="block text-xs mb-1" style={{ color: "#484f58" }}>LOAN TYPE</label>

                        <select

                          value={loanForm.loan_type ?? ""}

                          onChange={(e) => setLoanForm((p) => ({ ...p, loan_type: e.target.value }))}

                          className="w-full rounded px-2 py-1.5 text-sm"

                          style={{ background: "#161b22", color: "#e6edf3", border: "1px solid #30363d" }}

                        >

                          <option value="">â</option>

                          {LOAN_TYPES.map((t) => <option key={t}>{t}</option>)}

                        </select>

                      </div>

                    </div>

                    <div>

                      <label className="block text-xs mb-1" style={{ color: "#484f58" }}>NOTES</label>

                      <input type="text"

                        value={loanForm.notes ?? ""}

                        onChange={(e) => setLoanForm((p) => ({ ...p, notes: e.target.value }))}

                        placeholder="e.g. ~1% prepay penalty, can be subordinated"

                        className="w-full rounded px-2 py-1.5 text-sm"

                        style={{ background: "#161b22", color: "#e6edf3", border: "1px solid #30363d" }}

                      />

                    </div>

                    <div className="flex gap-2">

                      <button

                        onClick={() => { setShowAddLoan(false); setEditingLoanId(null); }}

                        className="flex-1 py-1.5 rounded text-sm"

                        style={{ background: "#21262d", color: "#8b949e", border: "1px solid #30363d" }}

                      >

                        Cancel

                      </button>

                      <button

                        onClick={saveLoan}

                        disabled={saving}

                        className="flex-1 py-1.5 rounded text-sm font-medium"

                        style={{ background: saving ? "#21262d" : "#1f6feb", color: saving ? "#484f58" : "#fff", border: "1px solid #30363d" }}

                      >

                        {saving ? "Savingâ¦" : editingLoanId ? "Save Changes" : "Add Loan"}

                      </button>

                    </div>

                  </div>

                )}

              </div>



              {/* Other Loans */}

              {relatedLoans.length > 0 && (

                <div>

                  <div className="text-xs font-medium mb-2" style={{ color: "#484f58" }}>

                    OTHER LOANS â {selected.fields["Lead Name"]}

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

                                ð {loan.fields["Property Address"] ?? "â"}

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

                      <option value="">â</option>

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

                        {opt === "" ? "None" : opt === "Phone" ? "ð Phone" : "âï¸ Email"}

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

                      <option value="">â</option>

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

                  {saving ? "Savingâ¦" : "Save Changes"}

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

                  âï¸ Email

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

                      âº Reset draft

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

                    {emailSent ? "â Sent!" : sendingEmail ? "Sendingâ¦" : "Send from david@refiloop.com"}

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

                    {syncing ? "Syncingâ¦" : "â» Sync inbox"}

                  </button>

                </div>



                {activitiesLoading ? (

                  <div className="text-xs text-center py-4 mb-4" style={{ color: "#484f58" }}>Loadingâ¦</div>

                ) : activityLog.length === 0 ? (

                  <div className="text-xs text-center py-4 mb-4 rounded-md" style={{ color: "#484f58", background: "#161b22", border: "1px solid #21262d" }}>

                    No activity yet â log the first interaction below.

                  </div>

                ) : (

                  <div className="mb-4" style={{ position: "relative" }}>

                    <div style={{ position: "absolute", left: 15, top: 0, bottom: 0, width: 1, background: "#21262d" }} />

                    <div
