import type { RequestHandler } from 'express'
import { HttpError } from './errors.js'

/**
 * The session cookie rides along on any request the browser makes to us, so a
 * page on another site could make a signed-in user's browser POST here. Refuse
 * POSTs that do not come from our own pages, and require a JSON body: an HTML
 * form cannot send application/json, and fetch cannot send it cross-site
 * without a preflight we never approve.
 */
export function sameOriginPosts(allowedOrigins: string[]): RequestHandler {
  return (req, _res, next) => {
    if (req.method !== 'POST') return next()
    const origin = req.get('origin')
    if (!origin || !allowedOrigins.includes(origin)) {
      return next(new HttpError(403, 'forbidden_origin', 'Origin not allowed'))
    }
    if (!req.is('application/json')) {
      return next(new HttpError(415, 'unsupported_media_type', 'Expected application/json'))
    }
    next()
  }
}
