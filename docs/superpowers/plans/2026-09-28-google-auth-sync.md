# Google Sign-In + History Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A TypeScript/Express backend with Google sign-in that stores vocabulary study history and audio listening history, and a local-first frontend that keeps using localStorage and syncs in the background once signed in.

**Architecture:** `server/` is a standalone Express 5 app on PostgreSQL (Prisma 7 + `@prisma/adapter-pg`). One endpoint, `POST /sync`, takes a device's changes and returns everything newer than the device's cursor; last-write-wins merging happens in SQL (`INSERT … ON CONFLICT … WHERE updated_at < EXCLUDED.updated_at`) so thousands of cards go in one statement. The React app keeps its localStorage stores as the UI's source; `src/lib/sync.js` pushes/pulls on a timer.

**Tech Stack:** Node 22, TypeScript 7 (`tsc`, `tsx`), Express 5.2, Prisma 7.10 (`prisma-client` generator, `prisma.config.ts`), PostgreSQL 17 locally / Neon in prod, zod 4, google-auth-library 11, express-rate-limit 8. Frontend stays React 19 + JavaScript.

**Spec:** `docs/superpowers/specs/2026-09-28-google-auth-sync-design.md` (see its "Điều chỉnh khi lập kế hoạch" section for the deltas this plan introduces).

**Verification, not unit tests:** the user chose not to use a test framework. The TDD loop here is: add checks to `server/scripts/smoke.ts` first, watch them fail, implement, watch them pass. Frontend is verified in the browser.

**Environment facts (checked on this machine):**
- Use Node 22: `source ~/.nvm/nvm.sh && nvm use 22.18.0` in every shell (default is 20.9.0, which breaks Vite).
- Local Postgres 17 is running and reachable over the Unix socket at `/tmp` as user `nguyensang` without a password. TCP to `localhost` asks for a password, so URLs use `?host=/tmp`.
- `npm view prisma version` returns an 8.0 RC — **pin 7.10.0**.
- Prisma 7: `migrate dev` no longer runs `generate`; the datasource URL lives in `prisma.config.ts`, not in `schema.prisma`; the client needs a driver adapter.

---

## File map

**Server (new, `server/`)**

| File | Responsibility |
| --- | --- |
| `package.json`, `tsconfig.json`, `.gitignore`, `.env.example` | Project setup |
| `prisma.config.ts` | Prisma CLI config (schema path, migrations, URL) |
| `prisma/schema.prisma` | Tables |
| `prisma/migrations/*_init/migration.sql` | Generated DDL + `sync_rev` sequence |
| `src/config.ts` | Read env once into an `AppConfig` |
| `src/db.ts` | Prisma client singleton |
| `src/errors.ts` | `HttpError`, 404 handler, error → JSON handler |
| `src/rateLimit.ts` | Rate limiter factory that answers in the standard error shape |
| `src/app.ts` | `createApp(config)`: middleware + routes |
| `src/index.ts` | Entry point: `listen` |
| `src/auth/google.ts` | Verify a Google ID token → profile |
| `src/auth/sessions.ts` | Create/revoke sessions, `requireAuth`, `authOf` |
| `src/routes/auth.ts` | `/auth/google`, `/auth/logout`, `/me`, `toPublicUser` |
| `src/sync/schema.ts` | zod schema + `SyncRequest` type |
| `src/sync/wire.ts` | Response types, DB row → JSON mappers, `latestBy` |
| `src/sync/service.ts` | `runSync`: the transaction |
| `src/routes/sync.ts` | `/sync` |
| `scripts/smoke.ts` | End-to-end checks |
| `scripts/create-session.ts` | Dev sign-in without Google |
| `README.md` | Setup + deploy |

**Frontend**

| File | Change |
| --- | --- |
| `src/lib/api.js` | New: fetch wrapper, `apiEnabled` |
| `src/lib/auth.js` | New: signed-in user store |
| `src/lib/googleSignIn.js` | New: load GIS, render button |
| `src/lib/uuid.js` | New: `uuid()` with a fallback for plain-http dev |
| `src/lib/srsStore.js` | `updatedAt`, tombstones, review logs, sync helpers |
| `src/lib/listeningStore.js` | New: listening history |
| `src/lib/sync.js` | New: sign-in/out, background sync |
| `src/components/AccountButton.jsx` | New: Google button / avatar menu |
| `src/components/AudioPlayer.jsx` | Record listening history, resume position |
| `src/App.jsx` | Last episode from settings, mount `AccountButton` |
| `src/main.jsx` | `startSync()` |
| `.env.example`, `eslint.config.js`, `.github/workflows/deploy.yml` | Config |

---

### Task 1: Server project and database schema

**Files:**
- Create: `server/package.json`, `server/tsconfig.json`, `server/.gitignore`, `server/.env.example`, `server/.env` (not committed), `server/prisma.config.ts`, `server/prisma/schema.prisma`, `server/src/db.ts`
- Create (generated): `server/prisma/migrations/<timestamp>_init/migration.sql`

- [ ] **Step 1: Create the package and install pinned dependencies**

```bash
source ~/.nvm/nvm.sh && nvm use 22.18.0
mkdir -p server && cd server
npm init -y
npm pkg set name=englishpod-server private=true version=0.0.0 type=module engines.node=">=22"
npm pkg delete main scripts.test keywords author license description
npm pkg set \
  scripts.dev="tsx watch --env-file=.env src/index.ts" \
  scripts.build="prisma generate && tsc" \
  scripts.start="node dist/src/index.js" \
  scripts.typecheck="prisma generate && tsc --noEmit" \
  scripts.smoke="tsx --env-file=.env scripts/smoke.ts" \
  scripts.session="tsx --env-file=.env scripts/create-session.ts"
npm i express@5.2.1 @prisma/client@7.10.0 @prisma/adapter-pg@7.10.0 zod@4.6.5 google-auth-library@11.1.0 cors@2.8.6 express-rate-limit@8.7.0
npm i -D prisma@7.10.0 typescript@7.0.2 tsx@4.23.15 dotenv@18.0.4 @types/express@5.0.6 @types/cors@2.8.19 @types/node@22
```

Expected: both installs finish without `ERR!`.

- [ ] **Step 2: Write `server/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "es2023",
    "module": "nodenext",
    "moduleResolution": "nodenext",
    "strict": true,
    "rootDir": ".",
    "outDir": "dist",
    "skipLibCheck": true,
    "sourceMap": true
  },
  "include": ["src", "scripts"]
}
```

- [ ] **Step 3: Write `server/.gitignore`, `server/.env.example` and `server/.env`**

`server/.gitignore`:

```
node_modules
dist
.env
src/generated
```

`server/.env.example`:

```bash
# Pooled connection for the app. On Neon: the "-pooler" host.
DATABASE_URL="postgresql://USER:PASSWORD@HOST/englishpod?sslmode=require"
# Direct connection for migrations (Neon: host without "-pooler"). Optional locally.
DIRECT_URL=""
# OAuth 2.0 Client ID (Web application) from Google Cloud Console.
GOOGLE_CLIENT_ID=""
# Comma-separated origins allowed to call the API.
CORS_ORIGINS="http://localhost:5173"
PORT=3000
```

`server/.env` (local only — the socket host is how this machine's Postgres accepts passwordless logins):

```bash
DATABASE_URL="postgresql://nguyensang@localhost:5432/englishpod?host=/tmp"
GOOGLE_CLIENT_ID=""
CORS_ORIGINS="http://localhost:5173"
PORT=3000
```

- [ ] **Step 4: Write `server/prisma.config.ts`**

```ts
import 'dotenv/config'
import { defineConfig } from 'prisma/config'

// Migrations need a direct connection; Neon's pooled URL is for the app itself.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: process.env.DIRECT_URL || process.env.DATABASE_URL },
})
```

- [ ] **Step 5: Write `server/prisma/schema.prisma`**

```prisma
// Timestamps that come from devices (updated_at, due, reviewed_at, …) are epoch
// milliseconds in BigInt columns, the unit Date.now() and src/lib/srs.js use.
// `rev` comes from the sync_rev sequence on every write; /sync pulls rows with
// rev above the device's cursor.

generator client {
  provider = "prisma-client"
  output   = "../src/generated/prisma"
}

datasource db {
  provider = "postgresql"
}

model User {
  id          String      @id @default(uuid()) @db.Uuid
  googleSub   String      @unique @map("google_sub")
  email       String
  name        String
  avatarUrl   String?     @map("avatar_url")
  resetAt     BigInt?     @map("reset_at")
  createdAt   DateTime    @default(now()) @map("created_at")
  lastLoginAt DateTime    @default(now()) @map("last_login_at")
  sessions    Session[]
  settings    Settings?
  decks       Deck[]
  cards       Card[]
  reviewLogs  ReviewLog[]
  legacyDays  LegacyDay[]
  listening   Listening[]

  @@map("users")
}

model Session {
  id         String   @id @default(uuid()) @db.Uuid
  userId     String   @map("user_id") @db.Uuid
  tokenHash  String   @unique @map("token_hash")
  createdAt  DateTime @default(now()) @map("created_at")
  lastUsedAt DateTime @default(now()) @map("last_used_at")
  expiresAt  DateTime @map("expires_at")
  user       User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@map("sessions")
}

model Settings {
  userId        String  @id @map("user_id") @db.Uuid
  autoSpeak     Boolean @map("auto_speak")
  lastEpisodeId Int?    @map("last_episode_id")
  updatedAt     BigInt  @map("updated_at")
  rev           BigInt
  user          User    @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@map("settings")
}

model Deck {
  userId    String  @map("user_id") @db.Uuid
  episodeId Int     @map("episode_id")
  addedAt   BigInt  @map("added_at")
  updatedAt BigInt  @map("updated_at")
  deletedAt BigInt? @map("deleted_at")
  rev       BigInt
  user      User    @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@id([userId, episodeId])
  @@index([userId, rev])
  @@map("decks")
}

model Card {
  userId     String  @map("user_id") @db.Uuid
  cardId     String  @map("card_id")
  word       String
  ipa        String
  type       String
  def        String
  vi         String
  viDef      String  @map("vi_def")
  episodeIds Int[]   @map("episode_ids")
  state      String
  step       Int
  ease       Float
  interval   Float
  due        BigInt
  reps       Int
  lapses     Int
  addedAt    BigInt  @map("added_at")
  lastReview BigInt? @map("last_review")
  updatedAt  BigInt  @map("updated_at")
  deletedAt  BigInt? @map("deleted_at")
  rev        BigInt
  user       User    @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@id([userId, cardId])
  @@index([userId, rev])
  @@map("cards")
}

model ReviewLog {
  id             String @id @db.Uuid
  userId         String @map("user_id") @db.Uuid
  cardId         String @map("card_id")
  rating         String
  stateBefore    String @map("state_before")
  intervalBefore Float  @map("interval_before")
  intervalAfter  Float  @map("interval_after")
  reviewedAt     BigInt @map("reviewed_at")
  day            String
  user           User   @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, day])
  @@map("review_logs")
}

model LegacyDay {
  userId     String @map("user_id") @db.Uuid
  importId   String @map("import_id") @db.Uuid
  day        String
  reviews    Int
  learned    Int
  importedAt BigInt @map("imported_at")
  user       User   @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@id([userId, importId, day])
  @@map("legacy_days")
}

model Listening {
  userId        String  @map("user_id") @db.Uuid
  episodeId     Int     @map("episode_id")
  positionSec   Float   @map("position_sec")
  durationSec   Float   @map("duration_sec")
  playCount     Int     @map("play_count")
  completedAt   BigInt? @map("completed_at")
  firstPlayedAt BigInt  @map("first_played_at")
  lastPlayedAt  BigInt  @map("last_played_at")
  updatedAt     BigInt  @map("updated_at")
  rev           BigInt
  user          User    @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@id([userId, episodeId])
  @@index([userId, rev])
  @@map("listening")
}
```

- [ ] **Step 6: Create the database and the first migration, adding the sequence by hand**

```bash
cd server
createdb englishpod
npx prisma migrate dev --name init --create-only
for f in prisma/migrations/*_init/migration.sql; do printf '\n-- Every write to a synced table takes the next value; see prisma/schema.prisma.\nCREATE SEQUENCE "sync_rev";\n' >> "$f"; done
npx prisma migrate dev
npx prisma generate
```

Expected: `Your database is now in sync with your schema.` and `Generated Prisma Client (7.10.0) to ./src/generated/prisma`.

Check: `psql -d englishpod -Atc "\ds"` lists `sync_rev`.

- [ ] **Step 7: Write `server/src/db.ts`**

```ts
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from './generated/prisma/client.js'

const connectionString = process.env.DATABASE_URL
if (!connectionString) throw new Error('Missing env DATABASE_URL')

export const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) })
```

- [ ] **Step 8: Typecheck**

Run: `cd server && npx tsc --noEmit`
Expected: no output, exit 0.

- [ ] **Step 9: Commit**

```bash
git add server/package.json server/package-lock.json server/tsconfig.json server/.gitignore server/.env.example server/prisma.config.ts server/prisma server/src/db.ts
git commit -m "feat(server): scaffold TypeScript server with Prisma schema"
```

---

### Task 2: App skeleton, error format, health check

**Files:**
- Create: `server/src/config.ts`, `server/src/errors.ts`, `server/src/rateLimit.ts`, `server/src/app.ts`, `server/src/index.ts`

- [ ] **Step 1: Write `server/src/config.ts`**

```ts
export interface AppConfig {
  port: number
  /** Empty when not set up yet: /auth/google then answers 503 instead of trusting any token. */
  googleClientId: string
  corsOrigins: string[]
}

export function loadConfig(env = process.env): AppConfig {
  return {
    port: Number(env.PORT ?? 3000),
    googleClientId: env.GOOGLE_CLIENT_ID ?? '',
    corsOrigins: (env.CORS_ORIGINS ?? '')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  }
}
```

- [ ] **Step 2: Write `server/src/errors.ts`**

```ts
import type { ErrorRequestHandler, RequestHandler } from 'express'
import { ZodError, z } from 'zod'

/** An error meant for the client: sent as { error: { code, message } }. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message)
  }
}

export const notFound: RequestHandler = (_req, _res, next) => {
  next(new HttpError(404, 'not_found', 'Not found'))
}

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  let error: HttpError
  if (err instanceof HttpError) {
    error = err
  } else if (err instanceof ZodError) {
    error = new HttpError(400, 'invalid_request', z.prettifyError(err))
  } else if (err?.type === 'entity.too.large') {
    error = new HttpError(413, 'payload_too_large', 'Request body too large')
  } else if (err?.type === 'entity.parse.failed') {
    error = new HttpError(400, 'invalid_request', 'Malformed JSON')
  } else {
    console.error(err)
    error = new HttpError(500, 'internal', 'Internal server error')
  }
  res.status(error.status).json({ error: { code: error.code, message: error.message } })
}
```

- [ ] **Step 3: Write `server/src/rateLimit.ts`**

```ts
import { rateLimit } from 'express-rate-limit'
import { HttpError } from './errors.js'

/** Per-IP limiter that answers in the same error shape as everything else. */
export function limitPerIp(windowMs: number, limit: number) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, _res, next) => next(new HttpError(429, 'rate_limited', 'Too many requests')),
  })
}
```

- [ ] **Step 4: Write `server/src/app.ts` (routes are added in Tasks 3 and 4)**

```ts
import cors from 'cors'
import express from 'express'
import type { AppConfig } from './config.js'
import { errorHandler, notFound } from './errors.js'

export function createApp(config: AppConfig) {
  const app = express()
  // Render terminates TLS in a proxy; this makes req.ip the client's address,
  // which is what the rate limiters key on.
  app.set('trust proxy', 1)
  app.use(
    cors({
      origin: config.corsOrigins,
      methods: ['GET', 'POST'],
      allowedHeaders: ['Authorization', 'Content-Type'],
      maxAge: 86_400,
    }),
  )
  // A first sync uploads the whole local collection (~4,000 cards is ~1.5 MB).
  app.use(express.json({ limit: '5mb' }))

  // Also what the frontend hits to wake a sleeping free-tier instance.
  app.get('/health', (_req, res) => {
    res.json({ ok: true })
  })

  app.use(notFound)
  app.use(errorHandler)
  return app
}
```

- [ ] **Step 5: Write `server/src/index.ts`**

```ts
import { createApp } from './app.js'
import { loadConfig } from './config.js'

const config = loadConfig()
if (!config.googleClientId) console.warn('GOOGLE_CLIENT_ID is not set: Google sign-in is disabled')

createApp(config).listen(config.port, () => {
  console.log(`API listening on http://localhost:${config.port}`)
})
```

- [ ] **Step 6: Run it and hit the health check**

```bash
cd server && npm run dev
# in another shell:
curl -s localhost:3000/health; echo
curl -s localhost:3000/nope; echo
```

Expected: `{"ok":true}` then `{"error":{"code":"not_found","message":"Not found"}}`. If `tsx watch --env-file` is rejected, change the script to `node --env-file=.env --watch --import tsx src/index.ts` (same for `smoke`/`session`, without `--watch`). Stop the server.

- [ ] **Step 7: Typecheck and commit**

```bash
cd server && npx tsc --noEmit
git add server/src
git commit -m "feat(server): express app with health check and error format"
```

---

### Task 3: Sessions and Google sign-in

**Files:**
- Create: `server/scripts/smoke.ts`, `server/src/auth/google.ts`, `server/src/auth/sessions.ts`, `server/src/routes/auth.ts`
- Modify: `server/src/app.ts`

- [ ] **Step 1: Write the smoke script with the auth checks (they fail first)**

`server/scripts/smoke.ts`:

```ts
// End-to-end check of the API against a real database. Creates its own user,
// plays two "devices" of that user against /sync, and deletes the user at the
// end. Run with `npm run smoke` (uses DATABASE_URL from .env).

import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import type { AddressInfo } from 'node:net'
import { createApp } from '../src/app.js'
import { createSession } from '../src/auth/sessions.js'
import { prisma } from '../src/db.js'

const server = createApp({
  port: 0,
  googleClientId: 'smoke-test.apps.googleusercontent.com',
  corsOrigins: [],
}).listen(0)
await new Promise((resolve) => server.once('listening', resolve))
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`

interface CallOptions {
  method?: string
  token?: string
  body?: unknown
}

async function call(path: string, { method = 'GET', token, body }: CallOptions = {}) {
  const headers: Record<string, string> = {}
  if (token) headers.Authorization = `Bearer ${token}`
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const res = await fetch(base + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  return { status: res.status, body: (text ? JSON.parse(text) : null) as any }
}

let failures = 0
async function check(name: string, run: () => Promise<void>) {
  try {
    await run()
    console.log(`✓ ${name}`)
  } catch (error) {
    failures++
    console.error(`✗ ${name}\n`, error)
  }
}

const user = await prisma.user.create({
  data: { googleSub: `smoke:${randomUUID()}`, email: 'smoke@example.com', name: 'Smoke' },
})
const token = await createSession(user.id)

// --- auth checks ---

await check('health', async () => {
  const res = await call('/health')
  assert.equal(res.status, 200)
  assert.deepEqual(res.body, { ok: true })
})

await check('/me without a token is 401', async () => {
  const res = await call('/me')
  assert.equal(res.status, 401)
  assert.equal(res.body.error.code, 'unauthorized')
})

await check('/me with an unknown token is 401', async () => {
  const res = await call('/me', { token: 'not-a-real-token' })
  assert.equal(res.status, 401)
})

await check('/me returns the signed-in user', async () => {
  const res = await call('/me', { token })
  assert.equal(res.status, 200)
  assert.equal(res.body.user.id, user.id)
  assert.equal(res.body.user.email, 'smoke@example.com')
})

await check('a bad Google credential is 401 invalid_google_token', async () => {
  const res = await call('/auth/google', { method: 'POST', body: { credential: 'garbage' } })
  assert.equal(res.status, 401)
  assert.equal(res.body.error.code, 'invalid_google_token')
})

await check('a missing credential is 400', async () => {
  const res = await call('/auth/google', { method: 'POST', body: {} })
  assert.equal(res.status, 400)
  assert.equal(res.body.error.code, 'invalid_request')
})

// --- sync checks ---

await check('logout revokes the session', async () => {
  const other = await createSession(user.id)
  const res = await call('/auth/logout', { method: 'POST', token: other })
  assert.equal(res.status, 204)
  assert.equal((await call('/me', { token: other })).status, 401)
  assert.equal((await call('/me', { token })).status, 200)
})

await prisma.user.delete({ where: { id: user.id } })
server.close()
await prisma.$disconnect()
if (failures) {
  console.error(`\n${failures} check(s) failed`)
  process.exitCode = 1
} else {
  console.log('\nAll checks passed')
}
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd server && npm run smoke`
Expected: fails to start with `Cannot find module '../src/auth/sessions.js'` (or similar). That is the red step.

- [ ] **Step 3: Write `server/src/auth/sessions.ts`**

```ts
import { createHash, randomBytes } from 'node:crypto'
import type { RequestHandler, Response } from 'express'
import { prisma } from '../db.js'
import { HttpError } from '../errors.js'

const DAY_MS = 24 * 60 * 60 * 1000
// Sliding: every use (at most once a day) pushes the expiry this far out.
const SESSION_DAYS = 30

export interface SessionAuth {
  userId: string
  sessionId: string
}

/** Only the hash is stored, so a database leak does not leak usable tokens. */
function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

export async function createSession(userId: string): Promise<string> {
  const token = randomBytes(32).toString('base64url')
  await prisma.session.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + SESSION_DAYS * DAY_MS),
    },
  })
  return token
}

export async function revokeSession(sessionId: string) {
  await prisma.session.deleteMany({ where: { id: sessionId } })
}

/** Rejects the request unless it carries `Authorization: Bearer <live session token>`. */
export const requireAuth: RequestHandler = async (req, res, next) => {
  const match = /^Bearer (\S+)$/.exec(req.get('authorization') ?? '')
  if (!match) throw new HttpError(401, 'unauthorized', 'Missing token')

  const session = await prisma.session.findUnique({ where: { tokenHash: hashToken(match[1]) } })
  const now = Date.now()
  if (!session || session.expiresAt.getTime() <= now) {
    throw new HttpError(401, 'unauthorized', 'Session expired')
  }
  if (now - session.lastUsedAt.getTime() > DAY_MS) {
    await prisma.session.update({
      where: { id: session.id },
      data: { lastUsedAt: new Date(now), expiresAt: new Date(now + SESSION_DAYS * DAY_MS) },
    })
  }

  res.locals.auth = { userId: session.userId, sessionId: session.id } satisfies SessionAuth
  next()
}

/** The session requireAuth attached to this response. */
export function authOf(res: Response): SessionAuth {
  return res.locals.auth as SessionAuth
}
```

- [ ] **Step 4: Write `server/src/auth/google.ts`**

```ts
import { OAuth2Client } from 'google-auth-library'
import { HttpError } from '../errors.js'

export interface GoogleProfile {
  sub: string
  email: string
  name: string
  avatarUrl: string | null
}

const client = new OAuth2Client()

/** Check an ID token from Google Identity Services and return who it is for. */
export async function verifyGoogleCredential(
  credential: string,
  clientId: string,
): Promise<GoogleProfile> {
  // Without an audience verifyIdToken accepts tokens minted for any app.
  if (!clientId) throw new HttpError(503, 'google_not_configured', 'Google sign-in is not configured')

  let payload
  try {
    const ticket = await client.verifyIdToken({ idToken: credential, audience: clientId })
    payload = ticket.getPayload()
  } catch {
    throw new HttpError(401, 'invalid_google_token', 'Google sign-in failed')
  }
  if (!payload?.email || !payload.email_verified) {
    throw new HttpError(401, 'invalid_google_token', 'Google account has no verified email')
  }
  return {
    sub: payload.sub,
    email: payload.email,
    name: payload.name ?? payload.email,
    avatarUrl: payload.picture ?? null,
  }
}
```

- [ ] **Step 5: Write `server/src/routes/auth.ts`**

```ts
import { Router } from 'express'
import { z } from 'zod'
import { verifyGoogleCredential } from '../auth/google.js'
import { authOf, createSession, requireAuth, revokeSession } from '../auth/sessions.js'
import type { AppConfig } from '../config.js'
import { prisma } from '../db.js'
import type { User } from '../generated/prisma/client.js'
import { limitPerIp } from '../rateLimit.js'

export function toPublicUser(user: User) {
  return { id: user.id, email: user.email, name: user.name, avatarUrl: user.avatarUrl }
}

const googleBody = z.object({ credential: z.string().min(1).max(10_000) })

export function authRoutes(config: AppConfig) {
  const router = Router()
  const authLimit = limitPerIp(15 * 60 * 1000, 20)

  router.post('/auth/google', authLimit, async (req, res) => {
    const { credential } = googleBody.parse(req.body)
    const profile = await verifyGoogleCredential(credential, config.googleClientId)
    const fields = { email: profile.email, name: profile.name, avatarUrl: profile.avatarUrl }
    const user = await prisma.user.upsert({
      where: { googleSub: profile.sub },
      create: { googleSub: profile.sub, ...fields },
      update: { ...fields, lastLoginAt: new Date() },
    })
    const token = await createSession(user.id)
    res.json({ token, user: toPublicUser(user) })
  })

  router.post('/auth/logout', authLimit, requireAuth, async (_req, res) => {
    await revokeSession(authOf(res).sessionId)
    res.status(204).end()
  })

  router.get('/me', requireAuth, async (_req, res) => {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: authOf(res).userId } })
    res.json({ user: toPublicUser(user) })
  })

  return router
}
```

- [ ] **Step 6: Mount the routes in `server/src/app.ts`**

Add the import after the existing ones:

```ts
import { authRoutes } from './routes/auth.js'
```

Insert before `app.use(notFound)`:

```ts
  app.use(authRoutes(config))
```

- [ ] **Step 7: Run the smoke script — all green**

Run: `cd server && npm run smoke`
Expected: 7 lines starting with `✓`, then `All checks passed`. The Google check needs network access to fetch Google's certificates; offline it still answers 401 `invalid_google_token`.

- [ ] **Step 8: Typecheck and commit**

```bash
cd server && npx tsc --noEmit
git add server/src server/scripts/smoke.ts
git commit -m "feat(server): Google sign-in and bearer sessions"
```

---

### Task 4: `POST /sync`

**Files:**
- Create: `server/src/sync/schema.ts`, `server/src/sync/wire.ts`, `server/src/sync/service.ts`, `server/src/routes/sync.ts`
- Modify: `server/scripts/smoke.ts` (replace the `// --- sync checks ---` line), `server/src/app.ts`

- [ ] **Step 1: Add the sync checks to the smoke script**

In `server/scripts/smoke.ts`, replace the single line `// --- sync checks ---` with:

```ts
// --- sync checks ---

interface Device {
  cursor: number | null
}
const A: Device = { cursor: null }
const B: Device = { cursor: null }

async function sync(device: Device, changes: Record<string, unknown> = {}) {
  const res = await call('/sync', { method: 'POST', token, body: { cursor: device.cursor, changes } })
  assert.equal(res.status, 200, JSON.stringify(res.body))
  device.cursor = res.body.cursor
  return res.body
}

function card(id: string, updatedAt: number, extra: Record<string, unknown> = {}) {
  return {
    id, word: id, ipa: '', type: 'n', def: '', vi: '', viDef: '', episodeIds: [1],
    state: 'new', step: 0, ease: 2.5, interval: 0, due: updatedAt, reps: 0, lapses: 0,
    addedAt: updatedAt, lastReview: null, updatedAt, ...extra,
  }
}

function reviewLog(cardId: string, day: string) {
  return {
    id: randomUUID(), cardId, rating: 'good', stateBefore: 'new',
    intervalBefore: 0, intervalAfter: 1, reviewedAt: Date.parse(day), day,
  }
}

await check('/sync without a token is 401', async () => {
  const res = await call('/sync', { method: 'POST', body: { cursor: null, changes: {} } })
  assert.equal(res.status, 401)
})

await check('/sync with a malformed body is 400', async () => {
  const res = await call('/sync', { method: 'POST', token, body: { cursor: 'x', changes: {} } })
  assert.equal(res.status, 400)
  assert.equal(res.body.error.code, 'invalid_request')
})

await check('what A pushes, B pulls', async () => {
  await sync(A, {
    cards: [card('apple', 1000), card('pear', 1000)],
    decks: [{ episodeId: 1, addedAt: 1000, updatedAt: 1000 }],
  })
  const res = await sync(B)
  assert.deepEqual(res.changes.cards.map((c: { id: string }) => c.id).sort(), ['apple', 'pear'])
  assert.deepEqual(res.changes.decks, [{ episodeId: 1, addedAt: 1000, updatedAt: 1000 }])
})

await check('the later edit of a card wins on both devices', async () => {
  await sync(A, { cards: [card('apple', 2000, { reps: 1 })] })
  const b = await sync(B, { cards: [card('apple', 1500, { reps: 5 })] })
  assert.equal(b.changes.cards.find((c: { id: string }) => c.id === 'apple').reps, 1)
  const a = await sync(A)
  assert.equal(a.changes.cards.length, 0, 'the rejected edit must not bump rev')
})

await check('deleting a deck and a card reaches the other device', async () => {
  await sync(A, {
    deletedDecks: [{ episodeId: 1, deletedAt: 3000 }],
    deletedCards: [{ id: 'pear', deletedAt: 3000 }],
  })
  const b = await sync(B)
  assert.deepEqual(b.changes.deletedDecks, [{ episodeId: 1, deletedAt: 3000 }])
  assert.deepEqual(b.changes.deletedCards, [{ id: 'pear', deletedAt: 3000 }])
})

await check('a review log sent twice is counted once', async () => {
  const log = reviewLog('apple', '2026-09-01')
  await sync(A, { reviewLogs: [log] })
  const res = await sync(A, { reviewLogs: [log] })
  assert.deepEqual(res.days['2026-09-01'], { reviews: 1, learned: 1 })
})

await check('legacy days: same import once, different imports add up', async () => {
  const importA = { importId: randomUUID(), days: { '2026-08-01': { reviews: 10, learned: 3 } } }
  await sync(A, { legacyDays: importA })
  const again = await sync(A, { legacyDays: importA })
  assert.deepEqual(again.days['2026-08-01'], { reviews: 10, learned: 3 })
  const importB = { importId: randomUUID(), days: { '2026-08-01': { reviews: 5, learned: 1 } } }
  const res = await sync(B, { legacyDays: importB })
  assert.deepEqual(res.days['2026-08-01'], { reviews: 15, learned: 4 })
})

await check('listening: latest position, highest play count, earliest completion', async () => {
  await sync(A, {
    listening: [{
      episodeId: 7, positionSec: 30, durationSec: 180, playCount: 2, completedAt: null,
      firstPlayedAt: 1000, lastPlayedAt: 5000, updatedAt: 5000,
    }],
  })
  const res = await sync(B, {
    listening: [{
      episodeId: 7, positionSec: 90, durationSec: 180, playCount: 1, completedAt: 4000,
      firstPlayedAt: 800, lastPlayedAt: 4000, updatedAt: 4000,
    }],
  })
  const row = res.changes.listening.find((l: { episodeId: number }) => l.episodeId === 7)
  assert.equal(row.positionSec, 30)
  assert.equal(row.playCount, 2)
  assert.equal(row.completedAt, 4000)
  assert.equal(row.firstPlayedAt, 800)
  assert.equal(row.updatedAt, 5000)
})

await check('settings sync across devices', async () => {
  await sync(A, { settings: { autoSpeak: false, lastEpisodeId: 7, updatedAt: 6000 } })
  const res = await sync(B)
  assert.deepEqual(res.changes.settings, { autoSpeak: false, lastEpisodeId: 7, updatedAt: 6000 })
})

await check('reset clears cards, decks and history everywhere', async () => {
  await sync(A, { decks: [{ episodeId: 2, addedAt: 7000, updatedAt: 7000 }] })
  const resetAt = Date.now()
  const a = await sync(A, { resetAt })
  assert.equal(a.resetAt, resetAt)
  assert.deepEqual(a.days, {})

  const b = await sync(B, { cards: [card('stale', 2000)] })
  assert.equal(b.resetAt, resetAt)
  assert.ok(b.changes.deletedCards.some((c: { id: string }) => c.id === 'apple'))
  assert.ok(b.changes.deletedDecks.some((d: { episodeId: number }) => d.episodeId === 2))
  assert.equal(b.changes.cards.length, 0, 'an edit older than the reset is ignored')

  const fresh = await sync(B, { cards: [card('fresh', resetAt + 1)] })
  assert.deepEqual(fresh.changes.cards.map((c: { id: string }) => c.id), ['fresh'])
})

await check('a first sync gets live rows only', async () => {
  const res = await sync({ cursor: null })
  assert.deepEqual(res.changes.cards.map((c: { id: string }) => c.id), ['fresh'])
  assert.equal(res.changes.deletedCards.length, 0)
})
```

- [ ] **Step 2: Run to see the sync checks fail**

Run: `cd server && npm run smoke`
Expected: the auth checks pass; every sync check fails with `404` (`/sync` does not exist yet); exit code 1.

- [ ] **Step 3: Write `server/src/sync/schema.ts`**

```ts
import { z } from 'zod'

// Timestamps are epoch milliseconds, as Date.now() and src/lib/srs.js use.
const ms = z.number().int().nonnegative()
const count = z.number().int().nonnegative()
// Cards saved before the vocab files carried every field lack some of them.
const text = z.string().max(5000).default('')
const cardState = z.enum(['new', 'learning', 'review', 'relearning'])
const dayKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const cardId = z.string().min(1).max(500)

export const cardSchema = z.object({
  id: cardId,
  word: text,
  ipa: text,
  type: text,
  def: text,
  vi: text,
  viDef: text,
  episodeIds: z.array(z.number().int()).max(1000),
  state: cardState,
  step: count,
  ease: z.number(),
  interval: z.number().nonnegative(),
  due: ms,
  reps: count,
  lapses: count,
  addedAt: ms,
  lastReview: ms.nullable().default(null),
  updatedAt: ms,
})

export const deckSchema = z.object({ episodeId: z.number().int(), addedAt: ms, updatedAt: ms })

export const listeningSchema = z.object({
  episodeId: z.number().int(),
  positionSec: z.number().nonnegative(),
  durationSec: z.number().nonnegative(),
  playCount: count,
  completedAt: ms.nullable(),
  firstPlayedAt: ms,
  lastPlayedAt: ms,
  updatedAt: ms,
})

export const settingsSchema = z.object({
  autoSpeak: z.boolean(),
  lastEpisodeId: z.number().int().nullable(),
  updatedAt: ms,
})

const reviewLogSchema = z.object({
  id: z.uuid(),
  cardId,
  rating: z.enum(['again', 'hard', 'good', 'easy']),
  stateBefore: cardState,
  intervalBefore: z.number().nonnegative(),
  intervalAfter: z.number().nonnegative(),
  reviewedAt: ms,
  day: dayKey,
})

export const dayCountsSchema = z.object({ reviews: count, learned: count })

export const syncRequestSchema = z.object({
  cursor: z.number().int().nonnegative().nullable(),
  changes: z.object({
    cards: z.array(cardSchema).max(20_000).default([]),
    deletedCards: z.array(z.object({ id: cardId, deletedAt: ms })).max(20_000).default([]),
    decks: z.array(deckSchema).max(1000).default([]),
    deletedDecks: z.array(z.object({ episodeId: z.number().int(), deletedAt: ms })).max(1000).default([]),
    listening: z.array(listeningSchema).max(1000).default([]),
    settings: settingsSchema.nullable().default(null),
    reviewLogs: z.array(reviewLogSchema).max(50_000).default([]),
    legacyDays: z
      .object({ importId: z.uuid(), days: z.record(dayKey, dayCountsSchema) })
      .nullable()
      .default(null),
    resetAt: ms.nullable().default(null),
  }),
})

export type SyncRequest = z.infer<typeof syncRequestSchema>
export type SyncChanges = SyncRequest['changes']
```

- [ ] **Step 4: Write `server/src/sync/wire.ts`**

```ts
import type { z } from 'zod'
import type { Card, Deck, Listening, Settings } from '../generated/prisma/client.js'
import type { cardSchema, dayCountsSchema, deckSchema, listeningSchema, settingsSchema } from './schema.js'

// The JSON shapes /sync sends back — the same shapes devices push.
export type WireCard = z.infer<typeof cardSchema>
export type WireDeck = z.infer<typeof deckSchema>
export type WireListening = z.infer<typeof listeningSchema>
export type WireSettings = z.infer<typeof settingsSchema>
export type DayCounts = z.infer<typeof dayCountsSchema>

export interface SyncResponse {
  cursor: number
  changes: {
    cards: WireCard[]
    deletedCards: { id: string; deletedAt: number }[]
    decks: WireDeck[]
    deletedDecks: { episodeId: number; deletedAt: number }[]
    listening: WireListening[]
    settings: WireSettings | null
  }
  days: Record<string, DayCounts>
  resetAt: number | null
}

/**
 * One item per key, the latest by `time`. Postgres refuses to upsert the same
 * row twice in one INSERT … ON CONFLICT DO UPDATE.
 */
export function latestBy<T>(items: T[], key: (item: T) => string | number, time: (item: T) => number): T[] {
  const byKey = new Map<string | number, T>()
  for (const item of items) {
    const seen = byKey.get(key(item))
    if (!seen || time(item) > time(seen)) byKey.set(key(item), item)
  }
  return [...byKey.values()]
}

const num = (value: bigint) => Number(value)
const numOrNull = (value: bigint | null) => (value === null ? null : Number(value))

export function toWireCard(c: Card): WireCard {
  return {
    id: c.cardId,
    word: c.word,
    ipa: c.ipa,
    type: c.type,
    def: c.def,
    vi: c.vi,
    viDef: c.viDef,
    episodeIds: c.episodeIds,
    state: c.state as WireCard['state'],
    step: c.step,
    ease: c.ease,
    interval: c.interval,
    due: num(c.due),
    reps: c.reps,
    lapses: c.lapses,
    addedAt: num(c.addedAt),
    lastReview: numOrNull(c.lastReview),
    updatedAt: num(c.updatedAt),
  }
}

export function toWireDeck(d: Deck): WireDeck {
  return { episodeId: d.episodeId, addedAt: num(d.addedAt), updatedAt: num(d.updatedAt) }
}

export function toWireListening(l: Listening): WireListening {
  return {
    episodeId: l.episodeId,
    positionSec: l.positionSec,
    durationSec: l.durationSec,
    playCount: l.playCount,
    completedAt: numOrNull(l.completedAt),
    firstPlayedAt: num(l.firstPlayedAt),
    lastPlayedAt: num(l.lastPlayedAt),
    updatedAt: num(l.updatedAt),
  }
}

export function toWireSettings(s: Settings): WireSettings {
  return { autoSpeak: s.autoSpeak, lastEpisodeId: s.lastEpisodeId, updatedAt: num(s.updatedAt) }
}
```

- [ ] **Step 5: Write `server/src/sync/service.ts`**

```ts
// One /sync round trip: apply a device's changes, then return what it has not
// seen. Merging is last-write-wins on `updated_at`, done in SQL so a first
// sync of thousands of cards is one statement per table, not one per row.

import { prisma } from '../db.js'
import type { Prisma } from '../generated/prisma/client.js'
import type { SyncChanges, SyncRequest } from './schema.js'
import { latestBy, toWireCard, toWireDeck, toWireListening, toWireSettings, type SyncResponse } from './wire.js'

type Tx = Prisma.TransactionClient

export async function runSync(userId: string, { cursor, changes }: SyncRequest): Promise<SyncResponse> {
  return prisma.$transaction(
    async (tx) => {
      // One sync per user at a time. rev values come from a sequence, so two
      // overlapping transactions could commit out of order, and a pull made in
      // between would skip the lower rev for good.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))`

      const resetAt = await applyReset(tx, userId, changes.resetAt)
      await upsertCards(tx, userId, changes.cards, resetAt)
      await deleteCards(tx, userId, changes.deletedCards)
      await upsertDecks(tx, userId, changes.decks, resetAt)
      await deleteDecks(tx, userId, changes.deletedDecks)
      await upsertListening(tx, userId, changes.listening)
      if (changes.settings) await upsertSettings(tx, userId, changes.settings)
      await insertReviewLogs(tx, userId, changes.reviewLogs, resetAt)
      if (changes.legacyDays) await insertLegacyDays(tx, userId, changes.legacyDays)
      return pull(tx, userId, cursor, resetAt)
    },
    { maxWait: 10_000, timeout: 30_000 },
  )
}

/** Record a newer reset and tombstone everything older. Returns the reset in force (0 = none). */
async function applyReset(tx: Tx, userId: string, incoming: number | null): Promise<number> {
  if (incoming !== null) {
    const moved = await tx.$executeRaw`
      UPDATE users SET reset_at = ${incoming}
      WHERE id = ${userId}::uuid AND (reset_at IS NULL OR reset_at < ${incoming})`
    if (moved > 0) {
      await tx.$executeRaw`
        UPDATE cards SET deleted_at = ${incoming}, updated_at = ${incoming}, rev = nextval('sync_rev')
        WHERE user_id = ${userId}::uuid AND deleted_at IS NULL AND updated_at < ${incoming}`
      await tx.$executeRaw`
        UPDATE decks SET deleted_at = ${incoming}, updated_at = ${incoming}, rev = nextval('sync_rev')
        WHERE user_id = ${userId}::uuid AND deleted_at IS NULL AND updated_at < ${incoming}`
    }
  }
  const user = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { resetAt: true } })
  return user.resetAt === null ? 0 : Number(user.resetAt)
}

async function upsertCards(tx: Tx, userId: string, cards: SyncChanges['cards'], resetAt: number) {
  const rows = latestBy(cards, (c) => c.id, (c) => c.updatedAt).filter((c) => c.updatedAt >= resetAt)
  if (!rows.length) return
  await tx.$executeRaw`
    INSERT INTO cards AS c (user_id, card_id, word, ipa, "type", def, vi, vi_def, episode_ids,
      state, step, ease, "interval", due, reps, lapses, added_at, last_review, updated_at, deleted_at, rev)
    SELECT ${userId}::uuid, x."id", x."word", x."ipa", x."type", x."def", x."vi", x."viDef", x."episodeIds",
      x."state", x."step", x."ease", x."interval", x."due", x."reps", x."lapses", x."addedAt", x."lastReview",
      x."updatedAt", NULL, nextval('sync_rev')
    FROM jsonb_to_recordset(${JSON.stringify(rows)}::jsonb) AS x("id" text, "word" text, "ipa" text,
      "type" text, "def" text, "vi" text, "viDef" text, "episodeIds" int[], "state" text, "step" int,
      "ease" float8, "interval" float8, "due" bigint, "reps" int, "lapses" int, "addedAt" bigint,
      "lastReview" bigint, "updatedAt" bigint)
    ON CONFLICT (user_id, card_id) DO UPDATE SET
      word = EXCLUDED.word, ipa = EXCLUDED.ipa, "type" = EXCLUDED."type", def = EXCLUDED.def,
      vi = EXCLUDED.vi, vi_def = EXCLUDED.vi_def, episode_ids = EXCLUDED.episode_ids,
      state = EXCLUDED.state, step = EXCLUDED.step, ease = EXCLUDED.ease, "interval" = EXCLUDED."interval",
      due = EXCLUDED.due, reps = EXCLUDED.reps, lapses = EXCLUDED.lapses, added_at = EXCLUDED.added_at,
      last_review = EXCLUDED.last_review, updated_at = EXCLUDED.updated_at, deleted_at = NULL,
      rev = EXCLUDED.rev
    WHERE c.updated_at < EXCLUDED.updated_at`
}

/**
 * A tombstone is kept even for a card the server never had: a device that
 * still holds the card must not bring it back with an older edit.
 */
async function deleteCards(tx: Tx, userId: string, deleted: SyncChanges['deletedCards']) {
  const rows = latestBy(deleted, (c) => c.id, (c) => c.deletedAt)
  if (!rows.length) return
  await tx.$executeRaw`
    INSERT INTO cards AS c (user_id, card_id, word, ipa, "type", def, vi, vi_def, episode_ids,
      state, step, ease, "interval", due, reps, lapses, added_at, last_review, updated_at, deleted_at, rev)
    SELECT ${userId}::uuid, x."id", x."id", '', '', '', '', '', '{}',
      'new', 0, 2.5, 0, 0, 0, 0, 0, NULL, x."deletedAt", x."deletedAt", nextval('sync_rev')
    FROM jsonb_to_recordset(${JSON.stringify(rows)}::jsonb) AS x("id" text, "deletedAt" bigint)
    ON CONFLICT (user_id, card_id) DO UPDATE SET
      updated_at = EXCLUDED.updated_at, deleted_at = EXCLUDED.deleted_at, rev = EXCLUDED.rev
    WHERE c.updated_at < EXCLUDED.updated_at`
}

async function upsertDecks(tx: Tx, userId: string, decks: SyncChanges['decks'], resetAt: number) {
  const rows = latestBy(decks, (d) => d.episodeId, (d) => d.updatedAt).filter((d) => d.updatedAt >= resetAt)
  if (!rows.length) return
  await tx.$executeRaw`
    INSERT INTO decks AS d (user_id, episode_id, added_at, updated_at, deleted_at, rev)
    SELECT ${userId}::uuid, x."episodeId", x."addedAt", x."updatedAt", NULL, nextval('sync_rev')
    FROM jsonb_to_recordset(${JSON.stringify(rows)}::jsonb)
      AS x("episodeId" int, "addedAt" bigint, "updatedAt" bigint)
    ON CONFLICT (user_id, episode_id) DO UPDATE SET
      added_at = EXCLUDED.added_at, updated_at = EXCLUDED.updated_at, deleted_at = NULL, rev = EXCLUDED.rev
    WHERE d.updated_at < EXCLUDED.updated_at`
}

async function deleteDecks(tx: Tx, userId: string, deleted: SyncChanges['deletedDecks']) {
  const rows = latestBy(deleted, (d) => d.episodeId, (d) => d.deletedAt)
  if (!rows.length) return
  await tx.$executeRaw`
    INSERT INTO decks AS d (user_id, episode_id, added_at, updated_at, deleted_at, rev)
    SELECT ${userId}::uuid, x."episodeId", 0, x."deletedAt", x."deletedAt", nextval('sync_rev')
    FROM jsonb_to_recordset(${JSON.stringify(rows)}::jsonb) AS x("episodeId" int, "deletedAt" bigint)
    ON CONFLICT (user_id, episode_id) DO UPDATE SET
      updated_at = EXCLUDED.updated_at, deleted_at = EXCLUDED.deleted_at, rev = EXCLUDED.rev
    WHERE d.updated_at < EXCLUDED.updated_at`
}

/**
 * Position and duration follow the latest edit; the counters only move one way
 * (plays up, first play and first completion earlier), so no device's history
 * is lost. LEAST/GREATEST skip NULLs, which is what completed_at needs.
 */
async function upsertListening(tx: Tx, userId: string, listening: SyncChanges['listening']) {
  const rows = latestBy(listening, (l) => l.episodeId, (l) => l.updatedAt)
  if (!rows.length) return
  await tx.$executeRaw`
    INSERT INTO listening AS l (user_id, episode_id, position_sec, duration_sec, play_count,
      completed_at, first_played_at, last_played_at, updated_at, rev)
    SELECT ${userId}::uuid, x."episodeId", x."positionSec", x."durationSec", x."playCount",
      x."completedAt", x."firstPlayedAt", x."lastPlayedAt", x."updatedAt", nextval('sync_rev')
    FROM jsonb_to_recordset(${JSON.stringify(rows)}::jsonb) AS x("episodeId" int, "positionSec" float8,
      "durationSec" float8, "playCount" int, "completedAt" bigint, "firstPlayedAt" bigint,
      "lastPlayedAt" bigint, "updatedAt" bigint)
    ON CONFLICT (user_id, episode_id) DO UPDATE SET
      position_sec = CASE WHEN EXCLUDED.updated_at > l.updated_at THEN EXCLUDED.position_sec ELSE l.position_sec END,
      duration_sec = CASE WHEN EXCLUDED.updated_at > l.updated_at THEN EXCLUDED.duration_sec ELSE l.duration_sec END,
      play_count = GREATEST(l.play_count, EXCLUDED.play_count),
      completed_at = LEAST(l.completed_at, EXCLUDED.completed_at),
      first_played_at = LEAST(l.first_played_at, EXCLUDED.first_played_at),
      last_played_at = GREATEST(l.last_played_at, EXCLUDED.last_played_at),
      updated_at = GREATEST(l.updated_at, EXCLUDED.updated_at),
      rev = EXCLUDED.rev
    WHERE EXCLUDED.updated_at > l.updated_at
      OR EXCLUDED.play_count > l.play_count
      OR EXCLUDED.first_played_at < l.first_played_at
      OR EXCLUDED.last_played_at > l.last_played_at
      OR (EXCLUDED.completed_at IS NOT NULL
        AND (l.completed_at IS NULL OR EXCLUDED.completed_at < l.completed_at))`
}

async function upsertSettings(tx: Tx, userId: string, settings: NonNullable<SyncChanges['settings']>) {
  await tx.$executeRaw`
    INSERT INTO settings AS s (user_id, auto_speak, last_episode_id, updated_at, rev)
    VALUES (${userId}::uuid, ${settings.autoSpeak}, ${settings.lastEpisodeId}, ${settings.updatedAt},
      nextval('sync_rev'))
    ON CONFLICT (user_id) DO UPDATE SET
      auto_speak = EXCLUDED.auto_speak, last_episode_id = EXCLUDED.last_episode_id,
      updated_at = EXCLUDED.updated_at, rev = EXCLUDED.rev
    WHERE s.updated_at < EXCLUDED.updated_at`
}

/** Logs are append-only and keyed by a device-made UUID, so a retried push adds nothing. */
async function insertReviewLogs(tx: Tx, userId: string, logs: SyncChanges['reviewLogs'], resetAt: number) {
  const rows = logs.filter((l) => l.reviewedAt >= resetAt)
  if (!rows.length) return
  await tx.$executeRaw`
    INSERT INTO review_logs (id, user_id, card_id, rating, state_before, interval_before,
      interval_after, reviewed_at, day)
    SELECT x."id", ${userId}::uuid, x."cardId", x."rating", x."stateBefore", x."intervalBefore",
      x."intervalAfter", x."reviewedAt", x."day"
    FROM jsonb_to_recordset(${JSON.stringify(rows)}::jsonb) AS x("id" uuid, "cardId" text,
      "rating" text, "stateBefore" text, "intervalBefore" float8, "intervalAfter" float8,
      "reviewedAt" bigint, "day" text)
    ON CONFLICT (id) DO NOTHING`
}

/** Daily counts from before review logs existed. One import per device, so a retry adds nothing. */
async function insertLegacyDays(tx: Tx, userId: string, legacy: NonNullable<SyncChanges['legacyDays']>) {
  const rows = Object.entries(legacy.days).map(([day, counts]) => ({ day, ...counts }))
  if (!rows.length) return
  await tx.$executeRaw`
    INSERT INTO legacy_days (user_id, import_id, day, reviews, learned, imported_at)
    SELECT ${userId}::uuid, ${legacy.importId}::uuid, x."day", x."reviews", x."learned", ${Date.now()}
    FROM jsonb_to_recordset(${JSON.stringify(rows)}::jsonb) AS x("day" text, "reviews" int, "learned" int)
    ON CONFLICT (user_id, import_id, day) DO NOTHING`
}

async function pull(tx: Tx, userId: string, cursor: number | null, resetAt: number): Promise<SyncResponse> {
  const since = BigInt(cursor ?? 0)
  const changed = { userId, rev: { gt: since } }
  // A device syncing for the first time has nothing to delete.
  const live = cursor === null ? { deletedAt: null } : {}

  const cards = await tx.card.findMany({ where: { ...changed, ...live } })
  const decks = await tx.deck.findMany({ where: { ...changed, ...live } })
  const listening = await tx.listening.findMany({ where: changed })
  const settings = await tx.settings.findFirst({ where: changed })

  const revs = [...cards, ...decks, ...listening, ...(settings ? [settings] : [])].map((row) => row.rev)
  const next = revs.reduce((max, rev) => (rev > max ? rev : max), since)

  const days = await tx.$queryRaw<{ day: string; reviews: number; learned: number }[]>`
    SELECT day, SUM(reviews)::int AS reviews, SUM(learned)::int AS learned FROM (
      SELECT day, COUNT(*) AS reviews, COUNT(*) FILTER (WHERE state_before = 'new') AS learned
      FROM review_logs WHERE user_id = ${userId}::uuid AND reviewed_at >= ${resetAt} GROUP BY day
      UNION ALL
      SELECT day, SUM(reviews), SUM(learned)
      FROM legacy_days WHERE user_id = ${userId}::uuid AND imported_at >= ${resetAt} GROUP BY day
    ) t GROUP BY day`

  return {
    cursor: Number(next),
    changes: {
      cards: cards.filter((c) => c.deletedAt === null).map(toWireCard),
      deletedCards: cards
        .filter((c) => c.deletedAt !== null)
        .map((c) => ({ id: c.cardId, deletedAt: Number(c.deletedAt) })),
      decks: decks.filter((d) => d.deletedAt === null).map(toWireDeck),
      deletedDecks: decks
        .filter((d) => d.deletedAt !== null)
        .map((d) => ({ episodeId: d.episodeId, deletedAt: Number(d.deletedAt) })),
      listening: listening.map(toWireListening),
      settings: settings ? toWireSettings(settings) : null,
    },
    days: Object.fromEntries(days.map((d) => [d.day, { reviews: d.reviews, learned: d.learned }])),
    resetAt: resetAt || null,
  }
}
```

- [ ] **Step 6: Write `server/src/routes/sync.ts`**

```ts
import { Router } from 'express'
import { authOf, requireAuth } from '../auth/sessions.js'
import { limitPerIp } from '../rateLimit.js'
import { syncRequestSchema } from '../sync/schema.js'
import { runSync } from '../sync/service.js'

export function syncRoutes() {
  const router = Router()
  router.post('/sync', limitPerIp(60 * 1000, 120), requireAuth, async (req, res) => {
    const body = syncRequestSchema.parse(req.body)
    res.json(await runSync(authOf(res).userId, body))
  })
  return router
}
```

- [ ] **Step 7: Mount it in `server/src/app.ts`**

Add the import:

```ts
import { syncRoutes } from './routes/sync.js'
```

After `app.use(authRoutes(config))`:

```ts
  app.use(syncRoutes())
```

- [ ] **Step 8: Run the smoke script — all green**

Run: `cd server && npm run smoke`
Expected: every line `✓`, `All checks passed`, exit 0.

- [ ] **Step 9: Typecheck and commit**

```bash
cd server && npx tsc --noEmit
git add server/src server/scripts/smoke.ts
git commit -m "feat(server): /sync with last-write-wins merge in SQL"
```

---

### Task 5: Dev sign-in helper and server README

**Files:**
- Create: `server/scripts/create-session.ts`, `server/README.md`

- [ ] **Step 1: Write `server/scripts/create-session.ts`**

```ts
// Dev helper: sign a browser in without Google. Creates (or reuses) a user for
// the given email, opens a session and prints the call to paste into the
// console of the running dev app. It talks to the database directly — there is
// no HTTP backdoor — so it only reaches whatever DATABASE_URL points at.
//
//   npm run session -- someone@example.com

import { createSession } from '../src/auth/sessions.js'
import { prisma } from '../src/db.js'
import { toPublicUser } from '../src/routes/auth.js'

const email = process.argv[2] ?? 'dev@example.com'
const googleSub = `dev:${email}`
const user = await prisma.user.upsert({
  where: { googleSub },
  create: { googleSub, email, name: email.split('@')[0] },
  update: {},
})
const token = await createSession(user.id)
console.log(`__devSignIn(${JSON.stringify({ token, user: toPublicUser(user) })})`)
await prisma.$disconnect()
```

- [ ] **Step 2: Run it**

Run: `cd server && npm run session -- dev@example.com`
Expected: one line `__devSignIn({"token":"…","user":{"id":"…","email":"dev@example.com","name":"dev","avatarUrl":null}})`.

- [ ] **Step 3: Write `server/README.md`**

````markdown
# EnglishPod API

Google sign-in and sync of vocabulary and listening history for the EnglishPod
app. Design: `docs/superpowers/specs/2026-09-28-google-auth-sync-design.md`.

## Local development

Requires Node 22 and PostgreSQL.

```bash
cd server
cp .env.example .env        # then fill DATABASE_URL (and GOOGLE_CLIENT_ID if you have one)
npm install
createdb englishpod
npx prisma migrate dev      # creates the tables
npx prisma generate
npm run dev                 # http://localhost:3000
```

Frontend: in the repo root, copy `.env.example` to `.env.local` and run `npm run dev`.

| Command | What it does |
| --- | --- |
| `npm run dev` | API with reload |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run smoke` | End-to-end checks against the DB in `.env` |
| `npm run session -- you@example.com` | Prints `__devSignIn(...)` to paste in the dev app's console — signs in without Google |
| `npm run build && npm start` | Production build and run |

## Deploy (free: Render + Neon)

1. **Google Cloud Console** → APIs & Services → Credentials → Create OAuth client
   ID → Web application. Authorized JavaScript origins:
   `http://localhost:5173`, `https://dangsangn.github.io`.
2. **Neon** → new project. Copy the pooled connection string (`DATABASE_URL`)
   and the direct one (`DIRECT_URL`).
3. **Render** → New Web Service from this repo.
   - Root directory: `server`
   - Build command: `npm ci && npx prisma migrate deploy && npm run build`
   - Start command: `npm start`
   - Environment: `DATABASE_URL`, `DIRECT_URL`, `GOOGLE_CLIENT_ID`,
     `CORS_ORIGINS=https://dangsangn.github.io,http://localhost:5173`
4. **GitHub** → repo Settings → Secrets and variables → Actions → Variables:
   `VITE_API_URL` (the Render URL) and `VITE_GOOGLE_CLIENT_ID`. The Pages
   workflow passes them to the build.

The free Render instance sleeps after 15 minutes idle; the first request after
that takes 30–60 s. The app syncs in the background, so only signing in waits.
````

- [ ] **Step 4: Commit**

```bash
git add server/scripts/create-session.ts server/README.md
git commit -m "feat(server): dev sign-in helper and README"
```

---

### Task 6: Frontend plumbing — API client, auth store, Google button loader

**Files:**
- Create: `src/lib/api.js`, `src/lib/auth.js`, `src/lib/googleSignIn.js`, `src/lib/uuid.js`, `.env.example`, `.env.local` (not committed; `*.local` is already ignored)
- Modify: `eslint.config.js`

- [ ] **Step 1: Write `src/lib/api.js`**

```js
// Fetch wrapper for the sync backend (server/). The backend is optional:
// without VITE_API_URL and VITE_GOOGLE_CLIENT_ID the app stays local-only and
// the sign-in button is hidden.

const API_URL = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '')
export const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || ''
export const apiEnabled = Boolean(API_URL && GOOGLE_CLIENT_ID)

// Long enough for a sleeping free-tier Render instance to wake up (30–60 s).
const TIMEOUT_MS = 90_000

export class ApiError extends Error {
  constructor(status, code, message) {
    super(message)
    this.status = status // 0 when the request never got an answer
    this.code = code
  }
}

export async function api(path, { method = 'GET', body, token } = {}) {
  const headers = {}
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (token) headers.Authorization = `Bearer ${token}`

  let res
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch (error) {
    // Offline, DNS, CORS or timeout — all mean "try again later".
    throw new ApiError(0, 'network', error.message)
  }

  if (res.status === 204) return null
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    throw new ApiError(
      res.status,
      data?.error?.code || 'http_error',
      data?.error?.message || res.statusText,
    )
  }
  return data
}
```

- [ ] **Step 2: Write `src/lib/auth.js`**

```js
// Who is signed in: { token, user: { id, email, name, avatarUrl } } or null.
// Kept in localStorage so a reload stays signed in. sync.js decides when it
// changes; components read it through useAuth().

import { useSyncExternalStore } from 'react'

const STORAGE_KEY = 'englishpod_auth_v1'

function load() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || null
  } catch {
    return null
  }
}

let auth = load()
const listeners = new Set()

export function setAuth(next) {
  auth = next
  try {
    if (next) localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    else localStorage.removeItem(STORAGE_KEY)
  } catch (error) {
    console.error('Error saving sign-in:', error)
  }
  listeners.forEach((listener) => listener())
}

export const getAuth = () => auth
export const clearAuth = () => setAuth(null)

function subscribe(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useAuth() {
  return useSyncExternalStore(subscribe, () => auth)
}
```

- [ ] **Step 3: Write `src/lib/googleSignIn.js`**

```js
// Google Identity Services: load the script once, initialise it once, render
// as many buttons as the layout needs. The ID token goes to whatever handler
// sync.js registered.

import { GOOGLE_CLIENT_ID } from './api'

let ready = null
let onCredential = () => {}

export function setCredentialHandler(handler) {
  onCredential = handler
}

function loadGis() {
  ready ??= new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.onload = () => {
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: (response) => onCredential(response.credential),
      })
      resolve(window.google)
    }
    script.onerror = () => {
      ready = null // let the next render try again
      reject(new Error('Google Sign-In failed to load'))
    }
    document.head.appendChild(script)
  })
  return ready
}

export async function renderGoogleButton(element, { compact = false } = {}) {
  const google = await loadGis()
  google.accounts.id.renderButton(
    element,
    compact
      ? { type: 'icon', shape: 'circle', size: 'medium' }
      : { type: 'standard', shape: 'pill', size: 'medium', text: 'signin_with' },
  )
}
```

- [ ] **Step 4: Write `src/lib/uuid.js`**

```js
// crypto.randomUUID only exists on https and localhost; trying the dev server
// from a phone over the LAN is plain http.
export function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID()
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 0x0f) | 0x40 // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80 // RFC 4122 variant
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
```

- [ ] **Step 5: Write `.env.example` and `.env.local`**

`.env.example`:

```bash
# Sync backend (see server/README.md). Leave either empty to run local-only.
VITE_API_URL=http://localhost:3000
VITE_GOOGLE_CLIENT_ID=
```

`.env.local`: same content; fill `VITE_GOOGLE_CLIENT_ID` once there is one. Without it `apiEnabled` is false; for dev without Google set it to any placeholder like `dev` and sign in with `npm run session` (Task 9).

- [ ] **Step 6: Keep ESLint off the server (it has its own TypeScript setup)**

In `eslint.config.js` change:

```js
  globalIgnores(['dist']),
```

to:

```js
  globalIgnores(['dist', 'server']),
```

- [ ] **Step 7: Lint and commit**

```bash
npm run lint
git add src/lib/api.js src/lib/auth.js src/lib/googleSignIn.js src/lib/uuid.js .env.example eslint.config.js
git commit -m "feat: API client, auth store and Google button loader"
```

Expected: `npm run lint` reports no errors in the new files.

---

### Task 7: Sync fields in `srsStore.js`

**Files:**
- Modify: `src/lib/srsStore.js` (everything above the `// Selectors` banner, plus a new sync section at the end)

The selectors (`streakOf`, `summarize`, `buildQueue`) and `addEpisodeDeck` stay as they are.

- [ ] **Step 1: Replace the file header, state and actions (from line 1 down to, not including, the `// ---…` / `// Selectors — pure reads over a state snapshot.` banner) with:**

```js
// Persistent state for vocabulary study, kept in localStorage.
//
// Components read it through useSrs() (useSyncExternalStore), and change it only
// through the exported actions, so every write is saved and every subscriber
// re-renders from the same snapshot.
//
// Every action stamps what it changes with `updatedAt` and every deletion
// leaves a tombstone, so sync.js can push this device's edits and merge in
// other devices' (last write wins).

import { useSyncExternalStore } from 'react'
import { addDays, cardContent, cardId, createCard, dayKey, isDue, schedule, stageOf } from './srs'
import { uuid } from './uuid'

const STORAGE_KEY = 'englishpod_srs_v1'
// Before settings.lastEpisodeId, App.jsx kept the last episode under this key.
const LEGACY_LAST_EPISODE_KEY = 'englishpod_last_episode_id'

const DEFAULT_STATE = {
  cards: {}, // id → card (see srs.createCard) + updatedAt
  decks: [], // episode ids, in the order they were added
  deckMeta: {}, // episode id → { addedAt, updatedAt }
  settings: { autoSpeak: true, lastEpisodeId: null },
  settingsUpdatedAt: 0,
  days: {}, // YYYY-MM-DD → { reviews, learned }
  tombstones: { cards: {}, decks: {} }, // id → deletedAt, until pushed
  pendingLogs: [], // review logs not pushed yet
  resetAt: null,
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const saved = raw ? JSON.parse(raw) : {}
    return migrate({
      ...DEFAULT_STATE,
      ...saved,
      settings: { ...DEFAULT_STATE.settings, ...saved.settings },
      tombstones: { ...DEFAULT_STATE.tombstones, ...saved.tombstones },
    })
  } catch (error) {
    console.error('Error reading vocabulary progress:', error)
    return DEFAULT_STATE
  }
}

/** Fill in the sync fields for progress saved before they existed. */
function migrate(s, now = Date.now()) {
  const cards = {}
  for (const [id, card] of Object.entries(s.cards)) {
    cards[id] = card.updatedAt ? card : { ...card, updatedAt: card.lastReview ?? card.addedAt }
  }
  const deckMeta = { ...s.deckMeta }
  for (const episodeId of s.decks) {
    deckMeta[episodeId] ??= { addedAt: now, updatedAt: now }
  }
  let settings = s.settings
  if (settings.lastEpisodeId === null) {
    const legacy = parseInt(localStorage.getItem(LEGACY_LAST_EPISODE_KEY), 10)
    if (Number.isInteger(legacy)) settings = { ...settings, lastEpisodeId: legacy }
  }
  return { ...s, cards, deckMeta, settings }
}

let state = load()
const listeners = new Set()
const localChangeListeners = new Set()
let logReviews = false

/** `remote` marks merged sync results, which must not schedule another sync. */
function setState(updater, { remote = false } = {}) {
  const next = updater(state)
  if (next === state) return
  state = next
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch (error) {
    console.error('Error saving vocabulary progress:', error)
  }
  listeners.forEach((listener) => listener())
  if (!remote) localChangeListeners.forEach((listener) => listener())
}

function subscribe(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useSrs() {
  return useSyncExternalStore(subscribe, () => state)
}

export function getSrsState() {
  return state
}

/** Called after every change made on this device (not after merging a sync). */
export function subscribeLocalChanges(listener) {
  localChangeListeners.add(listener)
  return () => localChangeListeners.delete(listener)
}

/**
 * Keep a log entry per answer. sync.js turns this on while the progress belongs
 * to an account; signed-out use keeps only the daily counts, so localStorage
 * does not fill up with logs nothing will ever read.
 */
export function setReviewLogging(enabled) {
  logReviews = enabled
}

/**
 * Add an episode's words as new cards. A word already in the collection (from
 * another episode) is not duplicated — the episode is just linked to it.
 */
export function addDeck(episodeId, entries, now = Date.now()) {
  setState((s) => {
    const cards = { ...s.cards }
    const cardTombstones = { ...s.tombstones.cards }
    entries.forEach((entry, index) => {
      if (!entry?.word) return
      const id = cardId(entry.word)
      const existing = cards[id]
      if (existing) {
        if (!existing.episodeIds.includes(episodeId)) {
          cards[id] = { ...existing, episodeIds: [...existing.episodeIds, episodeId], updatedAt: now }
        }
        return
      }
      // Offset addedAt by position so new cards come up in the episode's order.
      cards[id] = { ...createCard(entry, episodeId, now + index), updatedAt: now }
      delete cardTombstones[id]
    })
    const decks = s.decks.includes(episodeId) ? s.decks : [...s.decks, episodeId]
    const deckMeta = {
      ...s.deckMeta,
      [episodeId]: { addedAt: s.deckMeta[episodeId]?.addedAt ?? now, updatedAt: now },
    }
    const deckTombstones = { ...s.tombstones.decks }
    delete deckTombstones[episodeId]
    return {
      ...s,
      cards,
      decks,
      deckMeta,
      tombstones: { cards: cardTombstones, decks: deckTombstones },
    }
  })
}

/** Drop an episode. Cards it shares with another deck stay; the rest go. */
export function removeDeck(episodeId, now = Date.now()) {
  setState((s) => {
    const cards = {}
    const cardTombstones = { ...s.tombstones.cards }
    for (const [id, card] of Object.entries(s.cards)) {
      if (!card.episodeIds.includes(episodeId)) {
        cards[id] = card
        continue
      }
      const episodeIds = card.episodeIds.filter((e) => e !== episodeId)
      if (episodeIds.length) cards[id] = { ...card, episodeIds, updatedAt: now }
      else cardTombstones[id] = now
    }
    const deckMeta = { ...s.deckMeta }
    delete deckMeta[episodeId]
    return {
      ...s,
      cards,
      decks: s.decks.filter((e) => e !== episodeId),
      deckMeta,
      tombstones: { cards: cardTombstones, decks: { ...s.tombstones.decks, [episodeId]: now } },
    }
  })
}

export function rateCard(id, rating, now = Date.now()) {
  setState((s) => {
    const card = s.cards[id]
    if (!card) return s
    const next = { ...schedule(card, rating, now), updatedAt: now }
    const key = dayKey(now)
    const today = s.days[key] || { reviews: 0, learned: 0 }
    const log = {
      id: uuid(),
      cardId: id,
      rating,
      stateBefore: card.state,
      intervalBefore: card.interval,
      intervalAfter: next.interval,
      reviewedAt: now,
      day: key,
    }
    return {
      ...s,
      cards: { ...s.cards, [id]: next },
      days: {
        ...s.days,
        [key]: {
          reviews: today.reviews + 1,
          learned: today.learned + (card.state === 'new' ? 1 : 0),
        },
      },
      pendingLogs: logReviews ? [...s.pendingLogs, log] : s.pendingLogs,
    }
  })
}

/**
 * "I've forgotten this one" from the word list: treat it like an "Again"
 * answer, but due right away so the next session picks it up. It is not a
 * review, so the daily counts and the review count stay as they were.
 */
export function relearnCard(id, now = Date.now()) {
  setState((s) => {
    const card = s.cards[id]
    if (!card || card.state === 'new') return s
    const next = schedule(card, 'again', now)
    return {
      ...s,
      cards: {
        ...s.cards,
        [id]: { ...next, reps: card.reps, lastReview: card.lastReview, due: now, updatedAt: now },
      },
    }
  })
}

export function updateSettings(patch, now = Date.now()) {
  setState((s) => {
    if (Object.entries(patch).every(([key, value]) => s.settings[key] === value)) return s
    return { ...s, settings: { ...s.settings, ...patch }, settingsUpdatedAt: now }
  })
}

/** Wipe the study progress on every device of the account (settings stay). */
export function resetProgress(now = Date.now()) {
  setState((s) => ({
    ...DEFAULT_STATE,
    settings: s.settings,
    settingsUpdatedAt: s.settingsUpdatedAt,
    resetAt: now,
  }))
}

/** Forget this device's copy (sign-out, or another account signing in). Not a reset. */
export function clearLocalProgress() {
  setState(() => DEFAULT_STATE, { remote: true })
}
```

- [ ] **Step 2: In `backfillCardContent`, stamp the cards it fills in**

In the final `setState` of `backfillCardContent`, change:

```js
      if (!('def' in card) && content.has(id)) cards[id] = { ...card, ...content.get(id) }
```

to:

```js
      if (!('def' in card) && content.has(id)) {
        cards[id] = { ...card, ...content.get(id), updatedAt: Date.now() }
      }
```

- [ ] **Step 3: Append the sync section at the end of the file**

```js
// ---------------------------------------------------------------------------
// Sync — the protocol is described in sync.js.

/**
 * This device's changes in the shape POST /sync expects: everything stamped at
 * or after `since` (ms), or everything when `since` is null (first sync).
 * Tombstones and pending logs always go, until a sync confirms them.
 */
export function collectSrsChanges(since) {
  const s = state
  const changed = (time) => since === null || time >= since
  return {
    cards: Object.values(s.cards).filter((card) => changed(card.updatedAt)),
    deletedCards: Object.entries(s.tombstones.cards).map(([id, deletedAt]) => ({ id, deletedAt })),
    decks: s.decks
      .filter((episodeId) => changed(s.deckMeta[episodeId]?.updatedAt ?? 0))
      .map((episodeId) => ({ episodeId, ...s.deckMeta[episodeId] })),
    deletedDecks: Object.entries(s.tombstones.decks).map(([episodeId, deletedAt]) => ({
      episodeId: Number(episodeId),
      deletedAt,
    })),
    settings: changed(s.settingsUpdatedAt) ? { ...s.settings, updatedAt: s.settingsUpdatedAt } : null,
    reviewLogs: s.pendingLogs,
    resetAt: s.resetAt,
  }
}

/**
 * Merge a /sync response. `sent` is what collectSrsChanges returned for that
 * request: what it carried is cleared, while edits made during the request stay
 * for the next push. A remote record wins unless the local one is newer.
 */
export function applySyncResult(sent, response) {
  const { changes } = response
  setState(
    (s) => {
      const cards = { ...s.cards }
      const cardTombstones = { ...s.tombstones.cards }
      const cardTime = (id) => cards[id]?.updatedAt ?? cardTombstones[id] ?? -1
      for (const card of changes.cards) {
        if (card.updatedAt < cardTime(card.id)) continue
        cards[card.id] = card
        delete cardTombstones[card.id]
      }
      for (const { id, deletedAt } of changes.deletedCards) {
        if (deletedAt < cardTime(id)) continue
        delete cards[id]
        delete cardTombstones[id]
      }

      let decks = [...s.decks]
      const deckMeta = { ...s.deckMeta }
      const deckTombstones = { ...s.tombstones.decks }
      const deckTime = (episodeId) => deckMeta[episodeId]?.updatedAt ?? deckTombstones[episodeId] ?? -1
      for (const { episodeId, addedAt, updatedAt } of changes.decks) {
        if (updatedAt < deckTime(episodeId)) continue
        deckMeta[episodeId] = { addedAt, updatedAt }
        delete deckTombstones[episodeId]
        if (!decks.includes(episodeId)) decks.push(episodeId)
      }
      for (const { episodeId, deletedAt } of changes.deletedDecks) {
        if (deletedAt < deckTime(episodeId)) continue
        delete deckMeta[episodeId]
        delete deckTombstones[episodeId]
        decks = decks.filter((e) => e !== episodeId)
      }

      let { settings, settingsUpdatedAt, resetAt } = s
      if (changes.settings && changes.settings.updatedAt > settingsUpdatedAt) {
        const { autoSpeak, lastEpisodeId } = changes.settings
        settings = { ...settings, autoSpeak, lastEpisodeId }
        settingsUpdatedAt = changes.settings.updatedAt
      }

      // Another device reset the progress: drop whatever predates it here too.
      if (response.resetAt !== null && response.resetAt > (resetAt ?? -1)) {
        resetAt = response.resetAt
        for (const [id, card] of Object.entries(cards)) {
          if (card.updatedAt < resetAt) delete cards[id]
        }
        for (const episodeId of decks) {
          if (deckMeta[episodeId].updatedAt < resetAt) delete deckMeta[episodeId]
        }
        decks = decks.filter((episodeId) => episodeId in deckMeta)
      }

      for (const { id, deletedAt } of sent.deletedCards) {
        if (cardTombstones[id] === deletedAt) delete cardTombstones[id]
      }
      for (const { episodeId, deletedAt } of sent.deletedDecks) {
        if (deckTombstones[episodeId] === deletedAt) delete deckTombstones[episodeId]
      }
      const sentLogs = new Set(sent.reviewLogs.map((log) => log.id))
      const pendingLogs = s.pendingLogs.filter((log) => !sentLogs.has(log.id))

      // The server's counts cover every device; add what is still unpushed here.
      const days = {}
      for (const [day, counts] of Object.entries(response.days)) days[day] = { ...counts }
      for (const log of pendingLogs) {
        const today = days[log.day] || { reviews: 0, learned: 0 }
        days[log.day] = {
          reviews: today.reviews + 1,
          learned: today.learned + (log.stateBefore === 'new' ? 1 : 0),
        }
      }

      return {
        ...s,
        cards,
        decks,
        deckMeta,
        settings,
        settingsUpdatedAt,
        days,
        tombstones: { cards: cardTombstones, decks: deckTombstones },
        pendingLogs,
        resetAt,
      }
    },
    { remote: true },
  )
}
```

- [ ] **Step 4: Lint, build, and check nothing regressed while signed out**

```bash
npm run lint && npm run build
```

Expected: no lint errors; build succeeds.

Then `npm run dev`, open `http://localhost:5173/#vocab` in a browser that already has progress: the garden shows the same counts as before. Add a deck, study two cards, remove the deck, reload — each step persists. In DevTools: `JSON.parse(localStorage.englishpod_srs_v1)` has `updatedAt` on cards, `deckMeta`, `tombstones.decks` holding the removed episode, and `pendingLogs: []` (logging is off while signed out).

- [ ] **Step 5: Commit**

```bash
git add src/lib/srsStore.js
git commit -m "feat: track edits and deletions in the vocabulary store for sync"
```

---

### Task 8: Listening history

**Files:**
- Create: `src/lib/listeningStore.js`
- Modify: `src/components/AudioPlayer.jsx`

- [ ] **Step 1: Write `src/lib/listeningStore.js`**

```js
// Listening history per episode, kept in localStorage: where playback stopped,
// how many times the episode was played, and when it was first finished.
// AudioPlayer writes it; sync.js pushes it and merges other devices' copies.

const STORAGE_KEY = 'englishpod_listening_v1'

function load() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}
  } catch (error) {
    console.error('Error reading listening history:', error)
    return {}
  }
}

// episode id → { episodeId, positionSec, durationSec, playCount, completedAt,
//                firstPlayedAt, lastPlayedAt, updatedAt }
let records = load()
const localChangeListeners = new Set()

function setRecords(updater, { remote = false } = {}) {
  const next = updater(records)
  if (next === records) return
  records = next
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records))
  } catch (error) {
    console.error('Error saving listening history:', error)
  }
  if (!remote) localChangeListeners.forEach((listener) => listener())
}

/** Called after every change made on this device (not after merging a sync). */
export function subscribeLocalListeningChanges(listener) {
  localChangeListeners.add(listener)
  return () => localChangeListeners.delete(listener)
}

// audio.duration is NaN before metadata loads and Infinity for live streams.
const seconds = (value) => (Number.isFinite(value) && value > 0 ? value : 0)

function update(episodeId, now, change) {
  setRecords((r) => {
    const record = r[episodeId] ?? {
      episodeId,
      positionSec: 0,
      durationSec: 0,
      playCount: 0,
      completedAt: null,
      firstPlayedAt: now,
      lastPlayedAt: now,
      updatedAt: now,
    }
    return { ...r, [episodeId]: { ...record, ...change(record), lastPlayedAt: now, updatedAt: now } }
  })
}

/** Playback started on a freshly loaded episode. */
export function recordPlay(episodeId, now = Date.now()) {
  update(episodeId, now, (record) => ({ playCount: record.playCount + 1 }))
}

export function recordPosition(episodeId, positionSec, durationSec, now = Date.now()) {
  update(episodeId, now, (record) => ({
    positionSec: seconds(positionSec),
    durationSec: seconds(durationSec) || record.durationSec,
  }))
}

/** Played to the end: remember the first time, and start from the top next time. */
export function recordCompleted(episodeId, durationSec, now = Date.now()) {
  update(episodeId, now, (record) => ({
    completedAt: record.completedAt ?? now,
    positionSec: 0,
    durationSec: seconds(durationSec) || record.durationSec,
  }))
}

/** Where to pick an episode back up, or 0 to start from the top. */
export function resumePosition(episodeId) {
  const record = records[episodeId]
  if (!record) return 0
  const { positionSec, durationSec } = record
  return positionSec > 5 && positionSec < durationSec - 5 ? positionSec : 0
}

// ---------------------------------------------------------------------------
// Sync

export function collectListeningChanges(since) {
  return Object.values(records).filter((record) => since === null || record.updatedAt >= since)
}

/** Same rule as the server: latest position wins, the counters never go back. */
function merge(local, remote) {
  if (!local) return remote
  const latest = remote.updatedAt > local.updatedAt ? remote : local
  const completed = [local.completedAt, remote.completedAt].filter((time) => time !== null)
  return {
    ...latest,
    playCount: Math.max(local.playCount, remote.playCount),
    completedAt: completed.length ? Math.min(...completed) : null,
    firstPlayedAt: Math.min(local.firstPlayedAt, remote.firstPlayedAt),
    lastPlayedAt: Math.max(local.lastPlayedAt, remote.lastPlayedAt),
    updatedAt: Math.max(local.updatedAt, remote.updatedAt),
  }
}

export function applyRemoteListening(remote) {
  if (!remote.length) return
  setRecords(
    (r) => {
      const next = { ...r }
      for (const record of remote) next[record.episodeId] = merge(next[record.episodeId], record)
      return next
    },
    { remote: true },
  )
}

export function clearListening() {
  setRecords(() => ({}), { remote: true })
}
```

- [ ] **Step 2: Wire it into `src/components/AudioPlayer.jsx`**

2a. After `import { getAudioSources } from '../lib/audioSources'` add:

```js
import {
  recordCompleted,
  recordPlay,
  recordPosition,
  resumePosition,
} from '../lib/listeningStore'

// While playing, the position is saved this often (and on pause, episode
// change, and when the page is hidden).
const SAVE_EVERY_MS = 15_000

function savePosition(loaded) {
  if (loaded) recordPosition(loaded.episodeId, loaded.time, loaded.duration)
}
```

2b. Replace:

```js
  // Where to pick playback back up after swapping sources mid-listen.
  const resumeRef = useRef({ time: 0, wasPlaying: false })
```

with:

```js
  // Where to pick playback back up: the saved position when an episode opens,
  // or the current one after swapping sources mid-listen.
  const resumeRef = useRef({ time: resumePosition(episode.id), wasPlaying: false })
  // The episode whose source has loaded, with its latest position. Only set
  // after loadedmetadata, so the 0:00 of a source being swapped in is never
  // saved over where the listener actually was.
  const loadedRef = useRef(null) // { episodeId, src, time, duration }
  const lastSavedAtRef = useRef(0)
  const countedPlayRef = useRef(null) // episode id whose play is already counted
```

2c. In the render-time reset block, replace:

```js
    resumeRef.current = { time: 0, wasPlaying: false }
```

with:

```js
    resumeRef.current = { time: resumePosition(episode.id), wasPlaying: false }
```

2d. In the load effect, replace:

```js
    audio.volume = isMuted ? 0 : volume
    audio.playbackRate = playbackRate
    audio.load()
```

with:

```js
    // Moving to another episode: keep where the previous one stopped.
    if (loadedRef.current?.episodeId !== episode.id) savePosition(loadedRef.current)
    loadedRef.current = null

    audio.volume = isMuted ? 0 : volume
    audio.playbackRate = playbackRate
    audio.load()
```

and replace:

```js
    const onLoadedMetadata = () => {
      if (time > 0) audio.currentTime = time
      if (!shouldPlay) return
```

with:

```js
    const onLoadedMetadata = () => {
      if (time > 0) audio.currentTime = time
      loadedRef.current = {
        episodeId: episode.id,
        src: currentSrc,
        time: audio.currentTime,
        duration: audio.duration,
      }
      if (!shouldPlay) return
```

2e. After the "Playback Speed effect" `useEffect`, add:

```js
  // Closing the tab or backgrounding the app (iOS rarely fires pagehide).
  useEffect(() => {
    const flush = () => savePosition(loadedRef.current)
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush()
    }
    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('pagehide', flush)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  const saveProgress = () => {
    lastSavedAtRef.current = Date.now()
    savePosition(loadedRef.current)
  }

  const handlePlay = () => {
    if (countedPlayRef.current === episode.id) return
    countedPlayRef.current = episode.id
    recordPlay(episode.id)
  }
```

2f. Replace `handleTimeUpdate` with:

```js
  const handleTimeUpdate = () => {
    if (!audioRef.current) return
    const current = audioRef.current.currentTime
    const dur = audioRef.current.duration
    setCurrentTime(current)
    setDuration(dur)
    if (dur) setProgress((current / dur) * 100)

    const loaded = loadedRef.current
    if (loaded?.src !== currentSrc) return
    loaded.time = current
    loaded.duration = dur
    if (!audioRef.current.paused && Date.now() - lastSavedAtRef.current >= SAVE_EVERY_MS) {
      saveProgress()
    }
  }
```

2g. At the top of `handleEnded`, before `setIsPlaying(false)`, add:

```js
    recordCompleted(episode.id, audioRef.current.duration)
    if (loadedRef.current) loadedRef.current.time = 0
    // Playing it again (loop or by hand) counts as another listen.
    countedPlayRef.current = null
```

2h. On the `<audio>` element, after `onTimeUpdate={handleTimeUpdate}` add:

```jsx
        onPlay={handlePlay}
        onPause={saveProgress}
```

- [ ] **Step 3: Lint and build**

Run: `npm run lint && npm run build`
Expected: no errors. If `react-hooks` flags the ref reads in the load effect's closure, they are intentional (the effect already disables `exhaustive-deps`).

- [ ] **Step 4: Verify in the browser (signed out)**

`npm run dev`, open the app:
1. Play an episode ~30 s, pause. DevTools: `JSON.parse(localStorage.englishpod_listening_v1)` has that episode with `playCount: 1` and `positionSec` ≈ 30.
2. Reload, open the same episode, press play: it continues from ~30 s.
3. Switch to another episode and back: position kept.
4. Seek to the last 10 s and let it end: `completedAt` is set, `positionSec` is 0; with autoplay on, the next episode starts at 0.

- [ ] **Step 5: Commit**

```bash
git add src/lib/listeningStore.js src/components/AudioPlayer.jsx
git commit -m "feat: record listening history and resume where playback stopped"
```

---

### Task 9: Background sync, sign-in and sign-out

**Files:**
- Create: `src/lib/sync.js`
- Modify: `src/main.jsx`

- [ ] **Step 1: Write `src/lib/sync.js`**

```js
// Background sync between this device's localStorage and the backend.
//
// The local stores (srsStore, listeningStore) stay what the UI reads and
// writes. Once signed in, this module sends POST /sync with whatever changed
// since the last successful push, plus a cursor; the server merges (last write
// wins) and answers with everything other devices changed after that cursor.
//
// When: right after sign-in, on start, a moment after a local change (2 s for
// study, 30 s for listening, which changes every 15 s while playing), when the
// tab comes back, and when the network does. Failures retry with backoff.

import { useSyncExternalStore } from 'react'
import { api, ApiError, apiEnabled } from './api'
import { clearAuth, getAuth, setAuth } from './auth'
import { setCredentialHandler } from './googleSignIn'
import {
  applyRemoteListening,
  clearListening,
  collectListeningChanges,
  subscribeLocalListeningChanges,
} from './listeningStore'
import {
  applySyncResult,
  clearLocalProgress,
  collectSrsChanges,
  getSrsState,
  setReviewLogging,
  subscribeLocalChanges,
} from './srsStore'
import { uuid } from './uuid'

const META_KEY = 'englishpod_sync_v1'
const STUDY_DELAY_MS = 2_000
const LISTENING_DELAY_MS = 30_000
const RETRY_DELAYS_MS = [5_000, 30_000, 120_000]

// ownerId: the account this device's progress belongs to (null: made signed out).
// legacyDays: daily counts from before sign-in, sent once with the first sync.
const EMPTY_META = { ownerId: null, cursor: null, lastPushAt: null, lastSyncedAt: null, legacyDays: null }

function loadMeta() {
  try {
    return { ...EMPTY_META, ...JSON.parse(localStorage.getItem(META_KEY)) }
  } catch {
    return EMPTY_META
  }
}

let meta = loadMeta()

function saveMeta(patch) {
  meta = { ...meta, ...patch }
  try {
    localStorage.setItem(META_KEY, JSON.stringify(meta))
  } catch (error) {
    console.error('Error saving sync state:', error)
  }
}

// ---------------------------------------------------------------------------
// Status for the UI: state is 'idle' | 'signing-in' | 'syncing' | 'error'.

let status = { state: 'idle', lastSyncedAt: meta.lastSyncedAt, error: null }
const listeners = new Set()

function setStatus(patch) {
  status = { ...status, ...patch }
  listeners.forEach((listener) => listener())
}

function subscribe(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useSyncStatus() {
  return useSyncExternalStore(subscribe, () => status)
}

// ---------------------------------------------------------------------------
// Scheduling

let timer = null
let timerDue = Infinity
let inFlight = null
let retries = 0

function cancelScheduled() {
  clearTimeout(timer)
  timer = null
  timerDue = Infinity
}

/** Sync in `delay` ms, unless one is already due sooner. */
function scheduleSync(delay) {
  if (!getAuth()) return
  const due = Date.now() + delay
  if (timer && timerDue <= due) return
  cancelScheduled()
  timerDue = due
  timer = setTimeout(() => {
    timer = null
    timerDue = Infinity
    syncNow()
  }, delay)
}

/** Sync now, or join the sync already running. Resolves to whether it succeeded. */
export function syncNow() {
  inFlight ??= runSync().finally(() => {
    inFlight = null
  })
  return inFlight
}

async function runSync() {
  const auth = getAuth()
  if (!auth) return false
  cancelScheduled()
  setStatus({ state: 'syncing', error: null })

  const since = meta.cursor === null ? null : meta.lastPushAt
  const srs = collectSrsChanges(since)
  const listening = collectListeningChanges(since)
  const pushStartedAt = Date.now()

  try {
    const response = await api('/sync', {
      method: 'POST',
      token: auth.token,
      body: { cursor: meta.cursor, changes: { ...srs, listening, legacyDays: meta.legacyDays } },
    })
    applySyncResult(srs, response)
    applyRemoteListening(response.changes.listening)
    saveMeta({
      cursor: response.cursor,
      lastPushAt: pushStartedAt,
      lastSyncedAt: Date.now(),
      legacyDays: null,
    })
    retries = 0
    setStatus({ state: 'idle', lastSyncedAt: meta.lastSyncedAt })
    return true
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      // Session expired or revoked. The progress and ownerId stay, so signing
      // back in to the same account just carries on.
      clearAuth()
      setStatus({ state: 'idle', error: null })
      return false
    }
    console.error('Sync failed:', error)
    setStatus({ state: 'error', error: error.message })
    const retryable =
      error instanceof ApiError && (error.status === 0 || error.status === 429 || error.status >= 500)
    if (retryable) scheduleSync(RETRY_DELAYS_MS[Math.min(retries++, RETRY_DELAYS_MS.length - 1)])
    return false
  }
}

// ---------------------------------------------------------------------------
// Signing in and out

function forgetLocalData() {
  clearLocalProgress()
  clearListening()
}

/** After the backend accepted a sign-in: decide what happens to local data, then sync. */
async function completeSignIn(result) {
  if (meta.ownerId !== result.user.id) {
    if (meta.ownerId !== null) {
      // Progress of a different account: never merge it into this one.
      forgetLocalData()
      saveMeta({ ...EMPTY_META, ownerId: result.user.id })
    } else {
      // Made before signing in: it joins this account on the first sync.
      const { days } = getSrsState()
      saveMeta({
        ...EMPTY_META,
        ownerId: result.user.id,
        legacyDays: Object.keys(days).length ? { importId: uuid(), days } : null,
      })
    }
  }
  setAuth(result)
  setReviewLogging(true)
  await syncNow()
}

async function loginWithGoogle(credential) {
  setStatus({ state: 'signing-in', error: null })
  let result
  try {
    result = await api('/auth/google', { method: 'POST', body: { credential } })
  } catch (error) {
    console.error('Sign-in failed:', error)
    setStatus({ state: 'error', error: 'Đăng nhập thất bại, thử lại sau.' })
    return
  }
  await completeSignIn(result)
}

export async function logout() {
  if (inFlight) await inFlight
  const synced = await syncNow()
  if (!synced && !window.confirm('Còn thay đổi chưa đồng bộ lên server. Vẫn đăng xuất?')) return

  const auth = getAuth()
  if (auth) api('/auth/logout', { method: 'POST', token: auth.token }).catch(() => {})
  cancelScheduled()
  clearAuth()
  setReviewLogging(false)
  forgetLocalData()
  saveMeta(EMPTY_META)
  setStatus({ state: 'idle', lastSyncedAt: null, error: null })
}

// ---------------------------------------------------------------------------

let started = false

/** Hook everything up once, at app start. A no-op when the backend is not configured. */
export function startSync() {
  if (!apiEnabled || started) return
  started = true

  setCredentialHandler(loginWithGoogle)
  setReviewLogging(meta.ownerId !== null)
  subscribeLocalChanges(() => scheduleSync(STUDY_DELAY_MS))
  subscribeLocalListeningChanges(() => scheduleSync(LISTENING_DELAY_MS))
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') scheduleSync(0)
  })
  window.addEventListener('online', () => scheduleSync(0))
  scheduleSync(0)

  // `npm run session` in server/ prints a __devSignIn(...) call for this.
  if (import.meta.env.DEV) window.__devSignIn = completeSignIn
}
```

- [ ] **Step 2: Start it in `src/main.jsx`**

After `import { unlockOnFirstGesture } from './lib/speech'` add:

```js
import { startSync } from './lib/sync'
```

After `unlockOnFirstGesture()` add:

```js
// Background sync with the backend, once signed in; see src/lib/sync.js.
startSync()
```

- [ ] **Step 3: Lint and build**

Run: `npm run lint && npm run build`
Expected: no errors.

- [ ] **Step 4: Verify sync end-to-end with the dev sign-in (no Google needed)**

1. `.env.local`: `VITE_API_URL=http://localhost:3000`, `VITE_GOOGLE_CLIENT_ID=dev` (placeholder so `apiEnabled` is true).
2. Terminal 1: `cd server && npm run dev`. Terminal 2: `npm run dev`.
3. Browser A (normal window, with some progress already): `cd server && npm run session -- dev@example.com`, paste the printed `__devSignIn(...)` into the console.
4. Check the DB: `psql -d englishpod -c "select count(*) from cards"` equals the number of local cards; `select * from legacy_days` holds the old daily counts; `select * from listening` has what was played.
5. Browser B (private window, same dev URL): paste the same `__devSignIn(...)` line. The garden shows the same cards and streak; opening an episode played in A resumes at A's position.
6. In B: study a card. Within ~2 s `select count(*) from review_logs` goes up; in A, switch away from the tab and back — the card shows the new schedule.
7. Stop the server, study a card in A (UI keeps working), start the server: the next sync (tab focus or retry) pushes it.
8. In A's console: `localStorage.removeItem('englishpod_auth_v1')` then trigger a sync by refocusing — nothing is sent (signed out), progress still there.

- [ ] **Step 5: Commit**

```bash
git add src/lib/sync.js src/main.jsx
git commit -m "feat: background sync with sign-in and sign-out handling"
```

---

### Task 10: Account button in the layout

**Files:**
- Create: `src/components/AccountButton.jsx`
- Modify: `src/App.jsx`

- [ ] **Step 1: Write `src/components/AccountButton.jsx`**

```jsx
import { useEffect, useRef, useState } from 'react'
import { Loader2, LogOut, RefreshCw } from 'lucide-react'
import { apiEnabled } from '../lib/api'
import { useAuth } from '../lib/auth'
import { renderGoogleButton } from '../lib/googleSignIn'
import { logout, syncNow, useSyncStatus } from '../lib/sync'

/**
 * Signed out: Google's own sign-in button. Signed in: the avatar, opening a
 * menu with the sync status, "sync now" and sign-out. Renders nothing when the
 * backend is not configured.
 */
export default function AccountButton({ compact = false, menuAlign = 'right' }) {
  const auth = useAuth()
  if (!apiEnabled) return null
  return auth ? (
    <AccountMenu user={auth.user} menuAlign={menuAlign} />
  ) : (
    <SignInButton compact={compact} />
  )
}

function SignInButton({ compact }) {
  const ref = useRef(null)
  const { state, error } = useSyncStatus()
  const [loadFailed, setLoadFailed] = useState(false)

  useEffect(() => {
    renderGoogleButton(ref.current, { compact }).catch(() => setLoadFailed(true))
  }, [compact])

  const signingIn = state === 'signing-in'
  return (
    <div className='relative flex flex-col items-start gap-1'>
      {/* Stays mounted: Google renders into it once. */}
      <div ref={ref} className={signingIn ? 'invisible' : ''} />
      {signingIn && (
        <div className='absolute inset-0 flex items-center justify-center gap-2 text-xs text-zinc-500'>
          <Loader2 size={16} className='animate-spin text-indigo-500' />
          {!compact && 'Đang đăng nhập…'}
        </div>
      )}
      {!compact && loadFailed && (
        <span className='text-xs text-red-500'>Không tải được nút Google</span>
      )}
      {!compact && state === 'error' && error && (
        <span className='text-xs text-red-500'>{error}</span>
      )}
    </div>
  )
}

function syncLabel({ state, lastSyncedAt, error }) {
  if (state === 'syncing') return 'Đang đồng bộ…'
  if (state === 'error') return `Chưa đồng bộ được: ${error}`
  if (!lastSyncedAt) return 'Chưa đồng bộ'
  const time = new Date(lastSyncedAt).toLocaleTimeString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
  })
  return `Đồng bộ lúc ${time}`
}

function AccountMenu({ user, menuAlign }) {
  const [open, setOpen] = useState(false)
  const status = useSyncStatus()
  const rootRef = useRef(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  return (
    <div ref={rootRef} className='relative'>
      <button
        onClick={() => setOpen(!open)}
        className='w-9 h-9 rounded-full overflow-hidden shadow-lg ring-2 ring-white dark:ring-zinc-800 bg-indigo-600 text-white text-sm font-semibold flex items-center justify-center'
        title={user.name}
      >
        {user.avatarUrl ? (
          <img
            src={user.avatarUrl}
            alt=''
            referrerPolicy='no-referrer'
            className='w-full h-full object-cover'
          />
        ) : (
          user.name.slice(0, 1).toUpperCase()
        )}
      </button>

      {open && (
        <div
          className={`absolute ${menuAlign === 'left' ? 'left-0' : 'right-0'} top-11 z-50 w-64 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-xl p-3 text-sm`}
        >
          <p className='font-semibold truncate'>{user.name}</p>
          <p className='text-xs text-zinc-500 dark:text-zinc-400 truncate'>{user.email}</p>
          <p className='mt-3 text-xs text-zinc-500 dark:text-zinc-400'>{syncLabel(status)}</p>
          <div className='mt-3 flex gap-2'>
            <button
              onClick={() => syncNow()}
              disabled={status.state === 'syncing'}
              className='flex-1 flex items-center justify-center gap-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 px-2 py-1.5 text-xs font-medium hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-50'
            >
              <RefreshCw size={14} className={status.state === 'syncing' ? 'animate-spin' : ''} />
              Đồng bộ
            </button>
            <button
              onClick={() => logout()}
              className='flex-1 flex items-center justify-center gap-1.5 rounded-lg border border-red-200 dark:border-red-900/50 px-2 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30'
            >
              <LogOut size={14} />
              Đăng xuất
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: `src/App.jsx` — read and save the last episode through the synced settings**

Replace lines 16–37 (the `LAST_EPISODE_KEY` constant and `getLastEpisodeId`) with:

```js
// Last episode opened: part of the synced settings (see src/lib/srsStore.js).
const getLastEpisodeId = () => {
  const id = getSrsState().settings.lastEpisodeId
  return episodesData.some((ep) => ep.id === id) ? id : episodesData[0]?.id || 0
}
```

Replace the effect at lines 46–54 (`// Save current episode to localStorage whenever it changes` and its `useEffect`) with:

```js
  useEffect(() => {
    updateSettings({ lastEpisodeId: currentEpisodeId })
  }, [currentEpisodeId])
```

Add imports after `import EpisodeVocabButton from './components/vocab/EpisodeVocabButton'`:

```js
import AccountButton from './components/AccountButton'
import { getSrsState, updateSettings } from './lib/srsStore'
```

- [ ] **Step 3: `src/App.jsx` — mount the button**

In the mobile toggle row (`<div className='lg:hidden fixed top-4 right-4 z-50 flex gap-2'>`), add as its first child:

```jsx
        <AccountButton compact />
```

In the sidebar header, after the "Vocabulary Garden" `</button>` and before the closing `</div>` of that left column, add:

```jsx
            <div className='hidden lg:block mt-3'>
              <AccountButton menuAlign='left' />
            </div>
```

- [ ] **Step 4: Lint and build**

Run: `npm run lint && npm run build`
Expected: no errors.

- [ ] **Step 5: Verify in the browser**

With the server running and `.env.local` pointing at it:
1. Signed out, desktop width: a "Sign in with Google" pill under "Vocabulary Garden". Mobile width (DevTools device mode): a round G icon at the start of the top-right row.
2. With the placeholder client ID Google shows an error in its popup — expected. Sign in with `__devSignIn(...)` instead: the button becomes the initial "D" avatar; the menu shows name, email, "Đồng bộ lúc HH:MM".
3. "Đồng bộ" spins briefly and updates the time. Stop the server and press it: the label reads "Chưa đồng bộ được: …".
4. Restart the server, "Đăng xuất": the vocab garden is empty, the Google button is back, `localStorage.englishpod_sync_v1` is back to `ownerId: null`.
5. Sign in again with the same `__devSignIn(...)` line (a new session is needed — run `npm run session` again because logout revoked the old one): everything comes back from the server.
6. Dark mode: the menu is readable.
7. With a real `VITE_GOOGLE_CLIENT_ID` (once the user creates one, origin `http://localhost:5173`): the Google button signs in for real, and `select email from users` shows the Google account.

- [ ] **Step 6: Commit**

```bash
git add src/components/AccountButton.jsx src/App.jsx
git commit -m "feat: Google sign-in button and account menu"
```

---

### Task 11: Deploy config and final verification

**Files:**
- Modify: `.github/workflows/deploy.yml`, `README.md`

- [ ] **Step 1: Pass the build variables in `.github/workflows/deploy.yml`**

Replace:

```yaml
      - name: Build
        run: npm run build
```

with:

```yaml
      - name: Build
        run: npm run build
        env:
          # Repository variables; when unset the app builds local-only.
          VITE_API_URL: ${{ vars.VITE_API_URL }}
          VITE_GOOGLE_CLIENT_ID: ${{ vars.VITE_GOOGLE_CLIENT_ID }}
```

- [ ] **Step 2: Mention the backend in the root `README.md`**

Append to `## Features`:

```markdown
- Optional Google sign-in that syncs vocabulary progress and listening history across devices (backend in [`server/`](server/README.md))
```

- [ ] **Step 3: Full verification run**

```bash
source ~/.nvm/nvm.sh && nvm use 22.18.0
(cd server && npm run typecheck && npm run smoke && npm run build)
npm run lint && npm run build
```

Expected: typecheck clean, `All checks passed`, server `dist/` built, lint clean, Vite build succeeds.

Also: `(cd server && npm start)` with `.env` loaded (`node --env-file=.env dist/src/index.js`) answers `curl localhost:3000/health`.

- [ ] **Step 4: Build without the variables still works local-only**

```bash
mv .env.local .env.local.bak && npm run build && npm run preview
```

Open the preview URL: no sign-in button, studying and listening work as before. Then `mv .env.local.bak .env.local`.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/deploy.yml README.md
git commit -m "chore: pass backend settings to the Pages build"
```

- [ ] **Step 6: Hand the deploy steps to the user**

Deploying needs the user's accounts (Google Cloud, Neon, Render, GitHub variables); follow `server/README.md` → "Deploy" with them. Nothing is pushed or deployed by this plan.
