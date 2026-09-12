import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests.
 *
 * ## What belongs here and what does not
 *
 * Journeys where a break is unrecoverable — see docs/TESTING.md §7. The athlete
 * access flow is the first of them: if activation or sign-in breaks, an athlete
 * has no way in at all and no way to tell anybody. Everything else about the
 * portal is covered by unit and component tests, which are faster and do not
 * need a database.
 *
 * ## Why it runs against a production build
 *
 * `next dev` recompiles per route and reports timings and errors that the
 * deployed app never shows. A smoke test that passes against dev and fails in
 * production would be worse than none.
 *
 * ## Why it is serial and single-worker
 *
 * The journey signs a coach up, creates athletes and hands out one-time links.
 * Two workers doing that at once would share a database and fight over the
 * same rows. Small set, run in order.
 */
export default defineConfig({
  testDir: './e2e',
  // The journey is one story told in order: activate, sign in, look, sign out.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env['CI'],
  retries: 0,
  reporter: process.env['CI'] ? 'github' : 'list',

  timeout: 90_000,
  expect: { timeout: 15_000 },

  use: {
    baseURL: process.env['E2E_BASE_URL'] ?? 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  /**
   * The server under test.
   *
   * Reused when one is already listening, so a developer with `pnpm start`
   * running does not get a second one. `E2E_BASE_URL` skips this entirely for a
   * deployed environment.
   */
  ...(process.env['E2E_BASE_URL']
    ? {}
    : {
        webServer: {
          command: 'pnpm start',
          url: 'http://localhost:3000',
          reuseExistingServer: true,
          timeout: 120_000,
        },
      }),
});
