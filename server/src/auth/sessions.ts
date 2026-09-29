import { createHash, randomBytes } from 'node:crypto'
import type { Request, RequestHandler, Response } from 'express'
import { prisma } from '../db.js'
import { HttpError } from '../errors.js'

export const SESSION_COOKIE = 'ep_session'
const DAY_MS = 24 * 60 * 60 * 1000
// Sliding: every use (at most once a day) pushes the expiry this far out.
const SESSION_MS = 30 * DAY_MS

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
  const now = new Date()
  // Nothing else ever removes an expired session, so a sign-in sweeps this
  // user's; requireAuth drops the one it is shown.
  await prisma.session.deleteMany({ where: { userId, expiresAt: { lte: now } } })
  await prisma.session.create({
    data: { userId, tokenHash: hashToken(token), expiresAt: new Date(now.getTime() + SESSION_MS) },
  })
  return token
}

export async function revokeSession(sessionId: string) {
  await prisma.session.deleteMany({ where: { id: sessionId } })
}

// Secure only over https: local development goes through Vite's plain-http proxy.
const cookieOptions = (req: Request) =>
  ({ httpOnly: true, sameSite: 'lax', secure: req.secure, path: '/' }) as const

export function setSessionCookie(req: Request, res: Response, token: string) {
  res.cookie(SESSION_COOKIE, token, { ...cookieOptions(req), maxAge: SESSION_MS })
}

export function clearSessionCookie(req: Request, res: Response) {
  res.clearCookie(SESSION_COOKIE, cookieOptions(req))
}

function readSessionCookie(req: Request): string | null {
  for (const part of (req.get('cookie') ?? '').split(';')) {
    const [name, ...value] = part.trim().split('=')
    if (name !== SESSION_COOKIE) continue
    try {
      return decodeURIComponent(value.join('='))
    } catch {
      return null // Not one of ours (ours are base64url): treat as signed out.
    }
  }
  return null
}

/** Rejects the request unless it carries a live session cookie. */
export const requireAuth: RequestHandler = async (req, res, next) => {
  const token = readSessionCookie(req)
  if (!token) throw new HttpError(401, 'unauthorized', 'Not signed in')

  const session = await prisma.session.findUnique({ where: { tokenHash: hashToken(token) } })
  const now = Date.now()
  if (!session || session.expiresAt.getTime() <= now) {
    if (session) await revokeSession(session.id)
    clearSessionCookie(req, res)
    throw new HttpError(401, 'unauthorized', 'Session expired')
  }
  if (now - session.lastUsedAt.getTime() > DAY_MS) {
    await prisma.session.update({
      where: { id: session.id },
      data: { lastUsedAt: new Date(now), expiresAt: new Date(now + SESSION_MS) },
    })
    setSessionCookie(req, res, token)
  }

  res.locals.auth = { userId: session.userId, sessionId: session.id } satisfies SessionAuth
  next()
}

/** The session requireAuth attached to this response. */
export function authOf(res: Response): SessionAuth {
  return res.locals.auth as SessionAuth
}
