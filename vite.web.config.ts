import { resolve } from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * Web build of the same front used by Electron (`npm run dev:web` / `npm run build:web`).
 * In dev, /api is proxied to the rickOS server (server/main.ts, port 4318).
 */
const SERVER = process.env.RICKOS_SERVER_URL || `http://127.0.0.1:${process.env.RICKOS_PORT || 4318}`

export default defineConfig({
  root: '.',
  publicDir: 'public',
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src')
    }
  },
  plugins: [react()],
  server: {
    host: process.env.RICKOS_WEB_HOST || '127.0.0.1',
    port: Number(process.env.RICKOS_WEB_PORT || 5317),
    strictPort: true,
    proxy: {
      '/api': { target: SERVER, changeOrigin: true }
    }
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true
  }
})
