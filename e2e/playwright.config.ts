import { defineConfig, devices } from '@playwright/test'

/**
 * Auth end-to-end suite. `pnpm test:e2e` from the repo root runs it. The two web servers (supabase
 * mode on :5173, mock mode on :5273) are started by `scripts/e2e-servers.mjs` against the local
 * Supabase stack; `global-setup.ts` starts that stack when it is not running.
 */
const WEB_PORT = process.env.E2E_WEB_PORT ?? '5173'
const MOCK_WEB_PORT = process.env.E2E_MOCK_WEB_PORT ?? '5273'

export default defineConfig({
  testDir: '.',
  testMatch: '**/*.spec.ts',
  outputDir: './.output/results',
  // Auth rate limits are per IP and the suite shares one: run the files in order, one worker.
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['json', { outputFile: './.output/report.json' }], ['html', { outputFolder: './.output/html', open: 'never' }]],
  globalSetup: './global-setup.ts',
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    locale: 'en-US',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'node ../scripts/e2e-servers.mjs',
      url: `http://localhost:${WEB_PORT}/auth/sign-in`,
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: 'ignore',
    },
    {
      command: 'node ../scripts/e2e-servers.mjs mock',
      url: `http://localhost:${MOCK_WEB_PORT}/auth/sign-in`,
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: 'ignore',
    },
  ],
})
