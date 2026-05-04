"use client";
import { useState } from "react";

/* ─── Content ─── */

const PROPERTY_TYPES = [
  "Multifamily (5+ units)",
  "Office",
  "Retail",
  "Industrial / Warehouse",
  "Mixed-Use",
  "Hospitality / Hotel",
  "Self-Storage",
] as const;

type PropertyType = (typeof PROPERTY_TYPES)[number];

const RATE_CARDS: Record<
  string,
  { range: string; note: string; bullets: string[]; availableFor?: PropertyType[] }
> = {
  "Bridge Loan": {
    range: "9 – 12%",
    note: "Short-term, interest-only",
    bullets: [
      "6–24 month term, interest-only payments",
      "Best for value-add, quick close, or unstabilized property",
      "Rate varies by LTV and sponsor experience",
      "Exit plan required — refi out or sell",
    ],
  },
  CMBS: {
    range: "6.5 – 8%",
    note: "Fixed, non-recourse",
    bullets: [
      "5–10 year fixed-rate term",
      "Non-recourse — lender can only take the property, not pursue you personally",
      "Best for stabilized, long-hold properties",
      "Heavy prepayment penalties — not ideal if you might sell early",
    ],
  },
  "SBA 504": {
    range: "6 – 7.5%",
    note: "Owner-occupied only",
    bullets: [
      "Borrower must occupy 51%+ of the property",
      "Best rates available for eligible deals",
      "20–25 year term, partially fixed",
      "~90 day timeline — more paperwork but worth it",
    ],
    availableFor: [
      "Office",
      "Retail",
      "Industrial / Warehouse",
      "Mixed-Use",
      "Self-Storage",
    ],
  },
  "Agency Multifamily": {
    range: "6 – 7%",
    note: "Fannie/Freddie, stabilized only",
    bullets: [
      "Fannie Mae / Freddie Mac — best rates in multifamily",
      "5+ unit residential only, 85%+ occupancy required",
      "30-year amortization available",
      "Best for experienced investors with clean, stable assets",
    ],
    availableFor: ["Multifamily (5+ units)"],
  },
  Construction: {
    range: "10 – 13%",
    note: "Ground-up or major renovation",
    bullets: [
      "Floating rate, funds released in draws as work progresses",
      "Converts to permanent financing at completion",
      "Strong track record required from borrower",
      "Highest risk product — plan for a longer process",
    ],
  },
  "Conventional Commercial": {
    range: "7 – 9%",
    note: "Bank / credit union",
    bullets: [
      "Most flexible — terms vary widely by lender",
      "5–25 year term, various amortization options",
      "Full recourse (bank can come after you personally)",
      "Best if you have an existing bank relationship",
    ],
  },
};

const REQUIREMENTS: Record<PropertyType, string[]> = {
  "Multifamily (5+ units)": [
    "Minimum loan: $500,000",
    "LTV: up to 80% (agency) or 65–70% (bridge/conventional)",
    "DSCR: 1.20x+ (agency requires 1.25x)",
    "Occupancy: 85%+ stabilized for best terms",
    "5+ units only — we don't do 1–4 unit residential",
    "Licensed in 39 states — NOT: CA, NY, NJ, MN, AZ, NV, IL, MA, CT, OR, WA",
  ],
  Office: [
    "Minimum loan: $500,000",
    "LTV: 65–70%",
    "DSCR: 1.25x+",
    "Class A/B preferred; class C needs strong tenancy",
    "Multi-tenant preferred; single-tenant OK with investment-grade credit tenant",
    "Licensed in 39 states — NOT: CA, NY, NJ, MN, AZ, NV, IL, MA, CT, OR, WA",
  ],
  Retail: [
    "Minimum loan: $500,000",
    "LTV: 65–70%",
    "DSCR: 1.25x+",
    "Grocery-anchored and strip centers preferred",
    "Avoid enclosed malls and single-tenant with weak tenants",
    "Licensed in 39 states — NOT: CA, NY, NJ, MN, AZ, NV, IL, MA, CT, OR, WA",
  ],
  "Industrial / Warehouse": [
    "Minimum loan: $500,000",
    "LTV: up to 70%",
    "DSCR: 1.20x+",
    "Strong demand — one of the easier asset types to finance right now",
    "Environmental clearance required; clean sites only",
    "Licensed in 39 states — NOT: CA, NY, NJ, MN, AZ, NV, IL, MA, CT, OR, WA",
  ],
  "Mixed-Use": [
    "Minimum loan: $500,000",
    "LTV: 65–70%",
    "DSCR: 1.20x+",
    "Residential + commercial income must be clearly documented",
    "Income blend affects which products are available",
    "Licensed in 39 states — NOT: CA, NY, NJ, MN, AZ, NV, IL, MA, CT, OR, WA",
  ],
  "Hospitality / Hotel": [
    "Minimum loan: $1,000,000 (higher bar for hotels)",
    "LTV: 60–65%",
    "DSCR: 1.30x+ (more scrutiny than other asset types)",
    "Franchise-backed (Marriott, Hilton, IHG, etc.) strongly preferred",
    "Occupancy and RevPAR history required",
    "Licensed in 39 states — NOT: CA, NY, NJ, MN, AZ, NV, IL, MA, CT, OR, WA",
  ],
  "Self-Storage": [
    "Minimum loan: $500,000",
    "LTV: 65–70%",
    "DSCR: 1.20x+",
    "Physical occupancy 80%+ preferred",
    "Climate-controlled facilities get better terms",
    "Licensed in 39 states — NOT: CA, NY, NJ, MN, AZ, NV, IL, MA, CT, OR, WA",
  ],
};

const OBJECTIONS: Record<string, { bullets: string[]; escalate: boolean }> = {
  "I already have a broker": {
    bullets: [
      "Not asking you to switch — just want to make sure you have options",
      "Brokers vary a lot in lender network; we have access to 50+",
      "Most borrowers work with a couple of brokers — no obligation here",
      "Even if you stick with yours, a second quote gives you leverage",
    ],
    escalate: false,
  },
  "I'll just go to my bank": {
    bullets: [
      "Banks are great — but they have one product box to fit your deal into",
      "We shop 50+ lenders and match your deal to the right fit",
      "Especially valuable for non-standard deals, or if your bank says no",
      "No cost to you — lender pays our fee at close",
    ],
    escalate: false,
  },
  "Not looking to refi right now": {
    bullets: [
      "Totally understand — when does your current loan mature?",
      "Most clients start talking 6–12 months before maturity",
      "Even in a high-rate environment, refi can make sense — cash-out, term extension, avoiding a balloon",
      "Takes 15 min to see what's available — no commitment",
    ],
    escalate: false,
  },
  "What's your fee?": {
    bullets: [
      "Zero cost to you — we're paid by the lender at close",
      "No upfront fees, no retainer, no hidden costs",
      "We only get paid if you close — our interests are aligned",
      "Same model as a residential mortgage broker",
    ],
    escalate: false,
  },
  "Never heard of RefiLoop": {
    bullets: [
      "Newer brokerage — NMLS licensed (#2510864)",
      "Smaller and more personal than the big shops — you deal directly with the team",
      "Happy to share references from recent closings",
      "Being newer means we work harder for each deal",
    ],
    escalate: false,
  },
  "Rates are too high right now": {
    bullets: [
      "Agreed — it's a tough market, no sugarcoating it",
      "Bridge loans can buy time while rates come down",
      "If your loan is maturing, staying put isn't really an option",
      "Some deals still pencil at current rates — depends on the numbers",
    ],
    escalate: true,
  },
  "Send me an email / call me later": {
    bullets: [
      "Happy to — just want to make sure I send something relevant",
      "What's the most pressing question for you right now?",
      "If they insist — get their address and have David follow up directly",
      "Don't chase — a warm call from the manager lands better than a cold email",
    ],
    escalate: true,
  },
};

const LOAN_TYPES: Record<string, { tagline: string; bullets: string[] }> = {
  "Bridge Loan": {
    tagline: "Short-term financing to bridge a gap",
    bullets: [
      "Term: 6–24 months, interest-only payments",
      "Rates: 9–12%",
      "Best for: value-add, quick close, unstabilized properties",
      "Exit strategy is essential — plan to refi out or sell",
      "More flexible than permanent financing, but higher rate",
    ],
  },
  CMBS: {
    tagline: "Fixed-rate, non-recourse long-term debt",
    bullets: [
      "Term: 5–10 years, fixed rate — Rates: 6.5–8%",
      "Non-recourse — lender can only take the property, not pursue you personally",
      "Best for: stabilized properties, long-term holds",
      "Heavy prepayment penalties — hard to exit early",
      "Typical deal size: $2M+",
    ],
  },
  "SBA 504": {
    tagline: "Government-backed for owner-occupied businesses",
    bullets: [
      "Borrower must occupy 51%+ of the property",
      "Rates: 6–7.5% — best rates available for eligible deals",
      "Term: 20–25 years, partially fixed",
      "More paperwork + ~90 day timeline, but worth it",
      "Only for businesses buying their own building",
    ],
  },
  "Agency Multifamily": {
    tagline: "Fannie/Freddie — best multifamily rates",
    bullets: [
      "For stabilized 5+ unit residential only",
      "Rates: 6–7%, 30-year amortization available",
      "Requires 85%+ occupancy",
      "Government-sponsored — lowest rates in multifamily",
      "Best for: experienced investors with clean, stable assets",
    ],
  },
  Construction: {
    tagline: "Ground-up development or major renovation",
    bullets: [
      "Floating rate: 10–13%",
      "Funds released in draws as construction progresses",
      "Converts to permanent financing at completion",
      "Requires detailed plans, permits, contractor bids",
      "Strong track record essential — highest risk product",
    ],
  },
  "Balloon Refinance": {
    tagline: "Refinancing a loan with a balloon payment due",
    bullets: [
      "Most commercial loans have 5–10 year terms with a balloon at the end",
      "When the balloon hits, you need to refi or pay it off",
      "There's a wave of maturities hitting the market right now",
      "Start the process 90–120 days before the balloon date",
      "Product and rate depend on current market + property",
    ],
  },
  "Conventional Commercial": {
    tagline: "Standard bank or credit union commercial loan",
    bullets: [
      "Rates: 7–9% depending on property, borrower, and term",
      "5–25 year terms, various amortization options",
      "Most flexible product — terms vary widely by lender",
      "Full recourse — lender can pursue you personally",
      "Best for: clean stabilized deals with an existing bank relationship",
    ],
  },
};

/* ─── Types ─── */

type Screen =
  | { id: "home" }
  | { id: "rates-property" }
  | { id: "rates-answer"; property: PropertyType }
  | { id: "requirements-property" }
  | { id: "requirements-answer"; property: PropertyType }
  | { id: "objections-list" }
  | { id: "objections-answer"; objection: string }
  | { id: "loan-types-list" }
  | { id: "loan-types-answer"; loanType: string }
  | { id: "escalate" };

function screenLabel(s: Screen): string {
  switch (s.id) {
    case "home": return "Home";
    case "rates-property": return "Rates";
    case "rates-answer": return s.property;
    case "requirements-property": return "Requirements";
    case "requirements-answer": return s.property;
    case "objections-list": return "Objections";
    case "objections-answer": return s.objection;
    case "loan-types-list": return "Loan Types";
    case "loan-types-answer": return s.loanType;
    case "escalate": return "Escalate";
  }
}

/* ─── Shared UI ─── */

function Breadcrumb({ stack, onHome }: { stack: Screen[]; onHome: () => void }) {
  if (stack.length <= 1) {
    return (
      <span className="text-sm font-semibold" style={{ color: "#e6edf3" }}>
        Call Cheat Sheet
      </span>
    );
  }
  return (
    <div className="flex items-center gap-1.5 flex-wrap text-sm" style={{ color: "#8b949e" }}>
      <button onClick={onHome} className="hover:underline" style={{ color: "#58a6ff" }}>
        Home
      </button>
      {stack.slice(1).map((s, i) => (
        <span key={i} className="flex items-center gap-1.5">
          <span>›</span>
          <span style={{ color: i === stack.length - 2 ? "#e6edf3" : "#8b949e" }}>
            {screenLabel(s)}
          </span>
        </span>
      ))}
    </div>
  );
}

function OptionCard({
  label,
  sublabel,
  onClick,
}: {
  label: string;
  sublabel?: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left px-4 py-3 rounded-lg transition-all"
      style={{ background: "#161b22", border: "1px solid #21262d" }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.borderColor = "#58a6ff44";
        (e.currentTarget as HTMLElement).style.background = "#1c2128";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.borderColor = "#21262d";
        (e.currentTarget as HTMLElement).style.background = "#161b22";
      }}
    >
      <div className="text-sm font-medium" style={{ color: "#e6edf3" }}>
        {label}
      </div>
      {sublabel && (
        <div className="text-xs mt-0.5" style={{ color: "#8b949e" }}>
          {sublabel}
        </div>
      )}
    </button>
  );
}

function BulletCard({
  title,
  subtitle,
  bullets,
  showEscalate,
  onEscalate,
}: {
  title: string;
  subtitle?: string;
  bullets: string[];
  showEscalate?: boolean;
  onEscalate?: () => void;
}) {
  return (
    <div className="rounded-xl p-5" style={{ background: "#161b22", border: "1px solid #21262d" }}>
      <div className="mb-4">
        <div className="text-base font-semibold" style={{ color: "#e6edf3" }}>
          {title}
        </div>
        {subtitle && (
          <div className="text-xs mt-0.5" style={{ color: "#8b949e" }}>
            {subtitle}
          </div>
        )}
      </div>
      <ul className="space-y-2.5">
        {bullets.map((b, i) => (
          <li key={i} className="flex gap-2.5 text-sm" style={{ color: "#c9d1d9" }}>
            <span style={{ color: "#3fb950", flexShrink: 0, marginTop: 1 }}>•</span>
            <span>{b}</span>
          </li>
        ))}
      </ul>
      {showEscalate && onEscalate && (
        <button
          onClick={onEscalate}
          className="mt-5 text-sm px-3 py-1.5 rounded-md font-medium transition-colors"
          style={{
            background: "#2d0f0f",
            color: "#fca5a5",
            border: "1px solid #b91c1c44",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.background = "#3d1515";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.background = "#2d0f0f";
          }}
        >
          → Escalate this one
        </button>
      )}
    </div>
  );
}

/* ─── Screens ─── */

function HomeScreen({ go }: { go: (s: Screen) => void }) {
  const tiles = [
    {
      id: "rates-property" as const,
      label: "Rates",
      icon: "📊",
      desc: "What rates are you seeing?",
      accent: "#1f6feb",
    },
    {
      id: "requirements-property" as const,
      label: "Requirements",
      icon: "✅",
      desc: "Do I qualify?",
      accent: "#238636",
    },
    {
      id: "objections-list" as const,
      label: "Objections",
      icon: "💬",
      desc: "Handling pushback",
      accent: "#9a6700",
    },
    {
      id: "loan-types-list" as const,
      label: "Loan Types",
      icon: "📚",
      desc: "What products do you offer?",
      accent: "#6e40c9",
    },
  ];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold mb-1" style={{ color: "#e6edf3" }}>
          Kirk&rsquo;s Call Cheat Sheet
        </h1>
        <p className="text-sm" style={{ color: "#8b949e" }}>
          Pick the topic — get the bullets fast. When in doubt, escalate.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-4">
        {tiles.map((tile) => (
          <button
            key={tile.id}
            onClick={() => go({ id: tile.id })}
            className="p-6 rounded-xl text-left transition-all"
            style={{ background: "#161b22", border: `1px solid ${tile.accent}33` }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.background = "#1c2128";
              (e.currentTarget as HTMLElement).style.borderColor = `${tile.accent}88`;
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.background = "#161b22";
              (e.currentTarget as HTMLElement).style.borderColor = `${tile.accent}33`;
            }}
          >
            <div className="text-3xl mb-3">{tile.icon}</div>
            <div className="text-base font-semibold mb-1" style={{ color: "#e6edf3" }}>
              {tile.label}
            </div>
            <div className="text-xs" style={{ color: "#8b949e" }}>
              {tile.desc}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function PropertySelectScreen({
  title,
  desc,
  go,
  nextFn,
}: {
  title: string;
  desc: string;
  go: (s: Screen) => void;
  nextFn: (p: PropertyType) => Screen;
}) {
  return (
    <div>
      <div className="mb-5">
        <h2 className="text-lg font-semibold mb-1" style={{ color: "#e6edf3" }}>
          {title}
        </h2>
        <p className="text-sm" style={{ color: "#8b949e" }}>
          {desc}
        </p>
      </div>
      <div className="space-y-2">
        {PROPERTY_TYPES.map((pt) => (
          <OptionCard key={pt} label={pt} onClick={() => go(nextFn(pt))} />
        ))}
      </div>
    </div>
  );
}

function RatesAnswerScreen({ property }: { property: PropertyType }) {
  const cards = Object.entries(RATE_CARDS).filter(
    ([, card]) => !card.availableFor || card.availableFor.includes(property)
  );

  return (
    <div>
      <div className="mb-5">
        <h2 className="text-lg font-semibold mb-1" style={{ color: "#e6edf3" }}>
          Rates — {property}
        </h2>
        <p className="text-sm" style={{ color: "#8b949e" }}>
          Ballpark ranges — exact rate depends on LTV, DSCR, credit, and property condition.
        </p>
      </div>
      <div className="space-y-3">
        {cards.map(([name, card]) => (
          <div
            key={name}
            className="rounded-lg p-4"
            style={{ background: "#161b22", border: "1px solid #21262d" }}
          >
            <div className="flex items-start justify-between gap-3 mb-2.5">
              <div>
                <div className="text-sm font-semibold" style={{ color: "#e6edf3" }}>
                  {name}
                </div>
                <div className="text-xs" style={{ color: "#8b949e" }}>
                  {card.note}
                </div>
              </div>
              <div
                className="text-lg font-bold shrink-0 tabular-nums"
                style={{ color: "#58a6ff" }}
              >
                {card.range}
              </div>
            </div>
            <ul className="space-y-1">
              {card.bullets.map((b, i) => (
                <li key={i} className="flex gap-2 text-xs" style={{ color: "#8b949e" }}>
                  <span style={{ color: "#3fb950", flexShrink: 0 }}>•</span>
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div
        className="mt-4 p-3 rounded-lg text-xs text-center"
        style={{
          background: "#0d1117",
          border: "1px solid #21262d",
          color: "#484f58",
        }}
      >
        Always say: &ldquo;These are rough ranges — your exact rate depends on the deal. Let me get you a real quote.&rdquo;
      </div>
    </div>
  );
}

function RequirementsAnswerScreen({ property }: { property: PropertyType }) {
  return (
    <BulletCard
      title={`Requirements — ${property}`}
      subtitle="Standard underwriting benchmarks. Exceptions happen — when in doubt, escalate."
      bullets={REQUIREMENTS[property]}
    />
  );
}

function ObjectionsListScreen({ go }: { go: (s: Screen) => void }) {
  return (
    <div>
      <div className="mb-5">
        <h2 className="text-lg font-semibold mb-1" style={{ color: "#e6edf3" }}>
          Objections
        </h2>
        <p className="text-sm" style={{ color: "#8b949e" }}>
          What&rsquo;s the prospect saying?
        </p>
      </div>
      <div className="space-y-2">
        {Object.keys(OBJECTIONS).map((obj) => (
          <OptionCard
            key={obj}
            label={obj}
            onClick={() => go({ id: "objections-answer", objection: obj })}
          />
        ))}
      </div>
    </div>
  );
}

function ObjectionsAnswerScreen({
  objection,
  onEscalate,
}: {
  objection: string;
  onEscalate: () => void;
}) {
  const data = OBJECTIONS[objection];
  return (
    <BulletCard
      title={`"${objection}"`}
      bullets={data.bullets}
      showEscalate={data.escalate}
      onEscalate={onEscalate}
    />
  );
}

function LoanTypesListScreen({ go }: { go: (s: Screen) => void }) {
  return (
    <div>
      <div className="mb-5">
        <h2 className="text-lg font-semibold mb-1" style={{ color: "#e6edf3" }}>
          Loan Types
        </h2>
        <p className="text-sm" style={{ color: "#8b949e" }}>
          Plain-English explainer for each product
        </p>
      </div>
      <div className="space-y-2">
        {Object.entries(LOAN_TYPES).map(([name, data]) => (
          <OptionCard
            key={name}
            label={name}
            sublabel={data.tagline}
            onClick={() => go({ id: "loan-types-answer", loanType: name })}
          />
        ))}
      </div>
    </div>
  );
}

function LoanTypeAnswerScreen({ loanType }: { loanType: string }) {
  const data = LOAN_TYPES[loanType];
  return (
    <BulletCard title={loanType} subtitle={data.tagline} bullets={data.bullets} />
  );
}

function EscalateScreen() {
  return (
    <div>
      <div className="mb-5">
        <h2 className="text-lg font-semibold mb-1" style={{ color: "#e6edf3" }}>
          Escalate
        </h2>
        <p className="text-sm" style={{ color: "#8b949e" }}>
          Use this whenever the question goes beyond your comfort zone — fast escalation keeps the prospect warm.
        </p>
      </div>
      <div
        className="rounded-xl p-6 mb-4"
        style={{ background: "#2d0f0f", border: "1px solid #b91c1c44" }}
      >
        <div className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: "#fca5a5" }}>
          What to say:
        </div>
        <div
          className="text-base font-medium mb-4"
          style={{ color: "#fff", lineHeight: 1.7 }}
        >
          &ldquo;That&rsquo;s a great question — let me have my manager reach out to you directly.
          He can give you exact numbers and look at your specific deal.&rdquo;
        </div>
        <div className="text-xs" style={{ color: "#fca5a5" }}>
          Short version:
        </div>
        <div className="text-base font-medium mt-1" style={{ color: "#fff" }}>
          &ldquo;Let me have David call you back — he handles the details.&rdquo;
        </div>
      </div>

      <div
        className="rounded-xl p-5"
        style={{ background: "#161b22", border: "1px solid #21262d" }}
      >
        <div className="text-sm font-semibold mb-3" style={{ color: "#e6edf3" }}>
          Then do this:
        </div>
        <ol className="space-y-2.5">
          {[
            "Get their name, phone number, and a good time to call",
            "Text David: name, number, what they asked, best call time",
            "Tell them: \"David will reach out within 24 hours\"",
          ].map((item, i) => (
            <li key={i} className="flex gap-3 text-sm" style={{ color: "#c9d1d9" }}>
              <span
                className="font-mono font-bold shrink-0 w-5 text-center"
                style={{ color: "#58a6ff" }}
              >
                {i + 1}.
              </span>
              <span>{item}</span>
            </li>
          ))}
        </ol>
      </div>

      <div
        className="mt-4 p-3 rounded-lg text-xs text-center"
        style={{
          background: "#0d1117",
          border: "1px solid #21262d",
          color: "#484f58",
        }}
      >
        Escalating fast is a feature, not a bug — it keeps the prospect warm and puts an expert on it.
      </div>
    </div>
  );
}

/* ─── Main ─── */

export default function KirkClient() {
  const [stack, setStack] = useState<Screen[]>([{ id: "home" }]);
  const screen = stack[stack.length - 1];

  function go(next: Screen) {
    setStack((s) => [...s, next]);
  }

  function back() {
    setStack((s) => (s.length > 1 ? s.slice(0, -1) : s));
  }

  function goHome() {
    setStack([{ id: "home" }]);
  }

  function goEscalate() {
    go({ id: "escalate" });
  }

  function renderScreen() {
    switch (screen.id) {
      case "home":
        return <HomeScreen go={go} />;
      case "rates-property":
        return (
          <PropertySelectScreen
            title="What type of property?"
            desc="Select the property type to see applicable rate ranges."
            go={go}
            nextFn={(p) => ({ id: "rates-answer", property: p })}
          />
        );
      case "rates-answer":
        return <RatesAnswerScreen property={screen.property} />;
      case "requirements-property":
        return (
          <PropertySelectScreen
            title="What type of property?"
            desc="Select the property type to see qualification benchmarks."
            go={go}
            nextFn={(p) => ({ id: "requirements-answer", property: p })}
          />
        );
      case "requirements-answer":
        return <RequirementsAnswerScreen property={screen.property} />;
      case "objections-list":
        return <ObjectionsListScreen go={go} />;
      case "objections-answer":
        return (
          <ObjectionsAnswerScreen
            objection={screen.objection}
            onEscalate={goEscalate}
          />
        );
      case "loan-types-list":
        return <LoanTypesListScreen go={go} />;
      case "loan-types-answer":
        return <LoanTypeAnswerScreen loanType={screen.loanType} />;
      case "escalate":
        return <EscalateScreen />;
    }
  }

  return (
    <div className="min-h-screen pb-20" style={{ background: "#0d1117" }}>
      {/* Sticky top bar */}
      <div
        className="sticky top-0 z-10 px-6 py-3 border-b"
        style={{ background: "#0d1117", borderColor: "#21262d" }}
      >
        <div className="flex items-center justify-between max-w-3xl mx-auto">
          <div className="flex items-center gap-3">
            {stack.length > 1 && (
              <button
                onClick={back}
                className="text-sm px-2.5 py-1 rounded-md transition-colors"
                style={{ background: "#21262d", color: "#8b949e" }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.color = "#e6edf3";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.color = "#8b949e";
                }}
              >
                ← Back
              </button>
            )}
            <Breadcrumb stack={stack} onHome={goHome} />
          </div>
          <button
            onClick={goEscalate}
            className="text-sm px-3 py-1.5 rounded-md font-semibold transition-colors"
            style={{ background: "#b91c1c", color: "#fff" }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.background = "#dc2626";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.background = "#b91c1c";
            }}
          >
            Escalate
          </button>
        </div>
      </div>

      {/* Page content */}
      <div className="max-w-3xl mx-auto px-6 py-6">{renderScreen()}</div>

      {/* Persistent escalate footer */}
      <div
        className="fixed bottom-0 left-56 right-0 px-6 py-3"
        style={{ background: "#0d1117", borderTop: "1px solid #21262d" }}
      >
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <span className="text-xs" style={{ color: "#484f58" }}>
            When in doubt — escalate fast. David handles the details.
          </span>
          <button
            onClick={goEscalate}
            className="text-sm px-4 py-1.5 rounded-md font-semibold transition-colors"
            style={{ background: "#b91c1c", color: "#fff" }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.background = "#dc2626";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.background = "#b91c1c";
            }}
          >
            Escalate Now
          </button>
        </div>
      </div>
    </div>
  );
}
