import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests run against the dev server and the mock server, both of
 * which must already be running:
 *
 *   pnpm mock          # terminal 1, needs JWT_SECRET
 *   pnpm dev           # terminal 2
 *   pnpm --filter @aegis/console e2e
 *
 * They are not started here on purpose: seeding 50,000 devices takes about
 * twenty seconds, and a test run that reseeds every time is a test run nobody
 * will wait for.
 */
export default defineConfig({
  testDir: './e2e',
  // Sign-in is a real OIDC round trip, so each test does a little real work.
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: process.env['E2E_BASE_URL'] ?? 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    viewport: { width: 1680, height: 1000 },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], channel: 'chrome' } }],
});
