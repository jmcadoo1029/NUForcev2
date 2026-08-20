import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// V2 dev server. Runs at http://localhost:5173.
// Note: on localhost the app reads its session from localStorage (see
// src/lib/auth.ts) rather than the .nulabs.com cookie, so a dev token must
// be seeded once to view real data. Strictly read-only until deploy.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, open: true },
})
