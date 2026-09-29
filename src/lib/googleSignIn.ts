// Google Identity Services: load the script once, initialise it once, render
// as many buttons as the layout needs. The ID token goes to whatever handler
// sync.ts registered.

import { GOOGLE_CLIENT_ID } from './api'

// The slice of the GIS API used here.
interface GoogleButtonOptions {
  type: 'standard' | 'icon'
  shape: 'pill' | 'circle'
  size: 'medium'
  text?: 'signin_with'
}

interface GoogleIdentity {
  accounts: {
    id: {
      initialize(config: {
        client_id: string
        callback: (response: { credential: string }) => void
      }): void
      renderButton(element: HTMLElement, options: GoogleButtonOptions): void
    }
  }
}

declare global {
  interface Window {
    google?: GoogleIdentity
  }
}

let ready: Promise<GoogleIdentity> | null = null
let onCredential: (credential: string) => void = () => {}

export function setCredentialHandler(handler: (credential: string) => void) {
  onCredential = handler
}

function loadGis() {
  ready ??= new Promise<GoogleIdentity>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.onload = () => {
      const google = window.google as GoogleIdentity
      google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: (response) => onCredential(response.credential),
      })
      resolve(google)
    }
    script.onerror = () => {
      ready = null // let the next render try again
      reject(new Error('Google Sign-In failed to load'))
    }
    document.head.appendChild(script)
  })
  return ready
}

export async function renderGoogleButton(element: HTMLElement, { compact = false } = {}) {
  const google = await loadGis()
  google.accounts.id.renderButton(
    element,
    compact
      ? { type: 'icon', shape: 'circle', size: 'medium' }
      : { type: 'standard', shape: 'pill', size: 'medium', text: 'signin_with' },
  )
}
