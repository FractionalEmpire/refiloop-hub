# Deploy RefiLoop Hub to Vercel

## Step 1 — Push to GitHub

Create a new repo (e.g. `refiloop-hub`) in the FractionalEmpire org, then:

```bash
cd refiloop-hub
git init
git add .
git commit -m "initial: refiloop-hub collab app"
git remote add origin https://github.com/FractionalEmpire/refiloop-hub.git
git push -u origin main
```

## Step 2 — Deploy to Vercel

1. Go to https://vercel.com/new
2. Import the `refiloop-hub` repo
3. Set **Project Name** to `refiloop-hub` (URL will be refiloop-hub.vercel.app)
4. Framework: Next.js (auto-detected)

## Step 3 — Add Environment Variables

In Vercel → Settings → Environment Variables, add:

| Name | Value |
|------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://dxvanitpqvvxvroywdml.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | *(from Supabase dashboard → Settings → API)* |
| `DAVID_PASSWORD` | *(pick a password for David)* |
| `GORJAN_PASSWORD` | *(Gorjan's temp password — or set a new one)* |
| `GITHUB_TOKEN` | *(GitHub PAT with repo read/write — github.com/settings/tokens)* |
| `GITHUB_OWNER` | `FractionalEmpire` |
| `GITHUB_REPO` | `refiloop-config` |
| `COOKIE_SECRET` | *(any 32+ char random string)* |

## Step 4 — Deploy

Click Deploy. First deploy takes ~2 min. After that, every push to main auto-deploys.

## Login

- Go to `https://refiloop-hub.vercel.app`
- Select "David" or "Gorjan" and enter the password you set in env vars
