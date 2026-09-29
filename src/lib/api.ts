// Calls to the sync backend (server/). It is served same-origin under /api —
// Vite proxies it in development, vercel.json rewrites it in production — so
// the HttpOnly session cookie travels with every request by itself.

export const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || ''
// Without a client ID nobody can sign in, so the app stays local-only.
export const apiEnabled = Boolean(GOOGLE_CLIENT_ID)

// Long enough for a sleeping free-tier Render instance to wake up (30–60 s).
const TIMEOUT_MS = 90_000

export class ApiError extends Error {
  status: number // 0 when the request never got an answer
  code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

interface ErrorBody {
  error?: { code?: string; message?: string }
}

/** Resolves to the JSON body (null for a 204): `T` is what the caller expects back. */
export async function api<T = unknown>(
  path: string,
  { method = 'GET', body }: { method?: 'GET' | 'POST'; body?: unknown } = {},
): Promise<T> {
  const post = method === 'POST'
  let res: Response
  try {
    res = await fetch(`/api${path}`, {
      method,
      // The server only accepts JSON POSTs (its CSRF guard), even empty ones.
      headers: post ? { 'Content-Type': 'application/json' } : {},
      body: post ? JSON.stringify(body ?? {}) : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch (error) {
    // Offline, DNS or timeout — all mean "try again later".
    throw new ApiError(0, 'network', (error as Error).message)
  }

  if (res.status === 204) return null as T
  const data: unknown = await res.json().catch(() => null)
  if (!res.ok) {
    const failure = data as ErrorBody | null
    throw new ApiError(
      res.status,
      failure?.error?.code || 'http_error',
      failure?.error?.message || res.statusText,
    )
  }
  return data as T
}
