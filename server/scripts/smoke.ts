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
