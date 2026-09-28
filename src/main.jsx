import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './App.css'
import App from './App.jsx'
import { unlockOnFirstGesture } from './lib/speech'
import { startSync } from './lib/sync'

// iOS only allows speech after a user gesture; see src/lib/speech.js.
unlockOnFirstGesture()

// Background sync with the backend, once signed in; see src/lib/sync.js.
startSync()

// Listening history was kept for a while and is no longer used.
try {
  localStorage.removeItem('englishpod_listening_v1')
} catch {
  // Storage blocked: nothing to clean up.
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
