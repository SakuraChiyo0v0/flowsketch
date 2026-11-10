import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type ProxyOptions } from 'vite'

// The LLM key lives only in .env.local (server side). The browser calls /api/llm,
// and the dev/preview server forwards it to the OpenAI-compatible gateway with the key attached.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, import.meta.dirname, '')
  const target = env.LLM_BASE_URL || 'http://127.0.0.1:3300/v1'
  const key = env.LLM_API_KEY || ''
  const proxy: Record<string, ProxyOptions> = {
    '/api/llm': {
      target,
      changeOrigin: true,
      rewrite: (p: string) => p.replace(/^\/api\/llm/, ''),
      configure: (proxyServer) => {
        proxyServer.on('proxyReq', (req) => {
          // a key typed in the app's settings takes precedence over the server one
          const auth = String(req.getHeader('authorization') ?? '').trim()
          if (key && (auth === '' || auth === 'Bearer')) req.setHeader('authorization', `Bearer ${key}`)
        })
      },
    },
  }
  return {
    root: import.meta.dirname,
    envDir: import.meta.dirname,
    plugins: [react()],
    server: { port: 5199, proxy },
    preview: { port: 5199, proxy },
  }
})
