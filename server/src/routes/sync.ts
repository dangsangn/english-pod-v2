import { Router } from 'express'
import { authOf, requireAuth } from '../auth/sessions.js'
import { limit } from '../rateLimit.js'
import { syncRequestSchema } from '../sync/schema.js'
import { runSync } from '../sync/service.js'

export function syncRoutes() {
  const router = Router()
  const perUser = limit(60 * 1000, 120, (_req, res) => authOf(res).userId)
  router.post('/sync', requireAuth, perUser, async (req, res) => {
    const body = syncRequestSchema.parse(req.body)
    res.json(await runSync(authOf(res).userId, body))
  })
  return router
}
