import { createApp } from './app.js'
import { loadConfig } from './config.js'

const config = loadConfig()
if (!config.googleClientId) console.warn('GOOGLE_CLIENT_ID is not set: Google sign-in is disabled')

createApp(config).listen(config.port, () => {
  console.log(`API listening on http://localhost:${config.port}`)
})
