import express from 'express'
import type { AppConfig } from './config.js'
import { errorHandler, notFound } from './errors.js'
import { authRoutes } from './routes/auth.js'
import { sameOriginPosts } from './sameOrigin.js'

// The frontend reaches this server same-origin: Vercel rewrites /api/* here in
// production and Vite proxies it in development, so there is no CORS, and the
// session cookie is first-party.
export function createApp(config: AppConfig) {
  const app = express()
  app.set('trust proxy', config.trustProxy)
  app.use(sameOriginPosts(config.allowedOrigins))
  // A first sync uploads the whole local collection (~4,000 cards is ~1.5 MB).
  app.use(express.json({ limit: '5mb' }))

  // Also what the frontend hits to wake a sleeping free-tier instance.
  app.get('/health', (_req, res) => {
    res.json({ ok: true })
  })

  app.use(authRoutes(config))

  app.use(notFound)
  app.use(errorHandler)
  return app
}
