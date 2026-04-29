const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_OWNER = process.env.GITHUB_OWNER || "FractionalEmpire";
const GITHUB_REPO = process.env.GITHUB_REPO || "refiloop-config";

const BASE = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}`;

const headers = () => ({
  Authorization: `token ${GITHUB_TOKEN}`,
  "Content-Type": "application/json",
  Accept: "application/vnd.github.v3+json",
});

// List of MD files to surface in the docs section
export const TRACKED_DOCS = [
  { path: "CLAUDE.md", label: "CLAUDE.md (Project Instructions)" },
  { path: "README.md", label: "README" },
  { path: "STATE.md", label: "STATE.md (Session Handoff)" },
  { path: "docs/GORJAN_ONBOARDING.md", label: "Gorjan Onboarding Guide" },
];

export type DocFile = {
  path: string;
  label: string;
  content?: string;
  sha?: string;
  exists?: boolean;
};

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
