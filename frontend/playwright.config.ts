import { defineConfig, devices } from '@playwright/test'

const isCI = !!process.env.CI

export default defineConfig({
  testDir: './e2e',
  timeout: 60000, // Longer timeout for E2E tests
  expect: {
    timeout: 10000, // Longer expect timeout for async operations
  },
  fullyParallel: false, // Run tests sequentially for consistent state
  forbidOnly: isCI, // Fail if test.only is committed
  retries: isCI ? 2 : 0, // Retry on CI
  workers: 1, // Single worker for consistent state
  reporter: isCI ? 'github' : 'list',
  use: {
    baseURL: process.env.FRONTEND_URL || 'http://localhost:5173',
    headless: true,
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // Only start webServer in local development (not in CI with Docker)
  ...(!isCI && {
    webServer: {
      command: 'npm run dev',
      port: 5173,
      reuseExistingServer: true,
    },
  }),
})
