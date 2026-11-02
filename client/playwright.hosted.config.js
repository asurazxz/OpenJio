import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e-hosted',
  retries: 0,
  workers: 1,
  timeout: 45_000,
  use: {
    baseURL: process.env.OPENJIO_BASE_URL || 'http://localhost:8080',
    browserName: 'chromium',
    viewport: { width: 1280, height: 800 },
  },
})
