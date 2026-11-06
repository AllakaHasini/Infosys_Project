import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const backendTarget = env.VITE_BACKEND_TARGET || process.env.VITE_BACKEND_TARGET || 'http://127.0.0.1:8000'
  const isHttps = env.VITE_HTTPS === 'true' || process.env.VITE_HTTPS === 'true'

  const plugins = [react()]
  if (isHttps) {
    plugins.push(basicSsl())
  }

  return {
    plugins,
    server: {
      host: '0.0.0.0',
      port: 5173,
      proxy: {
        '/api': {
          target: backendTarget,
          changeOrigin: true,
          secure: false,
          configure: (proxy) => {
            proxy.on('error', (err, _req, res) => {
              if (res.writeHead && !res.headersSent) {
                res.writeHead(502, { 'Content-Type': 'application/json' })
                res.end(
                  JSON.stringify({
                    detail: `Backend server is not reachable at ${backendTarget}. Please ensure the FastAPI server is running on port 8000.`,
                  })
                )
              }
            })
          },
        },
      },
    },
  }
})
