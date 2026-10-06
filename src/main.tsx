import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './App.css'
import App from './App'
import { unlockOnFirstGesture } from './lib/speech'
import { startSync } from './lib/sync'

// iOS only allows speech after a user gesture; see src/lib/speech.ts.
unlockOnFirstGesture()

// Background sync with the backend, once signed in; see src/lib/sync.ts.
startSync()

// No longer used: listening history, and the cache of machine translations
// (MyMemory) from before only hand-written Vietnamese was shown.
try {
  localStorage.removeItem('englishpod_listening_v1')
  localStorage.removeItem('englishpod_translate_v1')
} catch {
  // Storage blocked: nothing to clean up.
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
