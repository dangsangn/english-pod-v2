import { Router } from 'express'
import { z } from 'zod'
import { verifyGoogleCredential } from '../auth/google.js'
import {
  authOf,
  clearSessionCookie,
  createSession,
  requireAuth,
  revokeSession,
  setSessionCookie,
} from '../auth/sessions.js'
import type { AppConfig } from '../config.js'
import { prisma } from '../db.js'
import type { User } from '../generated/prisma/client.js'
import { limit } from '../rateLimit.js'

export function toPublicUser(user: User) {
  return { id: user.id, email: user.email, name: user.name, avatarUrl: user.avatarUrl }
}

const googleBody = z.object({ credential: z.string().min(1).max(10_000) })

export function authRoutes(config: AppConfig) {
  const router = Router()
  const authLimit = limit(15 * 60 * 1000, 20)

  router.post('/auth/google', authLimit, async (req, res) => {
    const { credential } = googleBody.parse(req.body)
    const profile = await verifyGoogleCredential(credential, config.googleClientId)
    const fields = { email: profile.email, name: profile.name, avatarUrl: profile.avatarUrl }
    const user = await prisma.user.upsert({
      where: { googleSub: profile.sub },
      create: { googleSub: profile.sub, ...fields },
      update: { ...fields, lastLoginAt: new Date() },
    })
    setSessionCookie(req, res, await createSession(user.id))
    res.json({ user: toPublicUser(user) })
  })

  router.post('/auth/logout', authLimit, requireAuth, async (req, res) => {
    await revokeSession(authOf(res).sessionId)
    clearSessionCookie(req, res)
    res.status(204).end()
  })

  router.get('/me', requireAuth, async (_req, res) => {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: authOf(res).userId } })
    res.json({ user: toPublicUser(user) })
  })

  return router
}
