import type { Request, Response } from 'express'
import { rateLimit } from 'express-rate-limit'
import { HttpError } from './errors.js'

/**
 * A limiter that answers in the same error shape as everything else. Keyed by
 * client IP unless `key` says otherwise — behind the Vercel rewrite many users
 * can share an address, so signed-in routes key on the user instead.
 */
export function limit(windowMs: number, max: number, key?: (req: Request, res: Response) => string) {
  return rateLimit({
    windowMs,
    limit: max,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    ...(key && { keyGenerator: key }),
    handler: (_req, _res, next) => next(new HttpError(429, 'rate_limited', 'Too many requests')),
  })
}
