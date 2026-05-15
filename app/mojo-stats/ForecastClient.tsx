"use client";

import { useState } from "react";

type Props = {
  liveDialsTotal: number;
  liveUniqueContacted: number;
  liveConnects: number;
  liveLeads: number;
  remainingPool: number;
  alreadyCalled: number;
};

function Slider({
  label,
  value,
  min,
  max,
  step,
  unit,
  onChange,
  color,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  onChange: (v: number) => void;
  color: string;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs" style={{ color: "#8b949e" }}>{label}</span>
        <span className="text-xs font-semibold font-mono" style={{ color }}>
          {value.toLocaleString()}{unit}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
        style={{ accentColor: color, background: "#21262d" }}
      />
      <div className="mt-0.5 flex justify-between text-[10px]" style={{ color: "#484f58" }}>
        <span>{min.toLocaleString()}{unit}</span>
        <span>{max.toLocaleString()}{unit}</span>
      </div>
    </div>
  );
}

function StatBox({ label, value, sub, color }: { label: string; value: string; sub?: string; color: string }) {
  return (
    <div className="rounded-lg border p-4" style={{ background: "#0d1117", borderColor: "#30363d" }}>
      <div className="text-2xl font-bold" style={{ color }}>{value}</div>
      <div className="mt-1 text-xs" style={{ color: "#8b949e" }}>{label}</div>
      {sub && <div className="mt-0.5 text-[11px]" style={{ color: "#484f58" }}>{sub}</div>}
    </div>
  );
}

function fmtRate(n: number) {
  return n.toFixed(1) + "%";
}

export default function ForecastClient({
  liveDialsTotal,
  liveUniqueContacted,
  liveConnects,
  liveLeads,
  remainingPool,
  alreadyCalled,
}: Props) {
  // Live rates â fall back to XLS-derived defaults if Supabase data is thin
  const liveConnectRate = liveUniqueContacted >= 30
    ? Math.round((liveConnects / liveUniqueContacted) * 100)
    : 20; // XLS baseline: ~90 connects / 458 unique â 20%
  const liveLeadRate = liveConnects >= 20
    ? Math.round((liveLeads / liveConnects) * 100)
    : 9;  // XLS baseline: ~8 leads / 90 connects â 9%

  const avgDialsPerPerson = liveUniqueContacted > 0
    ? parseFloat((liveDialsTotal / liveUniqueContacted).toFixed(1))
    : 3.7;

  const [totalPool, setTotalPool] = useState(15000);
  const [dialsPerDay, setDialsPerDay] = useState(300);
  const [connectRate, setConnectRate] = useState(liveConnectRate);
  const [leadRate, setLeadRate] = useState(liveLeadRate);

  // Forecast for full pool
  const totalDials = Math.round(totalPool * avgDialsPerPerson);
  const workingDays = Math.ceil(totalDials / dialsPerDay);
  const weeks = (workingDays / 5).toFixed(1);
  const months = (workingDays / 22).toFixed(1);
  const projectedConnects = Math.round(totalPool * (connectRate / 100));
  const projectedLeads = Math.round(projectedConnects * (leadRate / 100));
  const leadsPerWeek = workingDays > 0
    ? (projectedLeads / (workingDays / 5)).toFixed(1)
    : "0";

  // Near-term: remaining push queue
  const remainingConnects = Math.round(remainingPool * (connectRate / 100));
  const remainingLeads = Math.round(remainingConnects * (leadRate / 100));
  const remainingDays = Math.ceil((remainingPool * avgDialsPerPerson) / dialsPerDay);

  const dataSufficient = liveUniqueContacted >= 30 && liveConnects >= 20;

  return (
    <section className="rounded-lg border" style={{ background: "#161b22", borderColor: "#30363d" }}>
      <div className="border-b px-5 py-4" style={{ borderColor: "#30363d" }}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold" style={{ color: "#e6edf3" }}>Lead Forecast</h2>
            <p className="mt-1 text-xs" style={{ color: "#8b949e" }}>
              Rates auto-update from Supabase call data. Adjust sliders to model scenarios.
            </p>
          </div>
          <div
            className="rounded-full border px-3 py-1 text-[11px] font-medium"
            style={{
              background: dataSufficient ? "#0d3320" : "#2d2106",
              color: dataSufficient ? "#3fb950" : "#d29922",
              borderColor: dataSufficient ? "#238636" : "#9e6a03",
            }}
          >
            {dataSufficient ? "Live rates" : "Baseline rates (limited data)"}
          </div>
        </div>
      </div>

      <div className="grid gap-6 p-5 xl:grid-cols-2">
        {/* Sliders */}
        <div className="space-y-5">
          <div className="text-xs font-semibold mb-2" style={{ color: "#8b949e" }}>ADJUST ASSUMPTIONS</div>
          <Slider
            label="Total prospect pool"
            value={totalPool}
            min={1000}
            max={50000}
            step={500}
            unit=" people"
            onChange={setTotalPool}
            color="#58a6ff"
          />
          <Slider
            label="Dials per working day"
            value={dialsPerDay}
            min={50}
            max={600}
            step={25}
            unit="/day"
            onChange={setDialsPerDay}
            color="#a371f7"
          />
          <Slider
            label="Connect rate (unique people reached)"
            value={connectRate}
            min={1}
            max={50}
            step={1}
            unit="%"
            onChange={setConnectRate}
            color="#2ea043"
          />
          <Slider
            label="Lead conversion (connects â leads)"
            value={leadRate}
            min={1}
            max={50}
            step={1}
            unit="%"
            onChange={setLeadRate}
            color="#d29922"
          />

          {/* Live rate reference */}
          <div className="rounded-md border px-3 py-2.5 text-xs space-y-1" style={{ background: "#0d1117", borderColor: "#21262d" }}>
            <div className="font-semibold mb-1" style={{ color: "#8b949e" }}>LIVE RATES FROM SUPABASE</div>
            <div className="flex justify-between">
              <span style={{ color: "#484f58" }}>Total Mojo dials logged</span>
              <span className="font-mono" style={{ color: "#c9d1d9" }}>{liveDialsTotal.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span style={{ color: "#484f58" }}>Unique people dialed</span>
              <span className="font-mono" style={{ color: "#c9d1d9" }}>{liveUniqueContacted.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span style={{ color: "#484f58" }}>Connects (live)</span>
              <span className="font-mono" style={{ color: "#2ea043" }}>{liveConnects} ({fmtRate(liveUniqueContacted > 0 ? (liveConnects / liveUniqueContacted) * 100 : 0)})</span>
            </div>
            <div className="flex justify-between">
              <span style={{ color: "#484f58" }}>Leads logged (live)</span>
              <span className="font-mono" style={{ color: "#d29922" }}>{liveLeads} ({fmtRate(liveConnects > 0 ? (liveLeads / liveConnects) * 100 : 0)})</span>
            </div>
            <div className="flex justify-between">
              <span style={{ color: "#484f58" }}>Avg dials per person</span>
              <span className="font-mono" style={{ color: "#c9d1d9" }}>{avgDialsPerPerson}Ã</span>
            </div>
            {!dataSufficient && (
              <div className="mt-1 pt-1 border-t text-[10px]" style={{ borderColor: "#21262d", color: "#484f58" }}>
                â  Sync data still building â sliders default to XLS-derived baselines (connect 20%, lead 9%)
              </div>
            )}
          </div>
        </div>

        {/* Projections */}
        <div className="space-y-4">
          <div className="text-xs font-semibold" style={{ color: "#8b949e" }}>FULL POOL PROJECTION ({totalPool.toLocaleString()} people)</div>
          <div className="grid grid-cols-2 gap-3">
            <StatBox
              label="Projected leads"
              value={projectedLeads.toLocaleString()}
              sub={`${leadsPerWeek} leads/week`}
              color="#d29922"
            />
            <StatBox
              label="Time to complete"
              value={`${weeks}w`}
              sub={`${months} months Â· ${workingDays} days`}
              color="#58a6ff"
            />
            <StatBox
              label="Projected connects"
              value={projectedConnects.toLocaleString()}
              sub={`${fmtRate(connectRate)} of pool`}
              color="#2ea043"
            />
            <StatBox
              label="Total dials needed"
              value={totalDials.toLocaleString()}
              sub={`${avgDialsPerPerson}Ã per person`}
              color="#a371f7"
            />
          </div>

          {/* Divider */}
          <div className="border-t pt-4" style={{ borderColor: "#21262d" }}>
            <div className="text-xs font-semibold mb-3" style={{ color: "#8b949e" }}>
              NEAR-TERM: CURRENT PUSH QUEUE ({remainingPool.toLocaleString()} remaining)
            </div>
            <div className="grid grid-cols-3 gap-3">
              <StatBox
                label="Est. leads"
                value={remainingLeads.toLocaleString()}
                color="#d29922"
              />
              <StatBox
                label="Days to complete"
                value={remainingDays.toString()}
                color="#58a6ff"
              />
              <StatBox
                label="Already called"
                value={alreadyCalled.toLocaleString()}
                color="#3fb950"
              />
            </div>
          </div>

          {/* Funnel visual */}
          <div className="rounded-md border px-4 py-3" style={{ background: "#0d1117", borderColor: "#21262d" }}>
            <div className="text-[11px] font-semibold mb-2" style={{ color: "#8b949e" }}>FUNNEL AT CURRENT RATES</div>
            {[
              { label: `${totalPool.toLocaleString()} prospects`, pct: 100, color: "#58a6ff" },
              { label: `${projectedConnects.toLocaleString()} connects (${connectRate}%)`, pct: connectRate * 2, color: "#2ea043" },
              { label: `${projectedLeads.toLocaleString()} leads (${leadRate}% of connects)`, pct: Math.max(4, Math.round((projectedLeads / totalPool) * 200)), color: "#d29922" },
            ].map((row) => (
              <div key={row.label} className="mb-2">
                <div className="text-[11px] mb-0.5" style={{ color: "#8b949e" }}>{row.label}</div>
                <div className="h-2 rounded-full" style={{ background: "#21262d" }}>
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${Math.min(100, row.pct)}%`, background: row.color }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
