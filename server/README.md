# EnglishPod API

Google sign-in and sync of vocabulary and listening history for the EnglishPod
app. Design: `docs/superpowers/specs/2026-09-28-google-auth-sync-design.md`.

The frontend calls this server same-origin under `/api`: Vite proxies it in
development, and `vercel.json` rewrites it in production. The session is an
`HttpOnly` cookie, so there is no CORS and no token in JavaScript.

## Local development

Requires Node 22, pnpm and PostgreSQL.

```bash
cd server
cp .env.example .env        # then fill DATABASE_URL (and GOOGLE_CLIENT_ID if you have one)
pnpm install
createdb englishpod
pnpm prisma migrate dev     # creates the tables
pnpm prisma generate
pnpm dev                    # http://localhost:3001
```

Frontend, in the repo root: copy `.env.example` to `.env.local`, then `pnpm dev`.

| Command | What it does |
| --- | --- |
| `pnpm dev` | API with reload |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm smoke` | End-to-end checks against the DB in `.env` |
| `pnpm session -- you@example.com` | Prints a line to paste into the dev app's console — signs in without Google |
| `pnpm build && pnpm start` | Production build and run |

## Deploy (free: Render + Neon, frontend on Vercel)

1. **Google Cloud Console** → APIs & Services → Credentials → Create OAuth
   client ID → Web application. Authorized JavaScript origins:
   `http://localhost:5173` and the Vercel URL (e.g. `https://english-pod.vercel.app`).
2. **Neon** → new project. Copy the pooled connection string (`DATABASE_URL`)
   and the direct one (`DIRECT_URL`).
3. **Render** → New Web Service from this repo.
   - Root directory: `server`
   - Build command: `npm install -g pnpm@10.12.1 && pnpm install --frozen-lockfile && pnpm prisma migrate deploy && pnpm build`
     (pins pnpm: the lockfile is pnpm 10's format; Node comes from `engines.node`, 22.x)
   - Start command: `pnpm start`
   - Environment: `DATABASE_URL`, `DIRECT_URL`, `GOOGLE_CLIENT_ID`,
     `ALLOWED_ORIGINS=https://<your-app>.vercel.app,http://localhost:5173`,
     `TRUST_PROXY=1`
4. **`vercel.json`** in the repo root: set the rewrite destination to the Render
   URL.
5. **Vercel** → Project → Settings → Environment Variables:
   `VITE_GOOGLE_CLIENT_ID`. Redeploy.
   `vercel.json` also has an `ignoreCommand`, so a commit that only touches
   `server/` does not rebuild the frontend.

After the first deploy, check that rate limiting sees real client addresses:
if every user shares one limit on `/auth/google`, set `TRUST_PROXY=2` (Render's
proxy plus Vercel's).

The free Render instance sleeps after 15 minutes idle; the first request after
that takes 30–60 s (Vercel waits up to 120 s for a rewritten request). The app
syncs in the background, so only signing in waits.
