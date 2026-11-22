import { chromium } from '@playwright/test'

const AUTH_HEALTH = 'http://127.0.0.1:54321/auth/v1/health'

async function up(url: string): Promise<boolean> {
  try {
    return (await fetch(url, { signal: AbortSignal.timeout(2000) })).status < 500
  } catch {
    return false
  }
}

/** `pnpm test:e2e` starts the stack first; this waits until Auth and the API answer. */
export default async function globalSetup() {
  for (const [name, url] of [
    ['local Supabase (run pnpm db:start)', AUTH_HEALTH],
    ['the API on :3000', 'http://localhost:3000/health'],
    ['the mock-mode API on :3100', 'http://localhost:3100/health'],
  ] as const) {
    let ok = false
    for (let i = 0; i < 60 && !ok; i++) {
      ok = await up(url)
      if (!ok) await new Promise((r) => setTimeout(r, 1000))
    }
    if (!ok) throw new Error(`${name} did not answer`)
  }
  await warmUpVite()
}

/**
 * Vite optimises a dependency the first time a lazy route imports it and then reloads the page, which
 * wipes a form a test has just filled. Visiting every route once through the mock-mode pair (no sign-in
 * needed) pays that cost before the first test.
 */
async function warmUpVite() {
  const origin = `http://localhost:${process.env.E2E_MOCK_WEB_PORT ?? '5273'}`
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage()
    const unknown = '00000000-0000-7000-8000-000000000000'
    for (const path of ['/stocks', '/stocks/new', `/stocks/${unknown}`, `/stocks/${unknown}/edit`, '/lists', `/lists/${unknown}`, '/import-export', '/concentration', '/chains', '/account']) {
      await page.goto(`${origin}${path}`)
      await page.waitForLoadState('networkidle')
    }
    await page.goto(`${origin}/stocks/new`)
    await page.locator('#stock-exchange').waitFor()
    await page.getByRole('radio', { name: 'US', exact: true }).click()
    await page.locator('#stock-exchange').click()
    await page.keyboard.press('Escape')
    await page.waitForLoadState('networkidle')
  } finally {
    await browser.close()
  }
}
