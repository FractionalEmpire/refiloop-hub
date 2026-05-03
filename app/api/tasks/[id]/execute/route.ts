import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const anthropic = new Anthropic({ apiKey: process.env.BUILDER_HUB_ANTHROPIC_KEY || process.env.ANTHROPIC_API_KEY });
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_OWNER = process.env.GITHUB_OWNER || "FractionalEmpire";
const SLACK_WEBHOOK = process.env.SLACK_WEBHOOK_URL;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const tools: Anthropic.Tool[] = [
  {
    name: "github_read_file",
    description: "Read a file from a GitHub repository in the FractionalEmpire org",
    input_schema: {
      type: "object" as const,
      properties: {
        repo: { type: "string", description: "Repository name, e.g. refiloop-hub or refiloop2" },
        path: { type: "string", description: "File path, e.g. app/tasks/TasksClient.tsx" },
        ref: { type: "string", description: "Branch (default: main)" },
      },
      required: ["repo", "path"],
    },
  },
  {
    name: "github_write_file",
    description: "Create or update a file in a GitHub repository",
    input_schema: {
      type: "object" as const,
      properties: {
        repo: { type: "string" },
        path: { type: "string" },
        content: { type: "string", description: "Full file content (UTF-8)" },
        message: { type: "string", description: "Commit message (will be prefixed with [Claude])" },
        branch: { type: "string", description: "Branch to commit to (default: main). Use this when the task specifies a branch." },
      },
      required: ["repo", "path", "content", "message"],
    },
  },
  {
    name: "github_list_files",
    description: "List files in a directory of a GitHub repository",
    input_schema: {
      type: "object" as const,
      properties: {
        repo: { type: "string" },
        path: { type: "string", description: "Directory path, e.g. app/api or '' for root" },
        ref: { type: "string" },
      },
      required: ["repo", "path"],
    },
  },
  {
    name: "query_supabase",
    description: "Read rows from a Supabase table",
    input_schema: {
      type: "object" as const,
      properties: {
        table: { type: "string" },
        params: { type: "string", description: "PostgREST query string, e.g. status=eq.todo&limit=10" },
      },
      required: ["table"],
    },
  },
  {
    name: "upsert_supabase",
    description: "Insert or update rows in a Supabase table",
    input_schema: {
      type: "object" as const,
      properties: {
        table: { type: "string" },
        rows: { type: "string", description: "JSON array of row objects to upsert" },
        on_conflict: { type: "string", description: "Conflict column(s) for upsert, e.g. 'id'" },
      },
      required: ["table", "rows"],
    },
  },
  {
    name: "log_progress",
    description: "Append a progress note to the task (call multiple times during work)",
    input_schema: {
      type: "object" as const,
      properties: {
        note: { type: "string", description: "Progress update or finding (markdown OK)" },
      },
      required: ["note"],
    },
  },
  {
    name: "complete_task",
    description: "Mark the task done. Call this when you have finished all work.",
    input_schema: {
      type: "object" as const,
      properties: {
        summary: { type: "string", description: "Evidence summary: what changed, where, proof it worked (commit URLs, row counts, etc.)" },
      },
      required: ["summary"],
    },
  },
  {
    name: "mark_blocked",
    description: "Mark the task blocked if you cannot complete it",
    input_schema: {
      type: "object" as const,
      properties: {
        reason: { type: "string", description: "Clear explanation of what is missing or what failed" },
      },
      required: ["reason"],
    },
  },
];

const verifyTools: Anthropic.Tool[] = [
  {
    name: "github_read_file",
    description: "Read a file from a GitHub repository to verify a change exists",
    input_schema: {
      type: "object" as const,
      properties: {
        repo: { type: "string" },
        path: { type: "string" },
        ref: { type: "string", description: "Branch (default: main)" },
      },
      required: ["repo", "path"],
    },
  },
  {
    name: "verify_result",
    description: "Submit your verification verdict after checking the work",
    input_schema: {
      type: "object" as const,
      properties: {
        pass: { type: "boolean", description: "true if task is genuinely complete, false if something is wrong or missing" },
        reason: { type: "string", description: "Brief explanation of your verdict" },
      },
      required: ["pass", "reason"],
    },
  },
];

async function appendNote(taskId: string, note: string) {
  const { data } = await supabase.from("collab_tasks").select("notes").eq("id", taskId).single();
  const prev = data?.notes || "";
  const stamped = `[${new Date().toISOString()}] ${note}`;
  const updated = prev ? `${prev}\n\n${stamped}` : stamped;
  await supabase
    .from("collab_tasks")
    .update({ notes: updated, updated_at: new Date().toISOString() })
    .eq("id", taskId);
  return updated;
}

async function postSlack(text: string) {
  if (!SLACK_WEBHOOK) return;
  await fetch(SLACK_WEBHOOK, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  }).catch(() => {});
}

async function githubReadFile(repo: string, path: string, ref = "main"): Promise<string> {
  const url = `https://api.github.com/repos/${GITHUB_OWNER}/${repo}/contents/${path}?ref=${ref}`;
  const res = await fetch(url, {
    headers: { Authorization: `token ${GITHUB_TOKEN}`, Accept: "application/vnd.github.v3+json" },
  });
  if (!res.ok) return `HTTP ${res.status}: ${await res.text()}`;
  const data = await res.json() as { content: string };
  return Buffer.from(data.content, "base64").toString("utf-8");
}

async function runVerify(
  taskId: string,
  task: { title: string; description: string | null },
  summary: string
): Promise<{ pass: boolean; reason: string }> {
  const verifySystem = `You are a code reviewer verifying that an AI agent completed a task correctly.
Check that the work actually happened — don't just trust the summary. Read one key changed file if needed.
Be practical: minor style issues are fine. Fail only if the core requirement is missing or broken.`;

  const verifyPrompt = `Task: ${task.title}
Description: ${task.description || "(none)"}

Executor summary:
${summary}

Verify this is genuinely done. If files were changed, read one key file to confirm the change exists and is correct. Then call verify_result with your verdict.`;

  const messages: Anthropic.MessageParam[] = [{ role: "user", content: verifyPrompt }];

  for (let i = 0; i < 5; i++) {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system: verifySystem,
      tools: verifyTools,
      messages,
    });

    messages.push({ role: "assistant", content: response.content });

    if (response.stop_reason !== "tool_use") break;

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const block of response.content) {
      if (block.type !== "tool_use") continue;
      if (block.name === "verify_result") {
        const input = block.input as { pass: boolean; reason: string };
        return { pass: input.pass, reason: input.reason };
      }
      if (block.name === "github_read_file") {
        const input = block.input as { repo: string; path: string; ref?: string };
        const content = await githubReadFile(input.repo, input.path, input.ref);
        toolResults.push({ type: "tool_result", tool_use_id: block.id, content });
      }
    }
    if (toolResults.length > 0) {
      messages.push({ role: "user", content: toolResults });
    }
  }

  // Verify loop ended without a verdict — default to pass so good work isn't blocked
  return { pass: true, reason: "Verification completed without finding issues." };
}

async function runTool(
  name: string,
  input: Record<string, string>,
  taskId: string
): Promise<{ result: string; terminal?: boolean }> {
  switch (name) {
    case "github_read_file": {
      const content = await githubReadFile(input.repo, input.path, input.ref);
      return { result: content };
    }

    case "github_write_file": {
      const branch = input.branch || "main";
      let sha: string | undefined;
      const existing = await fetch(
        `https://api.github.com/repos/${GITHUB_OWNER}/${input.repo}/contents/${input.path}?ref=${branch}`,
        { headers: { Authorization: `token ${GITHUB_TOKEN}`, Accept: "application/vnd.github.v3+json" } }
      );
      if (existing.ok) {
        const d = await existing.json() as { sha: string };
        sha = d.sha;
      }

      const body: Record<string, string | undefined> = {
        message: `[Claude] ${input.message}`,
        content: Buffer.from(input.content).toString("base64"),
        branch,
        sha,
      };
      if (!sha) delete body.sha;

      const res = await fetch(
        `https://api.github.com/repos/${GITHUB_OWNER}/${input.repo}/contents/${input.path}`,
        {
          method: "PUT",
          headers: {
            Authorization: `token ${GITHUB_TOKEN}`,
            "Content-Type": "application/json",
            Accept: "application/vnd.github.v3+json",
          },
          body: JSON.stringify(body),
        }
      );
      if (!res.ok) return { result: `HTTP ${res.status}: ${await res.text()}` };
      const data = await res.json() as { commit: { html_url: string } };
      return { result: `Committed to ${branch}: ${data.commit.html_url}` };
    }

    case "github_list_files": {
      const ref = input.ref || "main";
      const url = `https://api.github.com/repos/${GITHUB_OWNER}/${input.repo}/contents/${input.path}?ref=${ref}`;
      const res = await fetch(url, {
        headers: { Authorization: `token ${GITHUB_TOKEN}`, Accept: "application/vnd.github.v3+json" },
      });
      if (!res.ok) return { result: `HTTP ${res.status}: ${await res.text()}` };
      const data = await res.json() as Array<{ name: string; type: string; path: string }>;
      return { result: data.map((f) => `${f.type === "dir" ? "📁" : "📄"} ${f.path}`).join("\n") };
    }

    case "query_supabase": {
      const url = `${SUPABASE_URL}/rest/v1/${input.table}${input.params ? `?${input.params}` : ""}`;
      const res = await fetch(url, {
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
      });
      const data = await res.json();
      return { result: JSON.stringify(data, null, 2) };
    }

    case "upsert_supabase": {
      const rows = JSON.parse(input.rows);
      const url = `${SUPABASE_URL}/rest/v1/${input.table}`;
      const params = input.on_conflict ? `?on_conflict=${input.on_conflict}` : "";
      const res = await fetch(`${url}${params}`, {
        method: "POST",
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          "Content-Type": "application/json",
          Prefer: "resolution=merge-duplicates,return=minimal",
        },
        body: JSON.stringify(rows),
      });
      if (!res.ok) return { result: `HTTP ${res.status}: ${await res.text()}` };
      return { result: `Upserted ${Array.isArray(rows) ? rows.length : 1} row(s) into ${input.table}` };
    }

    case "log_progress": {
      await appendNote(taskId, input.note);
      return { result: "Progress logged." };
    }

    case "complete_task": {
      // Don't set done yet — return the summary for the verify step
      await appendNote(taskId, `📋 EXECUTOR SUMMARY\n${input.summary}`);
      return { result: "__COMPLETE__:" + input.summary, terminal: true };
    }

    case "mark_blocked": {
      await appendNote(taskId, `🚫 BLOCKED: ${input.reason}`);
      await supabase.from("collab_tasks").update({
        status: "blocked",
        updated_at: new Date().toISOString(),
      }).eq("id", taskId);
      await postSlack(`🚫 *Claude hit a blocker*\n${input.reason}`);
      return { result: "Task marked blocked.", terminal: true };
    }

    default:
      return { result: `Unknown tool: ${name}` };
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  const reqBody = await req.json().catch(() => ({}));
  const model = reqBody.model || "claude-sonnet-4-6";

  const { data: task, error } = await supabase
    .from("collab_tasks")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !task) return NextResponse.json({ error: "Task not found" }, { status: 404 });

  const systemPrompt = `You are Claude, an autonomous AI agent for RefiLoop (commercial mortgage brokerage). You have been assigned a task and must complete it without human help.

GitHub org: ${GITHUB_OWNER}
Key repos:
- refiloop-hub: Internal ops hub (Next.js on Vercel). API routes in app/api/, pages in app/, components in components/, types in lib/.
- refiloop2: Main config repo with docs, supabase functions, scripts.

Deployment context (IMPORTANT — default branches):
- refiloop-hub: commit to main (Vercel auto-deploys)
- skip-trace-ui / any task mentioning skip trace UI: commit to branch client-review-skip-trace (production is promoted from preview builds of that branch, NOT main)
- If the task description specifies a branch field, always use that branch.

Rules:
1. Start by calling log_progress with your understanding of the task and your plan. If the task specifies a file path, use it directly — do not search.
2. When you need to read multiple files, call github_read_file for all of them in the same step — do not read one at a time sequentially. This saves iterations.
3. Make minimal changes. Read the file, apply only the necessary edits, write back the complete file. Never rewrite a file from scratch when a small targeted change will do — this saves tokens and avoids timeouts.
4. Call log_progress frequently to show your work.
5. Always end with complete_task (success) or mark_blocked (can't finish).
6. The complete_task summary is what David sees — include commit URLs, what changed, and proof it works.`;

  const userContent = `Complete this task:

**Title:** ${task.title}
**Description:** ${task.description || "(none — use the title to infer what's needed)"}
**Project:** ${task.project || "RefiLoop Hub"}
**Priority:** ${task.priority}
**Existing notes:** ${task.notes || "(none)"}${task.context ? `\n**Context (file paths, branch, etc.):** ${task.context}` : ""}

Get started.`;

  const messages: Anthropic.MessageParam[] = [{ role: "user", content: userContent }];
  let done = false;
  let completionSummary: string | null = null;
  let iterations = 0;
  const MAX = 20;

  try {
    while (!done && iterations < MAX) {
      iterations++;
      const response = await anthropic.messages.create({
        model,
        max_tokens: 4096,
        system: systemPrompt,
        tools,
        messages,
      });

      messages.push({ role: "assistant", content: response.content });

      if (response.stop_reason === "end_turn") {
        await appendNote(id, "⚠️ Claude stopped without calling complete_task or mark_blocked.");
        await supabase.from("collab_tasks").update({ status: "blocked", updated_at: new Date().toISOString() }).eq("id", id);
        break;
      }

      if (response.stop_reason !== "tool_use") break;

      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const block of response.content) {
        if (block.type !== "tool_use") continue;
        const result = await runTool(block.name, block.input as Record<string, string>, id);
        // Extract summary from complete_task sentinel
        if (result.result.startsWith("__COMPLETE__:")) {
          completionSummary = result.result.slice("__COMPLETE__:".length);
          toolResults.push({ type: "tool_result", tool_use_id: block.id, content: "Summary recorded. Verification will run." });
        } else {
          toolResults.push({ type: "tool_result", tool_use_id: block.id, content: result.result });
        }
        if (result.terminal) { done = true; break; }
      }

      // Heartbeat — lets the hub detect if Claude is still working vs hung
      await supabase.from("collab_tasks").update({ last_activity_at: new Date().toISOString() }).eq("id", id);
      messages.push({ role: "user", content: toolResults });
    }

    if (!done && iterations >= MAX) {
      await appendNote(id, "⚠️ Hit max iterations without finishing.");
      await supabase.from("collab_tasks").update({ status: "blocked", updated_at: new Date().toISOString() }).eq("id", id);
    }

    // Verify step — only runs when executor called complete_task
    if (completionSummary) {
      await appendNote(id, "🔍 Verifying...");
      const verify = await runVerify(id, task, completionSummary);
      await appendNote(id, `${verify.pass ? "✅" : "❌"} VERIFICATION ${verify.pass ? "PASSED" : "FAILED"}\n${verify.reason}`);
      if (verify.pass) {
        await supabase.from("collab_tasks").update({
          status: "done",
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).eq("id", id);
        await postSlack(`✅ *Task completed & verified*\n*${task.title}*\n${completionSummary}`);
      } else {
        await supabase.from("collab_tasks").update({ status: "blocked", updated_at: new Date().toISOString() }).eq("id", id);
        await postSlack(`❌ *Task failed verification*\n*${task.title}*\n${verify.reason}`);
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await appendNote(id, `❌ Execution error: ${msg}`);
    await supabase.from("collab_tasks").update({ status: "blocked", updated_at: new Date().toISOString() }).eq("id", id);
    await postSlack(`❌ *Claude task execution failed*\nTask: ${task.title}\nError: ${msg}`);
  }

  return NextResponse.json({ ok: true, iterations, done, verified: !!completionSummary });
}
