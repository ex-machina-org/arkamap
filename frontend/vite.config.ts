import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { Agent as HttpAgent } from 'node:http'
import { Agent as HttpsAgent } from 'node:https'
import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv, searchForWorkspaceRoot } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ mode, command }) => {
  const env = loadEnv(mode, process.cwd(), 'ARKAMAP_')
  const target = process.env.ARKAMAP_API_TARGET || env.ARKAMAP_API_TARGET || 'http://127.0.0.1:8001'
  const upstream = new URL(target)
  const hosted = mode === 'hosted'
  const appKey = process.env.ARKAMAP_API_KEY || env.ARKAMAP_API_KEY
  // Only the dev proxy injects the key; a hosted build relies on its serving proxy instead.
  if (hosted && command === 'serve' && !appKey) throw new Error('Isi ARKAMAP_API_KEY pada .env.hosted.local sebelum menjalankan dev:hosted.')
  if (!['http:', 'https:'].includes(upstream.protocol) || upstream.username || upstream.password || upstream.pathname !== '/' || upstream.search || upstream.hash) {
    throw new Error('ARKAMAP_API_TARGET harus berupa origin HTTP(S) tanpa credentials/path/query.')
  }
  return {
  plugins: [react(), tailwindcss()],
  // The API contract lives in ../docs/backend, shared with the backend that generates it.
  server: { fs: { allow: [searchForWorkspaceRoot(process.cwd()), '../docs/backend'] },
    proxy: { "/api": { target: upstream.origin, changeOrigin: true,
    // Node gives each resolved address only 250 ms; with unreachable IPv6 and a slow IPv4 handshake
    // the hosted API intermittently failed with ETIMEDOUT. Allow longer attempts and reuse connections.
    agent: new (upstream.protocol === 'https:' ? HttpsAgent : HttpAgent)({ keepAlive: true, autoSelectFamilyAttemptTimeout: 2000 }),
    configure(proxy) {
      proxy.on('proxyReq', (request) => {
        if (appKey) { request.setHeader('X-API-Key', appKey); request.removeHeader('cookie') }
      })
    },
  } } },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  }
})
