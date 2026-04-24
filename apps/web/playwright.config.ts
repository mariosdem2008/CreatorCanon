import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config for the minimal creator-journey E2E. Uses the dev
 * server with DEV_AUTH_BYPASS_ENABLED=true so the test can sign in
 * without hitting Google OAuth. Stripe checkout is NOT exercised in
 * the E2E — that remains a manual test-card checklist. The spec stops
 * at the checkout page assertion to keep the test deterministic.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    trace: 'retain-on-failure',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: process.env.E2E_EXTERNAL
    ? undefined
    : {
        command: 'pnpm dev',
        url: 'http://localhost:3000',
        timeout: 120_000,
        reuseExistingServer: !process.env.CI,
        env: {
          DEV_AUTH_BYPASS_ENABLED: 'true',
        },
      },
});
