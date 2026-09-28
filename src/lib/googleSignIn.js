// Google Identity Services: load the script once, initialise it once, render
// as many buttons as the layout needs. The ID token goes to whatever handler
// sync.js registered.

import { GOOGLE_CLIENT_ID } from './api'

let ready = null
let onCredential = () => {}

export function setCredentialHandler(handler) {
  onCredential = handler
}

function loadGis() {
  ready ??= new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.onload = () => {
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: (response) => onCredential(response.credential),
      })
      resolve(window.google)
    }
    script.onerror = () => {
      ready = null // let the next render try again
      reject(new Error('Google Sign-In failed to load'))
    }
    document.head.appendChild(script)
  })
  return ready
}

export async function renderGoogleButton(element, { compact = false } = {}) {
  const google = await loadGis()
  google.accounts.id.renderButton(
    element,
    compact
      ? { type: 'icon', shape: 'circle', size: 'medium' }
      : { type: 'standard', shape: 'pill', size: 'medium', text: 'signin_with' },
  )
}
