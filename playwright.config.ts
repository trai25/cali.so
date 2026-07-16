import { defineConfig } from '@playwright/test'

const port = Number(process.env.PLAYWRIGHT_PORT ?? 3102)
const externalBaseUrl = process.env.PLAYWRIGHT_BASE_URL
const baseURL = externalBaseUrl ?? `http://localhost:${port}`

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL,
    channel: 'chrome',
    trace: 'retain-on-failure',
  },
  webServer: externalBaseUrl
    ? undefined
    : {
        command: `pnpm start --hostname localhost --port ${port}`,
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
})
