"use client";
import { useEffect, useState } from "react";

type MonthRow = { month: string; loan_count: number; avg_loan: number; total_loan: number };
type HotLead = { id: string; fields: Record<string, unknown> };

function fmtMoney(n: number) {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  return `$${(n / 1_000).toFixed(0)}K`;
}

function fmtMonth(ym: string) {
  const [y, m] = ym.split("-");
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

function isUpcoming(ym: string) {
  const now = new Date();
  const [y, m] = ym.split("-").map(Number);
  const rowDate = new Date(y, m - 1, 1);
  const cutoff = new Date(now.getFullYear(), now.getMonth() + 18, 1);
  return rowDate >= new Date(now.getFullYear(), now.getMonth(), 1) && rowDate <= cutoff;
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg p-4" style={{ background: "#0d1117", border: "1px solid #21262d" }}>
      <div className="text-xs font-medium mb-1" style={{ color: "#8b949e" }}>{label}</div>
      <div className="text-2xl font-semibold font-mono" style={{ color: "#e6edf3" }}>{value}</div>
      {sub && <div className="text-xs mt-1" style={{ color: "#484f58" }}>{sub}</div>}
    </div>
  );
}

function MaturityChart() {
  const [rows, setRows] = useState<MonthRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    fetch("/api/pipeline-by-month")
      .then((r) => r.json())
      .then((d) => { setRows(Array.isArray(d) ? d : []); setLoading(false); });
  }, []);

  const upcoming = rows.filter((r) => isUpcoming(r.month));
  const displayed = showAll ? rows : upcoming;
  const peak = displayed.reduce((mx, r) => Math.max(mx, r.loan_count), 0);
  const totalUpcoming = upcoming.reduce((s, r) => s + r.loan_count, 0);
  const totalVolumeUpcoming = upcoming.reduce((s, r) => s + r.total_loan, 0);
  const peakRow = upcoming.length > 0 ? upcoming.reduce((mx, r) => r.loan_count > mx.loan_count ? r : mx, upcoming[0]) : null;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-sm font-semibold" style={{ color: "#e6edf3" }}>Loans Maturing by Month</h2>
          <p className="text-xs mt-0.5" style={{ color: "#8b949e" }}>
            Qualified loans · {showAll ? "all time" : "next 18 months"}
          </p>
        </div>
        <button onClick={() => setShowAll((v) => !v)} className="text-xs px-2.5 py-1 rounded"
          style={{ background: "#21262d", color: "#8b949e", border: "1px solid #30363d" }}>
          {showAll ? "Show upcoming" : "Show all time"}
        </button>
      </div>
      {!showAll && upcoming.length > 0 && (
        <div className="grid grid-cols-3 gap-3 mb-6">
          <StatCard label="Loans next 18 mo" value={totalUpcoming.toLocaleString()} sub="passing all filters" />
          <StatCard label="Total pipeline volume" value={fmtMoney(totalVolumeUpcoming)} sub="combined mortgage value" />
          <StatCard label="Peak month" value={peakRow ? peakRow.loan_count.toLocaleString() : "—"} sub={peakRow ? fmtMonth(peakRow.month) : "—"} />
        </div>
      )}
      {loading ? (
        <div className="py-12 text-center text-sm" style={{ color: "#484f58" }}>Loading…</div>
      ) : displayed.length === 0 ? (
        <div className="py-12 text-center text-sm" style={{ color: "#484f58" }}>
          {showAll ? "No data found" : "No loans maturing in the next 18 months"}
        </div>
      ) : (
        <div className="space-y-1.5">
          {displayed.map((row) => {
            const pct = peak > 0 ? Math.round((row.loan_count / peak) * 100) : 0;
            const now = new Date();
            const [y, m] = row.month.split("-").map(Number);
            const isCurrentMonth = y === now.getFullYear() && m === now.getMonth() + 1;
            const isPast = new Date(y, m - 1, 1) < new Date(now.getFullYear(), now.getMonth(), 1);
            return (
              <div key={row.month} className="flex items-center gap-3">
                <span className="text-xs font-mono w-20 shrink-0"
                  style={{ color: isCurrentMonth ? "#e3b341" : isPast ? "#484f58" : "#8b949e" }}>
                  {fmtMonth(row.month)}
                </span>
                <div className="flex-1 rounded-full overflow-hidden" style={{ background: "#21262d", height: 8 }}>
                  <div className="h-full rounded-full" style={{
                    width: `${pct}%`,
                    background: isCurrentMonth ? "#e3b341" : isPast ? "#484f58" : "#1f6feb",
                    transition: "width 0.3s ease",
                  }} />
                </div>
                <span className="text-xs font-mono w-12 text-right shrink-0" style={{ color: "#e6edf3" }}>
                  {row.loan_count.toLocaleString()}
                </span>
                <span className="text-xs w-20 text-right shrink-0" style={{ color: "#484f58" }}>
                  {fmtMoney(row.total_loan)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function HotLeadsSummary() {
  const [leads, setLeads] = useState<HotLead[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/hot-leads")
      .then((r) => r.json())
      .then((d) => { setLeads(Array.isArray(d) ? d : []); setLoading(false); });
  }, []);

  const byStage: Record<string, number> = {};
  leads.forEach((l) => {
    const stage = String(l.fields["Stage"] ?? l.fields["Status"] ?? "Unknown");
    byStage[stage] = (byStage[stage] ?? 0) + 1;
  });
  const stages = Object.entries(byStage).sort((a, b) => b[1] - a[1]);

  return (
    <div>
      <h2 className="text-sm font-semibold mb-1" style={{ color: "#e6edf3" }}>Hot Leads</h2>
      <p className="text-xs mb-4" style={{ color: "#8b949e" }}>Active records in Airtable</p>
      {loading ? (
        <div className="text-sm py-4 text-center" style={{ color: "#484f58" }}>Loading…</div>
      ) : (
        <>
          <div className="mb-4">
            <StatCard label="Total hot leads" value={leads.length.toLocaleString()} />
          </div>
          {stages.length > 0 && (
            <div className="space-y-1.5">
              {stages.map(([stage, count]) => (
                <div key={stage} className="flex items-center justify-between text-xs">
                  <span style={{ color: "#8b949e" }}>{stage}</span>
                  <span className="font-mono" style={{ color: "#e6edf3" }}>{count}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function AnalyticsClient() {
  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <div className="mb-8">
        <h1 className="text-xl font-semibold mb-1" style={{ color: "#e6edf3" }}>Analytics</h1>
        <p className="text-sm" style={{ color: "#8b949e" }}>Pipeline health, lead activity, and outreach metrics.</p>
      </div>
      <div className="rounded-lg p-6 mb-6" style={{ background: "#161b22", border: "1px solid #21262d" }}>
        <MaturityChart />
      </div>
      <div className="grid grid-cols-2 gap-6">
        <div className="rounded-lg p-6" style={{ background: "#161b22", border: "1px solid #21262d" }}>
          <HotLeadsSummary />
        </div>
        <div className="rounded-lg p-6" style={{ background: "#161b22", border: "1px solid #21262d" }}>
          <h2 className="text-sm font-semibold mb-1" style={{ color: "#e6edf3" }}>Calls Placed</h2>
          <p className="text-xs mb-4" style={{ color: "#8b949e" }}>Mojo dialer activity</p>
          <div className="rounded p-4 text-xs" style={{ background: "#0d1117", border: "1px solid #21262d", color: "#484f58" }}>
            Mojo does not expose a reporting API. Export a call report from Mojo and upload it here
            to see call metrics — or wire a webhook to push call events into Supabase for live tracking.
          </div>
        </div>
      </div>
    </div>
  );
}
