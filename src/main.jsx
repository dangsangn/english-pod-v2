import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './App.css'
import App from './App.jsx'
import { unlockOnFirstGesture } from './lib/speech'

// iOS only allows speech after a user gesture; see src/lib/speech.js.
unlockOnFirstGesture()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
