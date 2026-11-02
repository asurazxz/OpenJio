import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'

// Browser calls stay on the current origin; only Vite talks to Docker.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '..', 'OPENJIO_')
  const target = process.env.OPENJIO_DOCKER_URL || env.OPENJIO_DOCKER_URL || 'http://127.0.0.1:8080'
  return {
    plugins: [vue()],
    envDir: '..',
    server: {
      port: 5173, strictPort: true,
      proxy: Object.fromEntries(['/config.json', '/supabase', '/backend', '/api'].map(path => [path, { target, changeOrigin: true }])),
    },
  }
})
