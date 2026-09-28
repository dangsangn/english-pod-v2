// End-to-end check of the API against a real database. Creates its own user,
// plays two "devices" of that user against /sync, and deletes the user at the
// end. Run with `pnpm smoke` (uses DATABASE_URL from .env).

import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import type { AddressInfo } from 'node:net'
import { createApp } from '../src/app.js'
import { createSession, SESSION_COOKIE } from '../src/auth/sessions.js'
import { prisma } from '../src/db.js'

const ORIGIN = 'http://smoke.test'
const server = createApp({
  port: 0,
  googleClientId: 'smoke-test.apps.googleusercontent.com',
  allowedOrigins: [ORIGIN],
  trustProxy: 1,
}).listen(0)
await new Promise((resolve) => server.once('listening', resolve))
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`

interface CallOptions {
  method?: string
  /** Session token sent as the cookie. */
  session?: string
  body?: unknown
  origin?: string | null
  contentType?: string
}

/** A browser-like request: POSTs carry our Origin and a JSON body unless told otherwise. */
async function call(path: string, options: CallOptions = {}) {
  const { method = 'GET', session, origin = ORIGIN } = options
  const headers: Record<string, string> = {}
  if (session) headers.Cookie = `${SESSION_COOKIE}=${session}`
  let body: string | undefined
  if (method === 'POST') {
    if (origin) headers.Origin = origin
    headers['Content-Type'] = options.contentType ?? 'application/json'
    body = JSON.stringify(options.body ?? {})
  }
  const res = await fetch(base + path, { method, headers, body })
  const text = await res.text()
  return {
    status: res.status,
    body: (text ? JSON.parse(text) : null) as any,
    cookies: res.headers.getSetCookie(),
  }
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
const session = await createSession(user.id)

// --- auth checks ---

await check('health', async () => {
  const res = await call('/health')
  assert.equal(res.status, 200)
  assert.deepEqual(res.body, { ok: true })
})

await check('/me without a cookie is 401', async () => {
  const res = await call('/me')
  assert.equal(res.status, 401)
  assert.equal(res.body.error.code, 'unauthorized')
})

await check('/me with an unknown session is 401', async () => {
  const res = await call('/me', { session: 'not-a-real-token' })
  assert.equal(res.status, 401)
})

await check('/me returns the signed-in user', async () => {
  const res = await call('/me', { session })
  assert.equal(res.status, 200)
  assert.equal(res.body.user.id, user.id)
  assert.equal(res.body.user.email, 'smoke@example.com')
})

await check('a session used after a day is extended with a fresh HttpOnly cookie', async () => {
  const other = await createSession(user.id)
  await prisma.session.updateMany({
    where: { userId: user.id },
    data: { lastUsedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) },
  })
  const res = await call('/me', { session: other })
  assert.equal(res.status, 200)
  const cookie = res.cookies.find((c) => c.startsWith(`${SESSION_COOKIE}=${other}`))
  assert.ok(cookie, `no refreshed cookie in ${JSON.stringify(res.cookies)}`)
  assert.match(cookie, /HttpOnly/)
  assert.match(cookie, /SameSite=Lax/)
  assert.match(cookie, /Max-Age=2592000/)
})

await check('a POST from another origin is 403', async () => {
  const res = await call('/auth/google', { method: 'POST', origin: 'https://evil.example', body: { credential: 'x' } })
  assert.equal(res.status, 403)
  assert.equal(res.body.error.code, 'forbidden_origin')
})

await check('a POST without an Origin is 403', async () => {
  const res = await call('/auth/google', { method: 'POST', origin: null, body: { credential: 'x' } })
  assert.equal(res.status, 403)
})

await check('a non-JSON POST is 415', async () => {
  const res = await call('/auth/google', { method: 'POST', contentType: 'text/plain' })
  assert.equal(res.status, 415)
  assert.equal(res.body.error.code, 'unsupported_media_type')
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

interface Device {
  cursor: number | null
}
const A: Device = { cursor: null }
const B: Device = { cursor: null }

async function sync(device: Device, changes: Record<string, unknown> = {}) {
  const res = await call('/sync', { method: 'POST', session, body: { cursor: device.cursor, changes } })
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

await check('/sync without a session is 401', async () => {
  const res = await call('/sync', { method: 'POST', body: { cursor: null, changes: {} } })
  assert.equal(res.status, 401)
})

await check('/sync with a malformed body is 400', async () => {
  const res = await call('/sync', { method: 'POST', session, body: { cursor: 'x', changes: {} } })
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

await check('logout revokes the session and clears the cookie', async () => {
  const other = await createSession(user.id)
  const res = await call('/auth/logout', { method: 'POST', session: other })
  assert.equal(res.status, 204)
  assert.ok(res.cookies.some((c) => c.startsWith(`${SESSION_COOKIE}=;`)), JSON.stringify(res.cookies))
  assert.equal((await call('/me', { session: other })).status, 401)
  assert.equal((await call('/me', { session })).status, 200)
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
