"use client";
import { useEffect, useState } from "react";

interface Lead {
  id: string;
  fields: Record<string, unknown>;
}

export default function HotLeadsClient({ user }: { user: string }) {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/hot-leads")
      .then((r) => r.json())
      .then((data) => { setLeads(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  return (
    <div style={{ padding: 32, color: "#e6edf3", fontFamily: "sans-serif" }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 16 }}>Hot Leads</h1>
      {loading ? (
        <p style={{ color: "#8b949e" }}>Loading…</p>
      ) : leads.length === 0 ? (
        <p style={{ color: "#8b949e" }}>No hot leads found.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {leads.map((lead) => (
            <div
              key={lead.id}
              style={{
                background: "#161b22",
                border: "1px solid #30363d",
                borderRadius: 8,
                padding: "12px 16px",
              }}
            >
              {Object.entries(lead.fields).map(([k, v]) => (
                <div key={k} style={{ fontSize: 13, marginBottom: 4 }}>
                  <span style={{ color: "#8b949e", marginRight: 8 }}>{k}:</span>
                  <span>{String(v ?? "")}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
