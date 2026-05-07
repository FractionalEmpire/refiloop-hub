#!/usr/bin/env node
/**
 * One-time script to get a Gmail OAuth2 refresh token for david@refiloop.com.
 *
 * Prerequisites:
 *   1. Go to https://console.cloud.google.com/ → APIs & Services → Credentials
 *   2. Enable the Gmail API for your project
 *   3. Create an OAuth2 credential (Application type: "Desktop app")
 *   4. Download the client secret JSON and note the client_id and client_secret
 *
 * Usage:
 *   GMAIL_CLIENT_ID=xxx GMAIL_CLIENT_SECRET=yyy node scripts/gmail-auth.js
 *
 * After running, copy the printed refresh_token into:
 *   - Vercel env vars as GMAIL_REFRESH_TOKEN
 *   - Your local .env.local as GMAIL_REFRESH_TOKEN
 */

const http = require("http");
const { exec } = require("child_process");

const CLIENT_ID = process.env.GMAIL_CLIENT_ID;
const CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET;
const REDIRECT_URI = "http://localhost:3333/callback";
const SCOPES = [
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.readonly",
].join(" ");

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error("Set GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET before running.");
  process.exit(1);
}

const authUrl =
  `https://accounts.google.com/o/oauth2/v2/auth` +
  `?client_id=${encodeURIComponent(CLIENT_ID)}` +
  `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
  `&response_type=code` +
  `&scope=${encodeURIComponent(SCOPES)}` +
  `&access_type=offline` +
  `&prompt=consent`;

console.log("\nOpening browser for Google OAuth...\n");

// Open the browser
const opener =
  process.platform === "win32" ? `start ""` : process.platform === "darwin" ? "open" : "xdg-open";
exec(`${opener} "${authUrl}"`);

// Spin up a local server to capture the callback
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost:3333");
  const code = url.searchParams.get("code");

  if (!code) {
    res.end("No code found. Try again.");
    server.close();
    return;
  }

  res.end("<h2>Auth complete — check your terminal for the refresh token.</h2>");
  server.close();

  // Exchange code for tokens
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri: REDIRECT_URI,
      grant_type: "authorization_code",
    }),
  });

  const tokens = await tokenRes.json();

  if (tokens.error) {
    console.error("\nError exchanging code:", tokens.error_description ?? tokens.error);
    process.exit(1);
  }

  console.log("\n✅ Success! Add these to Vercel env vars and .env.local:\n");
  console.log(`GMAIL_CLIENT_ID=${CLIENT_ID}`);
  console.log(`GMAIL_CLIENT_SECRET=${CLIENT_SECRET}`);
  console.log(`GMAIL_REFRESH_TOKEN=${tokens.refresh_token}`);
  console.log("\nScopes granted:", tokens.scope);
});

server.listen(3333, () => {
  console.log("Waiting for OAuth callback on http://localhost:3333/callback ...");
});
