const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_OWNER = process.env.GITHUB_OWNER || "FractionalEmpire";
const GITHUB_REPO = process.env.GITHUB_REPO || "refiloop2";

const BASE = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}`;

const headers = () => ({
  Authorization: `token ${GITHUB_TOKEN}`,
  "Content-Type": "application/json",
  Accept: "application/vnd.github.v3+json",
});

export type DocFile = {
  path: string;
  label: string;
  group: string;
  content?: string;
  sha?: string;
  exists?: boolean;
};

// All tracked MD files grouped by category
export const TRACKED_DOCS: DocFile[] = [
  // Operations
  { path: "CLAUDE.md",                            label: "Project Instructions (CLAUDE.md)",      group: "Operations" },
  { path: "STATE.md",                             label: "Session Handoff (STATE.md)",            group: "Operations" },
  { path: "LEAD_FILTERS.md",                      label: "Lead Filters",                          group: "Operations" },
  { path: "docs/refiloop-full-process-flow.md",   label: "Full Process Flow",                     group: "Operations" },
  { path: "docs/capitalize-process-flow.md",      label: "Capitalize.io Process Flow",            group: "Operations" },
  // Dialer & Calling
  { path: "docs/calling-queue-rules.md",           label: "Daily Calling Queue Rules",            group: "Dialer" },
  { path: "docs/mojo-daily-push.md",               label: "Daily Mojo Push — How It Works",        group: "Dialer" },
  { path: "docs/Mojo_Dialer_Integration.md",      label: "Mojo Dialer Integration",               group: "Dialer" },
  { path: "docs/Kirk_Mojo_Import_Guide.md",       label: "Kirk: Daily Import Guide",              group: "Dialer" },
  { path: "docs/Kirk_Cheat_Sheet.md",             label: "Kirk: Call Cheat Sheet",                group: "Dialer" },
  { path: "docs/RefiLoop_Call_Script_v1.md",      label: "Call Script v1",                        group: "Dialer" },
  // Skip Trace & Data
  { path: "docs/supabase-database-guide.md",      label: "Supabase Database Guide",               group: "Data" },
  { path: "docs/skip-trace-scoring-proposal.md",  label: "Skip Trace Scoring Proposal",           group: "Data" },
  { path: "docs/scraper-playbook.md",             label: "Scraper Playbook",                      group: "Data" },
  // Infrastructure
  { path: "docs/VPS_Infrastructure.md",           label: "VPS Infrastructure",                    group