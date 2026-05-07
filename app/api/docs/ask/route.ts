import { NextRequest, NextResponse } from "next/server";
import { TRACKED_DOCS, getFileContent } from "@/lib/github";

export const runtime = "edge";

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "ANTHROPIC_API_KEY not set in Vercel env vars" }, { status: 500 });

  const { question, filter } = await req.json() as {
    question: string;
    filter?: { group?: string; tags?: string[] };
  };

  if (!question?.trim()) return NextResponse.json({ error: "question required" }, { status: 400 });

  // Filter docs to those matching the current sidebar filter
  let docsToLoad = TRACKED_DOCS;
  if (filter?.group && filter.group !== "All") {
    docsToLoad = docsToLoad.filter((d) => d.group === filter.group);
  }
  if (filter?.tags?.length) {
    docsToLoad = docsToLoad.filter((d) => d.tags?.some((t) => filter.tags!.includes(t)));
  }

  // Fetch content in parallel
  const contents = await Promise.all(
    docsToLoad.map(async (doc) => {
      const file = await getFileContent(doc.path);
      if (!file) return null;
      return { label: doc.label, path: doc.path, group: doc.group, content: file.content };
    })
  );

  const loaded = contents.filter(Boolean) as { label: string; path: string; group: string; content: string }[];

  if (loaded.length === 0) {
    return NextResponse.json({ error: "No docs could be loaded — check GITHUB_TOKEN" }, { status: 500 });
  }

  const docContext = loaded
    .map((d) => `### ${d.label} (${d.path})\n\n${d.content}`)
    .join("\n\n---\n\n");

  const system = `You are a helpful assistant for the RefiLoop commercial mortgage team. \
Answer questions using ONLY the documentation provided below. \
If the answer isn't in the docs, say so clearly. \
When citing information, mention the document name. \
Keep answers concise and practical.

The following ${loaded.length} documentation files are available:

${docContext}`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      system,
      messages: [{ role: "user", content: question }],
      stream: true,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    return NextResponse.json({ error: err }, { status: res.status });
  }

  return new NextResponse(res.body, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
    },
  });
}
