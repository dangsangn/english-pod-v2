import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react({
      babel: {
        plugins: ['babel-plugin-react-compiler'],
      },
    }),
  ],
  base: './', // Use relative paths for assets
  server: {
    // The API is same-origin under /api, as vercel.json rewrites it in
    // production, so the session cookie is first-party. See server/README.md.
    proxy: {
      '/api': {
        target: process.env.API_PROXY_TARGET || 'http://localhost:3001',
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
  optimizeDeps: {
    include: ['lucide-react'],
  },
})
