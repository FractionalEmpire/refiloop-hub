import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";

export default async function ContextPage() {
  const user = getCurrentUser();
  if (!user) redirect("/login");
  return (
    <AppShell user={user}>
      <ContextContent user={user} />
    </AppShell>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border mb-5" style={{ background: "#161b22", borderColor: "#30363d" }}>
      <div className="px-6 py-4 border-b" style={{ borderColor: "#30363d" }}>
        <h2 className="text-sm font-semibold" style={{ color: "#e6edf3" }}>{title}</h2>
      </div>
      <div className="px-6 py-5">{children}</div>
    </div>
  );
}

function Row({ label, value, href }: { label: string; value: string; href?: string }) {
  return (
    <div className="flex items-start gap-4 py-2 border-b last:border-b-0" style={{ borderColor: "#21262d" }}>
      <span className="text-xs w-36 shrink-0" style={{ color: "#8b949e" }}>{label}</span>
      {href ? (
        <a href={href} target="_blank" rel="noopener noreferrer" className="text-xs" style={{ color: "#58a6ff" }}>
          {value}
        </a>
      ) : (
        <span className="text-xs" style={{ color: "#c9d1d9" }}>{value}</span>
      )}
    </div>
  );
}

function ContextContent({ user }: { user: "david" | "gorjan" }) {
  return (
    <div className="p-8 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-xl font-semibold" style={{ color: "#e6edf3" }}>Business Context</h1>
        <p className="text-sm mt-1" style={{ color: "#8b949e" }}>
          Everything Gorjan needs to get up to speed on RefiLoop
        </p>
      </div>

      {/* What is RefiLoop */}
      <Section title="🏢 What is RefiLoop?">
        <p className="text-sm leading-relaxed mb-3" style={{ color: "#c9d1d9" }}>
          RefiLoop is a commercial mortgage brokerage at{" "}
          <a href="https://refiloop.com" target="_blank" rel="noopener noreferrer" style={{ color: "#58a6ff" }}>refiloop.com</a>.
          We identify commercial property owners whose loans are maturing in the next 60–365 days and
          reach out to offer refinancing services. Our edge is automated skip tracing, outreach, and pipeline management.
        </p>
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-lg p-3" style={{ background: "#0d1117" }}>
            <p className="text-xs font-semibold mb-1" style={{ color: "#e6edf3" }}>NMLS #2510864</p>
            <p className="text-xs" style={{ color: "#8b949e" }}>Licensed in 39 states</p>
          </div>
          <div className="rounded-lg p-3" style={{ background: "#0d1117" }}>
            <p className="text-xs font-semibold mb-1" style={{ color: "#e6edf3" }}>Target Loan Size</p>
            <p className="text-xs" style={{ color: "#8b949e" }}>$200K – $15M commercial</p>
          </div>
          <div className="rounded-lg p-3" style={{ background: "#0d1117" }}>
            <p className="text-xs font-semibold mb-1" style={{ color: "#e6edf3" }}>Excluded States (11)</p>
            <p className="text-xs" style={{ color: "#8b949e" }}>CA, NY, NJ, MN, AZ, NV, IL, MA, CT, OR, WA</p>
          </div>
          <div className="rounded-lg p-3" style={{ background: "#0d1117" }}>
            <p className="text-xs font-semibold mb-1" style={{ color: "#e6edf3" }}>Priority States</p>
            <p className="text-xs" style={{ color: "#8b949e" }}>FL, TX, GA, NC, OH</p>
          </div>
        </div>
      </Section>

      {/* Team */}
      <Section title="👥 Team">
        <div className="space-y-3">
          {[
            { name: "David", role: "Founder / Principal Broker", email: "david@texastax.loan", color: "#58a6ff" },
            { name: "Gorjan", role: "Backend Engineer", email: "gorjan@texastax.loan", color: "#3fb950" },
            { name: "Matt", role: "Senior Broker (T2/T3 deals)", email: "—", color: "#d29922" },
            { name: "Keith", role: "Operations Coordinator", email: "—", color: "#db6d28" },
            { name: "Kirk Teru", role: "Caller (outbound dialing)", email: "—", color: "#d29922" },
            { name: "Lynn", role: "Admin / EA", email: "—", color: "#8b949e" },
          ].map((m) => (
            <div key={m.name} className="flex items-center gap-3">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                style={{ background: `${m.color}20`, color: m.color, border: `1px solid ${m.color}40` }}
              >
                {m.name[0]}
              </div>
              <div>
                <p className="text-sm font-medium" style={{ color: "#e6edf3" }}>{m.name}</p>
                <p className="text-xs" style={{ color: "#8b949e" }}>{m.role}{m.email !== "—" ? ` · ${m.email}` : ""}</p>
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* Tech Stack */}
      <Section title="⚙️ Tech Stack">
        <div className="space-y-0">
          {[
            { layer: "Backend / DB", tool: "Supabase", href: "https://supabase.com/dashboard/project/dxvanitpqvvxvroywdml" },
            { layer: "Skip Trace UI", tool: "skip-trace-ui.vercel.app", href: "https://skip-trace-ui.vercel.app/skip-trace" },
            { layer: "Collab Hub", tool: "refiloop-hub.vercel.app", href: "https://refiloop-hub.vercel.app" },
            { layer: "Code Repo", tool: "FractionalEmpire/refiloop-config", href: "https://github.com/FractionalEmpire/refiloop-config" },
            { layer: "WordPress", tool: "Porkbun magic login → refiloop.com/wp-admin" },
            { layer: "DNS", tool: "Cloudflare" },
            { layer: "CRM", tool: "Airtable" },
            { layer: "Dialer", tool: "Mojo Dialer (account 493218)" },
            { layer: "Outreach Email", tool: "Google Workspace + Instantly.ai warmup" },
            { layer: "VPS", tool: "Hostinger · SSH root@2.24.197.63" },
            { layer: "VPN", tool: "Nordlayer (required for IDI API)" },
            { layer: "Secrets", tool: "1Password (Clawd vault)" },
            { layer: "Skip Trace API", tool: "IDI (Investigations Data Inc)" },
            { layer: "Lead Prospecting", tool: "Capitalize.io (maturing CRE loans)" },
          ].map((r) => (
            <Row key={r.layer} label={r.layer} value={r.tool} href={r.href} />
          ))}
        </div>
      </Section>

      {/* How the Pipeline Works */}
      <Section title="🔄 How the Pipeline Works">
        <ol className="space-y-3">
          {[
            "Capitalize.io surfaces commercial loans maturing in 60–365 days. Filters: $500K–$10M, Refinance purpose only, excluded states blocked.",
            "Records are stored in Supabase (owners, owner_phones, owner_emails, owner_addresses tables).",
            "IDI API skip traces each owner to find phone numbers and emails. Cron runs every 2h, 200 records/run (target: 300/day hard cap).",
            "Successfully skip-traced records are pushed into Mojo Dialer for outreach calls by Kirk.",
            "Call outcomes (call-backs, interested, not interested, DNC) sync back to Supabase.",
            "Interested leads move into the Airtable CRM pipeline (Hot Leads → Pipeline Jobs).",
            "Phase 2: cold email outreach via burner domains for non-phone contacts.",
          ].map((step, i) => (
            <li key={i} className="flex gap-3">
              <span
                className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5"
                style={{ background: "#1f6feb20", color: "#58a6ff", border: "1px solid #1f6feb40" }}
              >
                {i + 1}
              </span>
              <p className="text-sm leading-relaxed" style={{ color: "#c9d1d9" }}>{step}</p>
            </li>
          ))}
        </ol>
      </Section>

      {/* Deal Tiers */}
      <Section title="💰 Deal Tiers & Fees">
        <div className="space-y-0">
          <Row label="T1: $200K–$3M" value="David solo · 0.75–1.5% broker fee" />
          <Row label="T2: $3M–$10M" value="David + Matt · 50/50 split" />
          <Row label="T3: $10M–$15M" value="Matt-led" />
          <Row label="Year 1 target" value="$50–80K/month revenue" />
        </div>
      </Section>

      {/* Key URLs */}
      <Section title="🔗 Key URLs">
        <div className="space-y-0">
          <Row label="Website" value="refiloop.com" href="https://refiloop.com" />
          <Row label="WP Admin" value="via Porkbun magic login" href="https://refiloop.com/wp-admin" />
          <Row label="Google Drive" value="RefiLoop Drive folder" href="https://drive.google.com/drive/folders/1zIp6RWh8jHvxhyPe7HNlIIBgoT1gNeFa" />
          <Row label="Supabase" value="Project dxvanitpqvvxvroywdml" href="https://supabase.com/dashboard/project/dxvanitpqvvxvroywdml" />
          <Row label="GitHub" value="FractionalEmpire/refiloop-config" href="https://github.com/FractionalEmpire/refiloop-config" />
          <Row label="Skip Trace UI" value="skip-trace-ui.vercel.app/skip-trace" href="https://skip-trace-ui.vercel.app/skip-trace" />
        </div>
      </Section>

      {/* Gorjan Access Checklist */}
      <Section title="✅ Gorjan&apos;s Access Checklist">
        <p className="text-xs mb-4" style={{ color: "#8b949e" }}>
          David is handling these. Once access is granted, update the dashboard checklist.
        </p>
        <div className="space-y-2">
          {[
            { item: "texastax.loan email created (gorjan@texastax.loan)", note: "Required for all invites" },
            { item: "Supabase — project dxvanitpqvvxvroywdml", note: "Full access to DB, Edge Functions, logs" },
            { item: "Vercel — refiloop-hub + skip-trace-ui projects", note: "Deploy, env vars, logs" },
            { item: "GitHub — FractionalEmpire org", note: "Push/pull refiloop-config repo" },
            { item: "Hostinger VPS — SSH root@2.24.197.63", note: "VPS management, cron, services" },
            { item: "1Password — Clawd vault", note: "All credentials for integrations" },
            { item: "Nordlayer VPN", note: "Required to hit IDI API" },
            { item: "Mojo Dialer — account 493218", note: "Lead sheet management" },
          ].map((a) => (
            <div key={a.item} className="flex items-start gap-2.5">
              <div className="w-4 h-4 rounded border mt-0.5 shrink-0" style={{ borderColor: "#30363d" }} />
              <div>
                <p className="text-xs" style={{ color: "#c9d1d9" }}>{a.item}</p>
                <p className="text-xs" style={{ color: "#484f58" }}>{a.note}</p>
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* How we collaborate */}
      <Section title="🔀 How We Collaborate">
        <div className="space-y-3">
          {[
            { icon: "📋", title: "Tasks Board", desc: "All work is tracked in the Tasks tab. David creates tasks for Gorjan; Gorjan ticks them off when done. Use P0/P1/P2 to prioritize." },
            { icon: "📝", title: "EOD Updates", desc: "Gorjan posts an EOD each day summarizing what shipped and any blockers. David reviews and responds." },
            { icon: "🔀", title: "Git Relay", desc: "David builds features in Claude Code/Cowork and pushes to GitHub. Gorjan pulls and continues. The Docs tab shows recent commits." },
            { icon: "📄", title: "Docs", desc: "CLAUDE.md and README live in GitHub. Both can edit them in the Docs tab — changes commit directly to the repo." },
          ].map((c) => (
            <div key={c.title} className="flex gap-3">
              <span className="text-lg mt-0.5">{c.icon}</span>
              <div>
                <p className="text-sm font-medium" style={{ color: "#e6edf3" }}>{c.title}</p>
                <p className="text-xs mt-0.5 leading-relaxed" style={{ color: "#8b949e" }}>{c.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}
