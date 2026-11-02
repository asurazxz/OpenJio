import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  retries: 0,
  workers: 1,
  timeout: 30_000,
  use: {
    baseURL: 'http://127.0.0.1:5176',
  },
  webServer: {
    command: 'pnpm exec vite --host 127.0.0.1 --port 5176 --strictPort',
    env: { VITE_DATA_MODE: 'demo' },
    url: 'http://127.0.0.1:5176',
    reuseExistingServer: false,
  },
  projects: [
    {
      name: 'chromium',
      use: {
        browserName: 'chromium',
        viewport: { width: 1280, height: 800 },
      },
    },
    {
      name: 'mobile',
      use: {
        browserName: 'chromium',
        viewport: { width: 375, height: 812 },
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
})
