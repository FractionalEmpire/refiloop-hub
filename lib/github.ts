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
  { path: "docs/Mojo_Dialer_Integration.md",      label: "Mojo Dialer Integration",               group: "Dialer" },
  { path: "docs/Kirk_Mojo_Import_Guide.md",       label: "Kirk: Daily Import Guide",              group: "Dialer" },
  { path: "docs/Kirk_Cheat_Sheet.md",             label: "Kirk: Call Cheat Sheet",                group: "Dialer" },
  { path: "docs/RefiLoop_Call_Script_v1.md",      label: "Call Script v1",                        group: "Dialer" },
  // Skip Trace & Data
  { path: "docs/supabase-database-guide.md",      label: "Supabase Database Guide",               group: "Data" },
  { path: "docs/skip-trace-scoring-proposal.md",  label: "Skip Trace Scoring Proposal",           group: "Data" },
  { path: "docs/scraper-playbook.md",             label: "Scraper Playbook",                      group: "Data" },
  // Infrastructure
  { path: "docs/VPS_Infrastructure.md",           label: "VPS Infrastructure",                    group: "Infrastructure" },
  { path: "idi/README.md",                        label: "IDI API README",                        group: "Infrastructure" },
  { path: "idi/nordlayer_setup.md",               label: "Nordlayer VPN Setup",                   group: "Infrastructure" },
  // Requirements
  { path: "docs/REQ-mojo-daily-push.md",          label: "REQ: Mojo Daily Push",      group: "Requirements" },
  { path: "docs/REQ-mojo-results-pull.md",        label: "REQ: Mojo Results Pull",    group: "Requirements" },
  { path: "docs/REQ-entity-vs-human.md",          label: "REQ: Entity vs Human",      group: "Requirements" },
  { path: "docs/REQ-skip-trace-tabs.md",          label: "REQ: Skip Trace Tabs",      group: "Requirements" },
  { path: "docs/REQ-skip-trace-error-display.md", label: "REQ: Error Display",         group: "Requirements" },

  // Onboarding
  { path: "Gorjan_Day1_Agenda.md",                label: "Gorjan Day 1 Agenda",                   group: "Onboarding" },
  { path: "README.md",                            label: "Project README",                        group: "Onboarding" },
];

export async function getFileContent(path: string): Promise<{ content: string; sha: string } | null> {
  if (!GITHUB_TOKEN) return null;
  try {
    const res = await fetch(`${BASE}/contents/${path}`, {
      headers: headers(),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = await res.json();
    const content = Buffer.from(data.content, "base64").toString("utf-8");
    return { content, sha: data.sha };
  } catch {
    return null;
  }
}

export async function updateFileContent(
  path: string,
  content: string,
  sha: string,
  message: string
): Promise<boolean> {
  if (!GITHUB_TOKEN) return false;
  try {
    const encoded = Buffer.from(content).toString("base64");
    const res = await fetch(`${BASE}/contents/${path}`, {
      method: "PUT",
      headers: headers(),
      body: JSON.stringify({
        message,
        content: encoded,
        sha,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function getDirectoryListing(dirPath: string): Promise<DocFile[]> {
  if (!GITHUB_TOKEN) return [];
  try {
    const res = await fetch(`${BASE}/contents/${dirPath}`, {
      headers: headers(),
      cache: "no-store",
    });
    if (!res.ok) return [];
    const data = await res.json();
    if (!Array.isArray(data)) return [];
    return data
      .filter((item: { type: string; name: string; path: string }) => item.type === "file" && item.name.endsWith(".md"))
      .map((item: { type: string; name: string; path: string }) => ({
        path: item.path,
        label: item.name.replace(/\.md$/, "").replace(/_/g, " "),
        group: "Memory",
        exists: true,
      }));
  } catch {
    return [];
  }
}

export async function getRecentCommits(count = 5) {
  if (!GITHUB_TOKEN) return [];
  try {
    const res = await fetch(`${BASE}/commits?per_page=${count}`, {
      headers: headers(),
      cache: "no-store",
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.map((c: { sha: string; commit: { message: string; author: { name: string; date: string } }; html_url: string }) => ({
      sha: c.sha.slice(0, 7),
      message: c.commit.message.split("\n")[0],
      author: c.commit.author.name,
      date: c.commit.author.date,
      url: c.html_url,
    }));
  } catch {
    return [];
  }
}
