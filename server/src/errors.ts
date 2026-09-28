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
