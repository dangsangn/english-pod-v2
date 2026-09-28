export interface AppConfig {
  port: number
  /** Empty when not set up yet: /auth/google then answers 503 instead of trusting any token. */
  googleClientId: string
  /** Origins the frontend is served from; POSTs from anywhere else are refused. */
  allowedOrigins: string[]
  /** Proxy hops in front of the server, so req.ip is the client's address. */
  trustProxy: number
}

export function loadConfig(env = process.env): AppConfig {
  return {
    port: Number(env.PORT ?? 3001),
    googleClientId: env.GOOGLE_CLIENT_ID ?? '',
    allowedOrigins: (env.ALLOWED_ORIGINS ?? '')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
    trustProxy: Number(env.TRUST_PROXY ?? 1),
  }
}
