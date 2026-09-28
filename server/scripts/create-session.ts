// Dev helper: sign a browser in without Google. Creates (or reuses) a user for
// the given email, opens a session, and prints what to paste into the console
// of the dev app (http://localhost:5173). It talks to the database directly —
// there is no HTTP backdoor — so it only reaches whatever DATABASE_URL points at.
//
//   pnpm session -- someone@example.com
//
// The cookie it sets is not HttpOnly (a page cannot set one that is); the
// server does not care, and a real sign-in replaces it.

import { createSession, SESSION_COOKIE } from '../src/auth/sessions.js'
import { prisma } from '../src/db.js'
import { toPublicUser } from '../src/routes/auth.js'

// `pnpm session -- x` passes the `--` through.
const email = process.argv.slice(2).find((arg) => arg !== '--') ?? 'dev@example.com'
const googleSub = `dev:${email}`
const user = await prisma.user.upsert({
  where: { googleSub },
  create: { googleSub, email, name: email.split('@')[0] },
  update: {},
})
const token = await createSession(user.id)
console.log(
  `document.cookie = '${SESSION_COOKIE}=${token}; path=/; max-age=2592000; samesite=lax'; ` +
    `__devSignIn(${JSON.stringify({ user: toPublicUser(user) })})`,
)
await prisma.$disconnect()
