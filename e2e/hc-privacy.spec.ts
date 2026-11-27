import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type Page, type Request } from '@playwright/test'
import { CONCENTRATION_LENSES } from '../packages/domain/src/index.ts'
import { holdingCard, openAs, pickOption } from './lib/hc.ts'
import { apiAs, fillStockForm, h1, newUser, openSignedIn, saveStock, settled, storedToken, toast, us, WEB_ORIGIN } from './lib/sl.ts'

/** Dataset HC-F (isolation) and HC-G (log sentinels) of test-cases.md §5.2; no other test uses these values. */
const SHARES = '7351.2468'
const COST = '9182.7364'
const RATE = '36.482917'

/** Everything a page showed or stored, collected to prove a value never reached it. */
async function surface(page: Page): Promise<string> {
  const storage = await page.evaluate(() => JSON.stringify([{ ...localStorage }, { ...sessionStorage }]))
  return `${await page.content()}\n${page.url()}\n${await page.title()}\n${storage}`
}

test.describe('privacy and isolation in the browser', () => {
  test('TC-E-413: V never sees U: DOM, responses, storage, URLs and a direct PATCH', async ({ browser }) => {
    // Arrange: HC-F
    const U = await newUser('e2e-hc-u')
    const V = await newUser('e2e-hc-v')
    const apiU = await apiAs(U)
    const apiV = await apiAs(V)
    const nvda = await apiU.stock(us('NVDA', { name: 'NVIDIA Corporation', gicsSector: 'Information Technology', holding: { shares: SHARES, averageCost: COST } }))
    const uList = await apiU.list('U core')
    await apiU.addToList(uList.id, nvda.id)
    await apiU.saveSettings({ concentrationThreshold: 25, usdThbRate: RATE })
    await apiV.stock(us('AAPL', { name: 'Apple Inc', holding: { shares: '1', averageCost: '1' } }))
    await apiV.list('V list')
    const ctxV = await browser.newContext()
    const pageV = await ctxV.newPage()
    const bodies: string[] = []
    pageV.on('response', async (r) => {
      if (r.url().includes('/api/')) bodies.push(await r.text().catch(() => ''))
    })
    const seen: string[] = []
    const keep = async () => void seen.push(await surface(pageV))

    // Act: V uses the whole app
    await openAs(pageV, V, '/stocks')
    await keep()
    await expect(pageV.getByRole('link', { name: 'AAPL', exact: true })).toBeVisible()
    await expect(pageV.getByRole('link', { name: 'NVDA' })).toHaveCount(0)
    await pageV.goto('/concentration')
    await settled(pageV)
    for (const lens of CONCENTRATION_LENSES) {
      await pickOption(pageV, 'Group by', lens.label)
      await keep()
    }
    await pickOption(pageV, 'Group by', 'Sector (GICS)')
    await pageV.getByRole('button', { name: 'Settings' }).click()
    await expect(pageV.getByLabel('Warning threshold')).toHaveValue('40')
    await expect(pageV.getByLabel('Exchange rate, THB per 1 USD')).toHaveValue('')
    await keep()
    await pageV.keyboard.press('Escape')
    for (const path of [`/stocks/${nvda.id}`, `/stocks/${nvda.id}/edit`]) {
      await pageV.goto(path)
      await expect(h1(pageV)).toHaveText('Not found')
      await keep()
    }
    await pageV.goto(`/concentration?scope=${uList.id}`)
    await expect(pageV.getByText('That list no longer exists. Showing all stocks.')).toBeVisible()
    await keep()
    const token = await storedToken(pageV)
    const direct = await pageV.evaluate(
      async ([id, bearer]) => {
        const res = await fetch(`/api/stocks/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json', authorization: `Bearer ${bearer}` }, body: JSON.stringify({ holding: { shares: '1' } }) })
        return res.status
      },
      [nvda.id, token] as const,
    )
    const settingsV = await apiV.settings()

    // Assert: nothing of U's anywhere in V's world, and U's data is untouched
    expect(direct).toBe(404)
    expect(settingsV).toEqual({ concentrationThreshold: 40, usdThbRate: null, usdThbRateUpdatedAt: null, language: null })
    const everything = [...seen, ...bodies].join('\n')
    for (const secret of ['NVDA', 'NVIDIA', 'U core', '7351', '7,351', '9182', '9,182', '36.4829', '36.48']) expect(everything, secret).not.toContain(secret)
    expect((await apiU.getStock(nvda.id)).holding).toEqual({ shares: '7351.2468', averageCost: '9182.7364', costCurrency: 'USD' })
    expect(await apiU.settings()).toMatchObject({ concentrationThreshold: 25, usdThbRate: '36.482917' })

    // Assert: the reverse, U's session does not show V's data
    const ctxU = await browser.newContext()
    const pageU = await ctxU.newPage()
    await openAs(pageU, U, '/stocks')
    await expect(pageU.getByRole('link', { name: 'NVDA', exact: true })).toBeVisible()
    await pageU.goto('/concentration')
    await settled(pageU)
    expect(await surface(pageU)).not.toContain('AAPL')
    expect(await surface(pageU)).not.toContain('V list')
    await ctxV.close()
    await ctxU.close()
  })

  test('TC-E-414: no third party, no leak to URLs, titles, storage or the API log', async ({ page, context }) => {
    // Arrange
    const user = await newUser('e2e-hc-priv')
    const api = await apiAs(user)
    await api.list('Core holdings')
    const requests: Request[] = []
    context.on('request', (r) => requests.push(r))
    await openSignedIn(page, user, '/stocks/new')
    await settled(page)
    requests.length = 0
    const titles: string[] = []
    const snapshot = async () => titles.push(await page.title(), page.url())
    let lastRequestId = ''
    page.on('response', (r) => {
      if (r.url().includes('/api/')) lastRequestId = r.headers()['x-request-id'] ?? lastRequestId
    })

    // Act: add a held stock, open it, edit, open the concentration page, save the rate, change every control
    await fillStockForm(page, { market: 'US', ticker: 'PRIV', exchange: 'NASDAQ', name: 'Privacy Inc', selects: { gicsSector: 'Information Technology' } })
    await page.getByRole('checkbox', { name: 'I hold this stock' }).check()
    await page.locator('#stock-holdingShares').fill(SHARES)
    await page.locator('#stock-holdingAverageCost').fill(COST)
    await saveStock(page).click()
    await expect(toast(page, 'PRIV added')).toBeVisible()
    await expect(holdingCard(page).getByText(/7,?351\.2468/)).toBeVisible()
    await snapshot()
    await page.getByRole('link', { name: 'Edit' }).click()
    await page.locator('#stock-name').fill('Privacy Incorporated')
    await page.getByRole('button', { name: 'Save changes' }).click()
    await expect(toast(page, 'PRIV updated')).toBeVisible()
    await snapshot()
    await page.goto('/concentration')
    await settled(page)
    await page.getByRole('button', { name: 'Settings' }).click()
    await page.getByLabel('Exchange rate, THB per 1 USD').fill(RATE)
    await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click()
    await expect(toast(page, 'Settings saved')).toBeVisible()
    await pickOption(page, 'Group by', 'Style')
    await pickOption(page, 'Scope', /^Held stocks/)
    await page.getByRole('radio', { name: 'Value at cost' }).click()
    await expect(page.getByText(/Threshold 40% · 1 USD = 36.482917 THB/)).toBeVisible()
    await snapshot()
    const storage = await page.evaluate(() => JSON.stringify([{ ...localStorage }, { ...sessionStorage }]))

    // Assert: every request goes to the web origin (the /api proxy)
    const hosts = new Set(requests.map((r) => new URL(r.url()).origin))
    expect([...hosts]).toEqual([WEB_ORIGIN])
    expect(requests.filter((r) => /\.(js|css|woff2?|png|jpg|svg)(\?|$)/.test(r.url()) && !r.url().startsWith(WEB_ORIGIN))).toEqual([])

    // Assert: sentinels only in the bodies of the stock POST/PATCH and the settings PATCH
    const withSecret: string[] = []
    for (const r of requests) {
      const referer = r.headers()['referer'] ?? ''
      for (const part of [r.url(), referer]) for (const s of [SHARES, COST, RATE]) expect(part, `${r.method()} ${r.url()}`).not.toContain(s)
      if ([SHARES, COST, RATE].some((s) => (r.postData() ?? '').includes(s))) withSecret.push(`${r.method()} ${new URL(r.url()).pathname}`)
    }
    // The edit changed only the name, so its PATCH carries no holding.
    expect(withSecret.sort()).toEqual(['PATCH /api/settings', 'POST /api/stocks'])
    for (const text of [...titles, storage]) for (const s of [SHARES, COST, RATE]) expect(text).not.toContain(s)

    // Assert: the API log holds none of them (poll until the last request reached the file)
    const logFile = join(__dirname, '.output/dev-server.log')
    await expect.poll(() => readFileSync(logFile, 'utf8').includes(lastRequestId), { timeout: 10_000 }).toBe(true)
    const log = readFileSync(logFile, 'utf8')
    for (const s of [SHARES, COST, RATE]) expect(log, s).not.toContain(s)
  })
})
