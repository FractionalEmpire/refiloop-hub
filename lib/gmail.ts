// Gmail API helpers — no googleapis dep, plain fetch only.
// Requires env vars: GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const GMAIL_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

let cachedToken: { token: string; expiresAt: number } | null = null;

export async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) {
    return cachedToken.token;
  }
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GMAIL_CLIENT_ID!,
      client_secret: process.env.GMAIL_CLIENT_SECRET!,
      refresh_token: process.env.GMAIL_REFRESH_TOKEN!,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gmail token refresh failed: ${text}`);
  }
  const json = await res.json();
  cachedToken = {
    token: json.access_token as string,
    expiresAt: Date.now() + (json.expires_in as number) * 1000,
  };
  return cachedToken.token;
}

export async function sendEmail(
  to: string,
  subject: string,
  bodyText: string
): Promise<{ messageId: string; threadId: string }> {
  const token = await getAccessToken();

  const rawLines = [
    `To: ${to}`,
    `From: david@refiloop.com`,
    `Subject: ${subject}`,
    `Content-Type: text/plain; charset=UTF-8`,
    ``,
    bodyText,
  ];
  const raw = Buffer.from(rawLines.join("\r\n"))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const res = await fetch(`${GMAIL_BASE}/messages/send`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ raw }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gmail send failed: ${text}`);
  }
  const json = await res.json();
  return { messageId: json.id as string, threadId: json.threadId as string };
}

export interface InboxMessage {
  messageId: string;
  threadId: string;
  fromEmail: string;
  fromName: string;
  subject: string;
  snippet: string;
  bodyText: string;
  date: string;
}

export async function fetchInboxSince(sinceMs: number): Promise<InboxMessage[]> {
  const token = await getAccessToken();

  const afterSec = Math.floor(sinceMs / 1000);
  const query = `in:inbox after:${afterSec}`;

  const listRes = await fetch(
    `${GMAIL_BASE}/messages?q=${encodeURIComponent(query)}&maxResults=50`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!listRes.ok) return [];

  const listJson = await listRes.json();
  const messages: Array<{ id: string }> = listJson.messages ?? [];
  if (messages.length === 0) return [];

  const results: InboxMessage[] = [];

  await Promise.all(
    messages.map(async ({ id }) => {
      const msgRes = await fetch(
        `${GMAIL_BASE}/messages/${id}?format=full`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!msgRes.ok) return;
      const msg = await msgRes.json();

      const headers: Array<{ name: string; value: string }> =
        msg.payload?.headers ?? [];
      const get = (name: string) =>
        headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";

      const fromRaw = get("From");
      const fromEmail = (fromRaw.match(/<([^>]+)>/) ?? [, fromRaw])[1] ?? fromRaw;
      const fromName = fromRaw.replace(/<[^>]+>/, "").trim().replace(/^"|"$/g, "");

      const bodyText = extractBodyText(msg.payload);

      results.push({
        messageId: id as string,
        threadId: msg.threadId as string,
        fromEmail: fromEmail.toLowerCase(),
        fromName,
        subject: get("Subject"),
        snippet: msg.snippet ?? "",
        bodyText,
        date: new Date(parseInt(msg.internalDate as string)).toISOString(),
      });
    })
  );

  return results;
}

export async function fetchEODEmails(sinceMs: number): Promise<InboxMessage[]> {
  const token = await getAccessToken();
  const afterSec = Math.floor(sinceMs / 1000);
  const query = `in:inbox after:${afterSec} (subject:EOD OR subject:"end of day" OR from:gorjan)`;
  const listRes = await fetch(
    `${GMAIL_BASE}/messages?q=${encodeURIComponent(query)}&maxResults=20`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!listRes.ok) return [];
  const listJson = await listRes.json();
  const messages: Array<{ id: string }> = listJson.messages ?? [];
  if (!messages.length) return [];
  const results: InboxMessage[] = [];
  await Promise.all(
    messages.map(async ({ id }) => {
      const msgRes = await fetch(
        `${GMAIL_BASE}/messages/${id}?format=full`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!msgRes.ok) return;
      const msg = await msgRes.json();
      const headers: Array<{ name: string; value: string }> = msg.payload?.headers ?? [];
      const get = (name: string) =>
        headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";
      const fromRaw = get("From");
      const fromEmail = (fromRaw.match(/<([^>]+)>/) ?? [, fromRaw])[1] ?? fromRaw;
      const fromName = fromRaw.replace(/<[^>]+>/, "").trim().replace(/^"|"$/g, "");
      results.push({
        messageId: id as string,
        threadId: msg.threadId as string,
        fromEmail: (fromEmail as string).toLowerCase(),
        fromName,
        subject: get("Subject"),
        snippet: msg.snippet ?? "",
        bodyText: extractBodyText(msg.payload),
        date: new Date(parseInt(msg.internalDate as string)).toISOString(),
      });
    })
  );
  return results;
}

function extractBodyText(payload: Record<string, unknown> | null | undefined): string {
  if (!payload) return "";

  const mimeType = payload.mimeType as string | undefined;
  if (mimeType === "text/plain") {
    const data = (payload.body as Record<string, string> | undefined)?.data ?? "";
    return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8");
  }

  const parts = (payload.parts as Record<string, unknown>[] | undefined) ?? [];
  for (const part of parts) {
    if ((part.mimeType as string) === "text/plain") {
      const data = (part.body as Record<string, string> | undefined)?.data ?? "";
      return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8");
    }
  }
  for (const part of parts) {
    if (!(part.mimeType as string).includes("html")) {
      const text = extractBodyText(part as Record<string, unknown>);
      if (text) return text;
    }
  }
  return "";
}
