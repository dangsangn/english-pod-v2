import { OAuth2Client } from 'google-auth-library'
import { HttpError } from '../errors.js'

export interface GoogleProfile {
  sub: string
  email: string
  name: string
  avatarUrl: string | null
}

const client = new OAuth2Client()

/** Check an ID token from Google Identity Services and return who it is for. */
export async function verifyGoogleCredential(
  credential: string,
  clientId: string,
): Promise<GoogleProfile> {
  // Without an audience verifyIdToken accepts tokens minted for any app.
  if (!clientId) throw new HttpError(503, 'google_not_configured', 'Google sign-in is not configured')

  let payload
  try {
    const ticket = await client.verifyIdToken({ idToken: credential, audience: clientId })
    payload = ticket.getPayload()
  } catch (error) {
    // The reason (expired, wrong audience, bad signature…) stays in the server log.
    console.warn('Google ID token rejected:', (error as Error).message)
    throw new HttpError(401, 'invalid_google_token', 'Google sign-in failed')
  }
  if (!payload?.email || !payload.email_verified) {
    throw new HttpError(401, 'invalid_google_token', 'Google account has no verified email')
  }
  return {
    sub: payload.sub,
    email: payload.email,
    name: payload.name ?? payload.email,
    avatarUrl: payload.picture ?? null,
  }
}
