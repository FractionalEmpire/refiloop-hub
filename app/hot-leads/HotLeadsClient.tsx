"use client";
import { useState, useEffect, useCallback } from "react";

// ââ Types ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
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
  };
}

// ââ Constants ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
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

// ââ Helpers ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
function daysUntil(dateStr?: string): number | null {
  if (!dateStr) return null;
  const diff = new Date(dateStr).getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function urgencyColor(days: number | null): string {
  if (days === null) return "#484f58";
  if (days < 60) return "#f85149";
  if (days < 120) return "#d29922";
  return "#3fb950";
}

function fmt(n?: number) {
  if (!n) return "â";
  return "$" + n.toLocaleString();
}

function generateEmailDraft(lead: Lead): string {
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
    ? `I know your balloon note${lender ? ` with ${lender}` : ""} on ${address} is maturing in ${maturity}${amount ? ` â roughly ${amount}` : ""}.`
    : `I wanted to follow up regarding your property at ${address}.`;

  return `Subject: Re: Refinancing ${address} â Next Steps

Hi ${firstName},

Great speaking with you earlier. ${maturityLine}

My team specializes in commercial mortgage refinancing for exactly these situations. We work with 50+ lenders and typically close in 30â60 days, so you'd have a commitment well before the maturity date.

Here's what the next step looks like:
â¢ 15-minute call to review your property's financials
â¢ We pull competing term sheets (no cost, no obligation)
â¢ You pick the best rate and we handle the rest

Are you free for a quick call this week? I can work around your schedule.

Best:
David
RefiLoop Commercial Mortgage
NMLS #2510864
david@refiloop.com`;
}

// ââ Sub-components âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
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

// ââ Main Component âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
export default function HotLeadsClient({ user }: { user: "david" | "gorjan" }) {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Lead | null>(null);
  const [tab, setTab] = useState<"details" | "email" | "log">("details");
  const [statusFilter, setStatusFilter] = useState("all");
  const [saving, setSaving] = useState(false);
  const [emailBody, setEmailBody] = useState("");
  const [copied, setCopied] = useState(false);
  const [showNewLead, setShowNewLead] = useState(false);
  const [callLog, setCallLog] = useState("");

  // edit state for the detail panel
  const [editFields, setEditFields] = useState<Lead["fields"]>({});

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/hot-leads");
    const data = await res.json();
    setLeads(Array.isArray(data) ? data : []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  function openLead(lead: Lead) {
    setSelected(lead);
    setEditFields({ ...lead.fields });
    setEmailBody(generateEmailDraft(lead));
    setTab("details");
    setCallLog("");
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

  async function logCall() {
    if (!selected || !callLog.trim()) return;
    setSaving(true);
    const now = new Date().toISOString().split("T")[0];
    const updates: Lead["fields"] = {
      "Call Summary": callLog,
      "Last Contact": now,
      ...editFields,
    };
    await fetch(`/api/hot-leads/${selected.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    setLeads((prev) =>
      prev.map((l) => (l.id === selected.id ? { ...l, fields: { ...l.fields, ...updates } } : l))
    );
    setSelected((prev) => prev ? { ...prev, fields: { ...prev.fields, ...updates } } : null);
    setEditFields((prev) => ({ ...prev, ...updates }));
    setCallLog("");
    setSaving(false);
  }

  function copyEmail() {
    navigator.clipboard.writeText(emailBody);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const filtered = statusFilter === "all"
    ? leads
    : leads.filter((l) => (l.fields.Status ?? "New") === statusFilter);

  const statusCounts = leads.reduce<Record<string, number>>((acc, l) => {
    const s = l.fields.Status ?? "New";
    acc[s] = (acc[s] ?? 0) + 1;
    return acc;
  }, {});

  // ââ New Lead Form ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
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

  // ââ Render âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
  return (
    <div className="flex h-full" style={{ color: "#e6edf3" }}>

      {/* ââ Left: Lead List ââ */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b" style={{ borderColor: "#30363d" }}>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-xl font-semibold" style={{ color: "#e6edf3" }}>Hot Leads</h1>
              <p className="text-sm mt-0.5" style={{ color: "#8b949e" }}>
                {leads.length} leads â¢ {leads.filter(l => {
                  const d = daysUntil(l.fields["Balloon Maturity"]);
                  return d !== null && d < 90;
                }).length} maturing within 90 days
              </p>
            </div>
            <button
              onClick={() => setShowNewLead(true)}
              className="px-3 py-1.5 rounded-md text-sm font-medium transition-colors"
              style={{ background: "#238636", color: "#fff", border: "1px solid #2ea043" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "#2ea043")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "#238636")}
            >
              + New Lead
            </button>
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
              <span className="text-2xl">ð­</span>
              <span className="text-sm">No leads in this status</span>
            </div>
          ) : (
            filtered.map((lead) => {
              const f = lead.fields;
              const days = daysUntil(f["Balloon Maturity"]);
              const isActive = selected?.id === lead.id;
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
                      </div>
                      <div className="text-xs mb-1.5" style={{ color: "#8b949e" }}>
                        ð {f["Property Address"] ?? "â"}
                        {f["Property Type"] && <span className="ml-2 px-1.5 py-0.5 rounded text-xs" style={{ background: "#21262d", color: "#8b949e" }}>{f["Property Type"]}</span>}
                      </div>
                      {f["Call Summary"] && (
                        <div className="text-xs line-clamp-2 mb-1.5" style={{ color: "#8b949e" }}>
                          ð {f["Call Summary"]}
                        </div>
                      )}
                      <div className="flex items-center gap-3 text-xs" style={{ color: "#484f58" }}>
                        {f["Loan Amount"] && <span>ð° {fmt(f["Loan Amount"])}</span>}
                        {f["Next Action"] && (
                          <span className="px-1.5 py-0.5 rounded" style={{ background: "#161b22", color: "#58a6ff" }}>
                            â {f["Next Action"]}
                          </span>
                        )}
                        {f["Last Contact"] && <span>ð {f["Last Contact"]}</span>}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ââ Right: Detail Panel ââ */}
      {selected && (
        <div
          className="flex flex-col border-l overflow-hidden"
          style={{ width: 480, borderColor: "#30363d", background: "#0d1117" }}
        >
          {/* Panel header */}
          <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: "#30363d" }}>
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
              Ã
            </button>
          </div>

          {/* Tabs */}
          <div className="flex border-b" style={{ borderColor: "#30363d" }}>
            {(["details", "email", "log"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className="flex-1 py-2.5 text-xs font-medium capitalize transition-colors"
                style={{
                  color: tab === t ? "#e6edf3" : "#8b949e",
                  borderBottom: tab === t ? "2px solid #58a6ff" : "2px solid transparent",
                }}
              >
                {t === "details" ? "ð Details" : t === "email" ? "âï¸ Email" : "ð Log Call"}
              </button>
            ))}
          </div>

          {/* Panel body */}
          <div className="flex-1 overflow-y-auto">

            {/* ââ Details Tab ââ */}
            {tab === "details" && (
              <div className="p-5 space-y-4">
                {/* Quick stats */}
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: "Loan Amount", value: fmt(editFields["Loan Amount"] as number | undefined) },
                    {
                      label: "Matures",
                      value: editFields["Balloon Maturity"]
                        ? new Date(editFields["Balloon Maturity"]).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                        : "â",
                      accent: urgencyColor(daysUntil(editFields["Balloon Maturity"] as string | undefined)),
                    },
                    { label: "Lender", value: (editFields["Lender Name"] as string) || "â" },
                    { label: "Assigned To", value: (editFields["Assigned To"] as string) || "â" },
                  ].map(({ label, value, accent }) => (
                    <div key={label} className="rounded-md p-3" style={{ background: "#161b22", border: "1px solid #21262d" }}>
                      <div className="text-xs mb-1" style={{ color: "#484f58" }}>{label}</div>
                      <div className="text-sm font-medium" style={{ color: accent ?? "#e6edf3" }}>{value}</div>
                    </div>
                  ))}
                </div>

                {/* Recommended steps */}
                {editFields["Recommended Steps"] && (
                  <div className="rounded-md p-3" style={{ background: "#161b22", border: "1px solid #21262d" }}>
                    <div className="text-xs mb-2" style={{ color: "#484f58" }}>RECOMMENDED STEPS</div>
                    <div className="text-xs whitespace-pre-wrap" style={{ color: "#8b949e" }}>
                      {editFields["Recommended Steps"] as string}
                    </div>
                  </div>
                )}

                {/* Editable fields */}
                <div className="space-y-3">
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

                  <Field label="Callback Date">
                    <input
                      type="date"
                      value={(editFields["Callback Date"] as string) ?? ""}
                      onChange={(e) => setEditFields((p) => ({ ...p, "Callback Date": e.target.value }))}
                      style={{ background: "#161b22", color: "#e6edf3", border: "1px solid #30363d" }}
                      className="w-full rounded px-2 py-1.5 text-sm"
                    />
                  </Field>

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

                  <Field label="Email">
                    <input
                      type="email"
                      value={(editFields.Email as string) ?? ""}
                      onChange={(e) => setEditFields((p) => ({ ...p, Email: e.target.value }))}
                      style={{ background: "#161b22", color: "#e6edf3", border: "1px solid #30363d" }}
                      className="w-full rounded px-2 py-1.5 text-sm"
                      placeholder="borrower@email.com"
                    />
                  </Field>

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

                  <Field label="Notes">
                    <textarea
                      rows={3}
                      value={(editFields.Notes as string) ?? ""}
                      onChange={(e) => setEditFields((p) => ({ ...p, Notes: e.target.value }))}
                      style={{ background: "#161b22", color: "#e6edf3", border: "1px solid #30363d", resize: "vertical" }}
                      className="w-full rounded px-2 py-1.5 text-sm"
                      placeholder="Free-form notesâ¦"
                    />
                  </Field>
                </div>

                <button
                  onClick={saveFields}
                  disabled={saving}
                  className="w-full py-2 rounded-md text-sm font-medium transition-colors"
                  style={{
                    background: saving ? "#21262d" : "#1f6feb",
                    color: saving ? "#484f58" : "#fff",
                    border: "1px solid #30363d",
                  }}
                >
                  {saving ? "Savingâ¦" : "Save Changes"}
                </button>
              </div>
            )}

            {/* ââ Email Tab ââ */}
            {tab === "email" && (
              <div className="p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium" style={{ color: "#484f58" }}>FOLLOW-UP EMAIL DRAFT</span>
                  <button
                    onClick={() => setEmailBody(generateEmailDraft(selected))}
                    className="text-xs px-2 py-1 rounded transition-colors"
                    style={{ color: "#8b949e", border: "1px solid #30363d", background: "#161b22" }}
                  >
                    âº Regenerate
                  </button>
                </div>

                <textarea
                  rows={20}
                  value={emailBody}
                  onChange={(e) => setEmailBody(e.target.value)}
                  className="w-full rounded-md p-3 text-xs font-mono"
                  style={{
                    background: "#161b22",
                    color: "#e6edf3",
                    border: "1px solid #30363d",
                    resize: "vertical",
                    lineHeight: 1.6,
                  }}
                />

                <div className="flex gap-2">
                  <button
                    onClick={copyEmail}
                    className="flex-1 py-2 rounded-md text-sm font-medium transition-colors"
                    style={{
                      background: copied ? "#238636" : "#1f6feb",
                      color: "#fff",
                      border: "1px solid #30363d",
                    }}
                  >
                    {copied ? "â Copied!" : "Copy to Clipboard"}
                  </button>
                  {selected.fields.Email && (
                    <a
                      href={`mailto:${selected.fields.Email}?subject=Refinancing%20${encodeURIComponent(selected.fields["Property Address"] ?? "")}&body=${encodeURIComponent(emailBody)}`}
                      className="flex-1 py-2 rounded-md text-sm font-medium text-center transition-colors"
                      style={{ background: "#161b22", color: "#8b949e", border: "1px solid #30363d" }}
                    >
                      Open in Mail App
                    </a>
                  )}
                </div>

                <p className="text-xs" style={{ color: "#484f58" }}>
                  Tip: Edit the draft above before sending. The template pulls from call summary and loan details.
                </p>
              </div>
            )}

            {/* ââ Log Call Tab ââ */}
            {tab === "log" && (
              <div className="p-5 space-y-4">
                {/* Previous call summary */}
                {selected.fields["Call Summary"] && (
                  <div className="rounded-md p-3" style={{ background: "#161b22", border: "1px solid #21262d" }}>
                    <div className="text-xs mb-2" style={{ color: "#484f58" }}>LAST CALL SUMMARY</div>
                    <div className="text-xs" style={{ color: "#8b949e" }}>{selected.fields["Call Summary"]}</div>
                    {selected.fields["Last Contact"] && (
                      <div className="text-xs mt-2" style={{ color: "#484f58" }}>
                        ð {selected.fields["Last Contact"]}
                      </div>
                    )}
                  </div>
                )}

                <Field label="New Call Notes">
                  <textarea
                    rows={6}
                    value={callLog}
                    onChange={(e) => setCallLog(e.target.value)}
                    style={{ background: "#161b22", color: "#e6edf3", border: "1px solid #30363d", resize: "vertical" }}
                    className="w-full rounded px-2 py-1.5 text-sm"
                    placeholder="What happened on this call? Tone, objections, interest level, what they saidâ¦"
                  />
                </Field>

                <Field label="Update Status">
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

                <Field label="Schedule Callback">
                  <input
                    type="datetime-local"
                    value={(editFields["Callback Date"] as string) ?? ""}
                    onChange={(e) => setEditFields((p) => ({ ...p, "Callback Date": e.target.value }))}
                    style={{ background: "#161b22", color: "#e6edf3", border: "1px solid #30363d" }}
                    className="w-full rounded px-2 py-1.5 text-sm"
                  />
                </Field>

                <button
                  onClick={logCall}
                  disabled={saving || !callLog.trim()}
                  className="w-full py-2 rounded-md text-sm font-medium transition-colors"
                  style={{
                    background: saving || !callLog.trim() ? "#21262d" : "#238636",
                    color: saving || !callLog.trim() ? "#484f58" : "#fff",
                    border: "1px solid #30363d",
                  }}
                >
                  {saving ? "Savingâ¦" : "Log Call & Save"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ââ New Lead Modal ââ */}
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
              <button onClick={() => setShowNewLead(false)} style={{ color: "#484f58" }}>Ã</button>
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
                  <option value="">â</option>
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
                {saving ? "Savingâ¦" : "Add Lead"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ââ Helper component âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
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
