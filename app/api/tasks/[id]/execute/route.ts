import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
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
    description: "Create or update a file in a GitHub repository (commits directly to main)",
    input_schema: {
      type: "object" as const,
      properties: {
        repo: { type: "string" },
        path: { type: "string" },
        content: { type: "string", description: "Full file content (UTF-8)" },
        message: { type: "string", description: "Commit message (will be prefixed with [Claude])" },
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

async function runTool(
  name: string,
  input: Record<string, string>,
  taskId: string
): Promise<{ result: string; terminal?: boolean }> {
  switch (name) {
    case "github_read_file": {
      const ref = input.ref || "main";
      const url = `https://api.github.com/repos/${GITHUB_OWNER}/${input.repo}/contents/${input.path}?ref=${ref}`;
      const res = await fetch(url, {
        headers: { Authorization: `token ${GITHUB_TOKEN}`, Accept: "application/vnd.github.v3+json" },
      });
      if (!res.ok) return { result: `HTTP ${res.status}: ${await res.text()}` };
      const data = await res.json() as { content: string };
      return { result: Buffer.from(data.content, "base64").toString("utf-8") };
    }

    case "github_write_file": {
      // Get existing SHA if file exists
      let sha: string | undefined;
      const existing = await fetch(
        `https://api.github.com/repos/${GITHUB_OWNER}/${input.repo}/contents/${input.path}`,
        { headers: { Authorization: `token ${GITHUB_TOKEN}`, Accept: "application/vnd.github.v3+json" } }
      );
      if (existing.ok) {
        const d = await existing.json() as { sha: string };
        sha = d.sha;
      }

      const body: Record<string, string | undefined> = {
        message: `[Claude] ${input.message}`,
        content: Buffer.from(input.content).toString("base64"),
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
      return { result: `Committed: ${data.commit.html_url}` };
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
      const completionNote = `✅ COMPLETED\n${input.summary}`;
      await appendNote(taskId, completionNote);
      await supabase.from("collab_tasks").update({
        status: "done",
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("id", taskId);
      await postSlack(`✅ *Claude completed a task*\n${input.summary}`);
      return { result: "Task marked done.", terminal: true };
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
  // Simple auth guard
  const key = req.headers.get("x-internal-key");
  if (process.env.INTERNAL_API_KEY && key !== process.env.INTERNAL_API_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = params;
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

Rules:
1. Start by calling log_progress with your understanding of the task and your plan.
2. Read any files you need before modifying them.
3. When writing files, write the complete file content (not diffs).
4. Call log_progress frequently to show your work.
5. Always end with complete_task (success) or mark_blocked (can't finish).
6. The complete_task summary is what David sees — include commit URLs, what changed, and proof it works.`;

  const userContent = `Complete this task:

**Title:** ${task.title}
**Description:** ${task.description || "(none — use the title to infer what's needed)"}
**Project:** ${task.project || "RefiLoop Hub"}
**Priority:** ${task.priority}
**Existing notes:** ${task.notes || "(none)"}

Get started.`;

  const messages: Anthropic.MessageParam[] = [{ role: "user", content: userContent }];
  let done = false;
  let iterations = 0;
  const MAX = 12;

  try {
    while (!done && iterations < MAX) {
      iterations++;
      const response = await anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 4096,
        system: systemPrompt,
        tools,
        messages,
      });

      messages.push({ role: "assistant", content: response.content });

      if (response.stop_reason === "end_turn") {
        // Claude stopped without completing — shouldn't happen if it follows instructions
        await appendNote(id, "⚠️ Claude stopped without calling complete_task or mark_blocked.");
        await supabase.from("collab_tasks").update({ status: "blocked", updated_at: new Date().toISOString() }).eq("id", id);
        break;
      }

      if (response.stop_reason !== "tool_use") break;

      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const block of response.content) {
        if (block.type !== "tool_use") continue;
        const result = await runTool(block.name, block.input as Record<string, string>, id);
        toolResults.push({ type: "tool_result", tool_use_id: block.id, content: result.result });
        if (result.terminal) { done = true; break; }
      }

      messages.push({ role: "user", content: toolResults });
    }

    if (!done && iterations >= MAX) {
      await appendNote(id, "⚠️ Hit max iterations without finishing.");
      await supabase.from("collab_tasks").update({ status: "blocked", updated_at: new Date().toISOString() }).eq("id", id);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await appendNote(id, `❌ Execution error: ${msg}`);
    await supabase.from("collab_tasks").update({ status: "blocked", updated_at: new Date().toISOString() }).eq("id", id);
    await postSlack(`❌ *Claude task execution failed*\nTask: ${task.title}\nError: ${msg}`);
  }

  return NextResponse.json({ ok: true, iterations, done });
}
