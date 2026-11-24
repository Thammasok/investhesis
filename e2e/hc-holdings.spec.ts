import { expect, test } from '@playwright/test'
import { HEADERS, csv } from '../apps/api/test/fixtures/imports/build.ts'
import { holdingCard, openAs, pointerUsed, seedHoldingsDataset, stockRow, trackPointer } from './lib/hc.ts'
import {
  chooseTarget,
  fillStockForm,
  h1,
  importButton,
  MOCK_API_ORIGIN,
  openSignedIn,
  pickFile,
  saveStock,
  settled,
  signedInUser,
  summaryLine,
  toast,
  us,
} from './lib/sl.ts'

const HELD = { shares: '120.5', averageCost: '412.33' }
const heldNvda = () => us('NVDA', { name: 'NVIDIA Corporation', gicsSector: 'Information Technology', holding: HELD })
const holdBox = (page: import('@playwright/test').Page) => page.getByRole('checkbox', { name: 'I hold this stock' })

test.describe('holdings in the stock UI', () => {
  test('TC-E-400: mark a US stock as held while adding it', async ({ page }) => {
    // Arrange
    const { api } = await signedInUser(page, '/stocks')
    await api.list('Core holdings')
    await page.goto('/stocks/new')
    await fillStockForm(page, { market: 'US', ticker: 'nvda', exchange: 'NASDAQ', name: 'NVIDIA Corporation', selects: { gicsSector: 'Information Technology' }, lists: ['Core holdings'] })

    // Act
    await holdBox(page).check()
    await page.locator('#stock-holdingShares').fill('120.5')
    await page.locator('#stock-holdingAverageCost').fill('412.33')
    await expect(page.getByRole('radio', { name: 'USD', exact: true })).toBeChecked()
    await saveStock(page).click()

    // Assert: toast, card, table, API, reload
    await expect(toast(page, 'NVDA added')).toBeVisible()
    await expect(page).toHaveURL(/\/stocks\/[0-9a-f-]{36}$/)
    const check = async () => {
      const card = holdingCard(page)
      await expect(card.getByText('Held', { exact: true })).toBeVisible()
      await expect(card.getByText('Shares')).toBeVisible()
      await expect(card.getByText('120.5', { exact: true })).toBeVisible()
      await expect(card.getByText('$412.33')).toBeVisible()
      await expect(card.getByText('$49,685.77')).toBeVisible()
    }
    await check()
    await page.reload()
    await check()
    await page.goto('/stocks')
    await expect(stockRow(page, 'NVDA')).toContainText('Held')
    await expect(stockRow(page, 'NVDA')).toContainText('120.5')
    const [saved] = await api.stocks()
    expect(saved?.holding).toEqual({ shares: '120.5000', averageCost: '412.3300', costCurrency: 'USD' })
  })

  test('TC-E-401: a TH stock held with unknown amounts; the currency follows the market and can be changed', async ({ page }) => {
    // Arrange
    const { api } = await signedInUser(page, '/stocks/new')

    // Act 1: PTTEP, ticked, both fields empty
    await fillStockForm(page, { market: 'TH', ticker: 'pttep', exchange: 'SET', name: 'บมจ. ปตท. สำรวจและผลิตปิโตรเลียม' })
    await holdBox(page).check()
    await expect(page.getByRole('radio', { name: 'THB', exact: true })).toBeChecked()
    await expect(page.locator('#stock-holdingAverageCost').locator('xpath=ancestor::*[@data-slot="input-group"][1]')).toContainText('฿')
    await saveStock(page).click()

    // Assert 1
    await expect(toast(page, 'PTTEP added')).toBeVisible()
    await expect(holdingCard(page).getByText('Amount not entered.')).toBeVisible()

    // Act 2: KBANK with the currency changed to USD by hand
    await page.goto('/stocks/new')
    await fillStockForm(page, { market: 'TH', ticker: 'kbank', exchange: 'SET', name: 'ธนาคารกสิกรไทย' })
    await holdBox(page).check()
    await page.locator('#stock-holdingShares').fill('100')
    await page.locator('#stock-holdingAverageCost').fill('150')
    await page.getByRole('radio', { name: 'USD', exact: true }).click()
    await saveStock(page).click()

    // Assert 2
    await expect(toast(page, 'KBANK added')).toBeVisible()
    await expect(holdingCard(page).getByText('$150.00')).toBeVisible()
    await expect(holdingCard(page).getByText('$15,000.00')).toBeVisible()
    const byTicker = Object.fromEntries((await api.stocks()).map((s) => [s.ticker, s.holding]))
    expect(byTicker['PTTEP']).toEqual({ shares: null, averageCost: null, costCurrency: 'THB' })
    expect(byTicker['KBANK']).toEqual({ shares: '100.0000', averageCost: '150.0000', costCurrency: 'USD' })
  })

  test('TC-E-402: unrelated edits leave the holding alone; the form edits and clears it', async ({ page }) => {
    // Arrange
    const { api, user } = await signedInUser(page, '')
    const nvda = await api.stock(heldNvda())
    await openSignedIn(page, user, `/stocks/${nvda.id}/edit`)

    // Act 1: name only
    await page.locator('#stock-name').fill('NVIDIA Corp')
    await page.getByRole('button', { name: 'Save changes' }).click()
    await expect(toast(page, 'NVDA updated')).toBeVisible()

    // Assert 1
    expect((await api.getStock(nvda.id)).holding).toEqual({ shares: '120.5000', averageCost: '412.3300', costCurrency: 'USD' })

    // Act 2: shares 130
    await page.goto(`/stocks/${nvda.id}/edit`)
    await page.locator('#stock-holdingShares').fill('130')
    await page.getByRole('button', { name: 'Save changes' }).click()
    await expect(toast(page, 'NVDA updated')).toBeVisible()

    // Assert 2
    await expect(holdingCard(page).getByText('130', { exact: true })).toBeVisible()
    await expect(holdingCard(page).getByText('$412.33')).toBeVisible()
    expect((await api.getStock(nvda.id)).holding).toMatchObject({ shares: '130.0000', averageCost: '412.3300' })

    // Act 3: untick Held
    await page.goto(`/stocks/${nvda.id}/edit`)
    await expect(holdBox(page)).toBeChecked()
    await holdBox(page).uncheck()
    await page.getByRole('button', { name: 'Save changes' }).click()
    await expect(toast(page, 'NVDA updated')).toBeVisible()

    // Assert 3
    await expect(holdingCard(page).getByText('Not held', { exact: true })).toBeVisible()
    expect((await api.getStock(nvda.id)).holding).toBeNull()
  })

  test('TC-E-403: stock page dialog, keyboard only: mark, edit, stop and Undo', async ({ page }) => {
    // Arrange
    await trackPointer(page)
    const { api, user } = await signedInUser(page, '')
    const aapl = await api.stock(us('AAPL', { name: 'Apple Inc' }))
    await openSignedIn(page, user, `/stocks/${aapl.id}`)
    await settled(page)
    const card = holdingCard(page)
    const dialog = page.getByRole('dialog', { name: /Holding · AAPL/ })

    // Act 1: Mark as held, Save with empty fields
    await card.getByRole('button', { name: 'Mark as held' }).focus()
    await page.keyboard.press('Enter')
    await expect(dialog).toBeVisible()
    await expect(dialog.getByLabel('Shares (optional)')).toBeFocused()
    await page.keyboard.press('Enter')

    // Assert 1
    await expect(toast(page, 'AAPL marked as held')).toBeVisible()
    await expect(dialog).toHaveCount(0)
    await expect(card.getByRole('button', { name: 'Edit' })).toBeFocused()
    expect((await api.getStock(aapl.id)).holding).toEqual({ shares: null, averageCost: null, costCurrency: 'USD' })

    // Act 2: Edit, shares 10 and cost 150
    await page.keyboard.press('Enter')
    await expect(dialog).toBeVisible()
    await page.keyboard.type('10')
    await page.keyboard.press('Tab')
    await page.keyboard.type('150')
    await page.keyboard.press('Enter')

    // Assert 2
    await expect(toast(page, 'Holding saved')).toBeVisible()
    await expect(card.getByText('$1,500.00')).toBeVisible()
    await expect(card.getByRole('button', { name: 'Edit' })).toBeFocused()

    // Act 3: Edit, Stop holding
    await page.keyboard.press('Enter')
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: 'Stop holding' }).focus()
    await page.keyboard.press('Enter')

    // Assert 3: toast with Undo, focus on Mark as held
    const stopped = toast(page, 'AAPL no longer held')
    await expect(stopped).toBeVisible()
    await expect(card.getByText('Not held', { exact: true })).toBeVisible()
    await expect(card.getByRole('button', { name: 'Mark as held' })).toBeFocused()

    // Act 4: Undo from the keyboard
    await stopped.getByRole('button', { name: 'Undo' }).focus()
    await page.keyboard.press('Enter')

    // Assert 4
    await expect(card.getByText('$1,500.00')).toBeVisible()
    expect((await api.getStock(aapl.id)).holding).toEqual({ shares: '10.0000', averageCost: '150.0000', costCurrency: 'USD' })
    await page.reload()
    await expect(holdingCard(page).getByText('$150.00')).toBeVisible()
    expect(await pointerUsed(page)).toBe(false)
  })

  test('TC-C-409: in a real browser the Undo of Stop holding is gone after 5 seconds and the holding stays cleared', async ({ page }) => {
    // Arrange
    const { api, user } = await signedInUser(page, '')
    const nvda = await api.stock(heldNvda())
    await openSignedIn(page, user, `/stocks/${nvda.id}`)
    await settled(page)
    await page.getByRole('button', { name: 'Edit' }).click()
    await page.getByRole('button', { name: 'Stop holding' }).click()
    const stopped = toast(page, 'NVDA no longer held')
    await expect(stopped.getByRole('button', { name: 'Undo' })).toBeVisible()
    const shown = Date.now()

    // Act
    await expect(stopped).toBeHidden({ timeout: 9000 })

    // Assert: the window was about five seconds, and nothing restored the holding
    expect(Date.now() - shown).toBeGreaterThanOrEqual(3500)
    expect((await api.getStock(nvda.id)).holding).toBeNull()
  })

  test('TC-E-404: Held column on the stocks and list pages, sort and reload', async ({ page }) => {
    // Arrange
    const { user, core, stocks } = await seedHoldingsDataset()
    await openAs(page, user, '/stocks')

    // Act: sort by Held
    await page.getByRole('button', { name: 'Sort by Held' }).click()
    // The sort is in the address, so the rows follow the router a moment later.
    await expect(page.getByRole('columnheader', { name: /Held/ })).toHaveAttribute('aria-sort', 'descending')

    // Assert: held with larger shares first, AAPL (held, no shares), then not held
    const tickers = async () => (await page.locator('tbody tr td:first-child').allTextContents()).map((t) => t.trim())
    expect((await tickers()).slice(0, 5)).toEqual(['PTTEP', 'KBANK', 'MSFT', 'NVDA', 'AAPL'])
    for (const [t, shares] of [['NVDA', '10'], ['MSFT', '20'], ['PTTEP', '1,000'], ['KBANK', '100']] as const) {
      await expect(stockRow(page, t)).toContainText('Held')
      await expect(stockRow(page, t)).toContainText(shares)
    }
    await expect(stockRow(page, 'AAPL')).toContainText('Held')
    for (const t of ['JNJ', 'SCB', 'ZZZ']) await expect(stockRow(page, t).getByText('Not held')).toHaveCount(1)
    expect(stocks.AAPL.id).toBeTruthy()

    // Act + Assert: the list page shows the same marker for its three members, and reload keeps the data
    await page.goto(`/lists/${core.id}`)
    await settled(page)
    await expect(page.locator('tbody tr')).toHaveCount(3)
    for (const t of ['NVDA', 'MSFT', 'PTTEP']) await expect(stockRow(page, t)).toContainText('Held')
    await page.reload()
    await expect(stockRow(page, 'NVDA')).toContainText('Held')
  })

  test('TC-E-405: deleting a stock removes its holding; re-adding does not resurrect it', async ({ page }) => {
    // Arrange
    const { user, api, stocks } = await seedHoldingsDataset()
    await openAs(page, user, `/stocks/${stocks.NVDA.id}`)

    // Act: delete NVDA from its page
    await page.getByRole('button', { name: 'More actions' }).click()
    await page.getByRole('menuitem', { name: 'Delete' }).click()
    await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click()
    await expect(toast(page, 'NVDA deleted')).toBeVisible()

    // Assert: gone from the held scope
    await page.goto('/concentration?scope=held')
    await expect(page.getByRole('combobox', { name: 'Scope' })).toHaveText(/Held stocks \(4\)/)

    // Act: add NVDA again, without a holding
    await page.goto('/stocks/new')
    await fillStockForm(page, { market: 'US', ticker: 'NVDA', exchange: 'NASDAQ', name: 'NVIDIA again' })
    await saveStock(page).click()
    await expect(toast(page, 'NVDA added')).toBeVisible()

    // Assert
    await expect(holdingCard(page).getByText('Not held', { exact: true })).toBeVisible()
    expect((await api.stocks()).find((s) => s.ticker === 'NVDA')?.holding).toBeNull()
  })

  test('TC-E-420: an import in update mode keeps the holding; new stocks are not held', async ({ page }) => {
    // Arrange
    const { api, user } = await signedInUser(page, '')
    const nvda = await api.stock(us('NVDA', { name: 'NVIDIA', style: 'Value', gicsSector: 'Information Technology', holding: { shares: '10', averageCost: '100' } }))
    await openSignedIn(page, user, '/import-export/import')
    await settled(page)
    const file = csv(HEADERS, [
      { ticker: 'NVDA', market: 'US', exchange: 'NASDAQ', name: 'NVIDIA', style: 'Growth' },
      { ticker: 'NEW1', market: 'US', exchange: 'NASDAQ', name: 'New One' },
      { ticker: 'NEW2', market: 'US', exchange: 'NASDAQ', name: 'New Two' },
    ].map((r) => HEADERS.map((h) => (r as Record<string, string>)[h] ?? '')))

    // Act
    await pickFile(page, 'update.csv', file, 'text/csv')
    await page.getByLabel('Update', { exact: true }).check()
    await chooseTarget(page, 'New list…')
    await page.getByLabel('New list name').fill('Imported')
    await importButton(page).click()

    // Assert: summary, API, pages
    await expect(summaryLine(page)).toContainText('2 created · 0 skipped · 1 updated · 0 failed')
    const byTicker = Object.fromEntries((await api.stocks()).map((s) => [s.ticker, s]))
    expect(byTicker['NVDA']).toMatchObject({ style: 'Growth', holding: { shares: '10.0000', averageCost: '100.0000', costCurrency: 'USD' } })
    expect([byTicker['NEW1']?.holding, byTicker['NEW2']?.holding]).toEqual([null, null])
    await page.goto(`/stocks/${nvda.id}`)
    await expect(holdingCard(page).getByText('$100.00')).toBeVisible()
    await page.goto('/concentration')
    await expect(page.getByRole('combobox', { name: 'Scope' })).toHaveText(/All stocks \(3\)/)
    await page.getByRole('radio', { name: 'Count' }).check()
    await page.getByRole('combobox', { name: 'Scope' }).click()
    await expect(page.getByRole('option', { name: /Held stocks \(1\)/ })).toBeVisible()
  })
})

test.describe('resilience and the mock-mode pair', () => {
  test('TC-E-421: a failed save keeps the dialog and its values, the retry saves once, and a 500 changes nothing', async ({ page }) => {
    // Arrange
    const { api, user } = await signedInUser(page, '')
    const aapl = await api.stock(us('AAPL', { name: 'Apple Inc' }))
    await openSignedIn(page, user, `/stocks/${aapl.id}`)
    await settled(page)
    await page.getByRole('button', { name: 'Mark as held' }).click()
    const dialog = page.getByRole('dialog', { name: /Holding · AAPL/ })
    await dialog.getByLabel('Shares (optional)').fill('7')
    await dialog.getByLabel('Average cost per share (optional)').fill('9')

    // Act 1: the write cannot reach the server. Only the write is aborted (not the whole network): with the
    // network down the router's revalidation fails as well and the route error page replaces the dialog (finding F-4).
    let down = true
    await page.route(`**/api/stocks/${aapl.id}`, async (route) => {
      if (down && route.request().method() === 'PATCH') await route.abort('connectionfailed')
      else await route.fallback()
    })
    await dialog.getByRole('button', { name: 'Save' }).click()

    // Assert 1: still open, values kept, an alert, nothing saved
    await expect(dialog.getByRole('alert')).toBeVisible()
    await expect(dialog.getByLabel('Shares (optional)')).toHaveValue('7')
    await expect(dialog.getByLabel('Average cost per share (optional)')).toHaveValue('9')
    expect((await api.getStock(aapl.id)).holding).toBeNull()

    // Act 2: back up
    down = false
    await dialog.getByRole('button', { name: 'Save' }).click()

    // Assert 2: one holding
    await expect(toast(page, 'AAPL marked as held')).toBeVisible()
    expect((await api.getStock(aapl.id)).holding).toEqual({ shares: '7.0000', averageCost: '9.0000', costCurrency: 'USD' })

    // Act 3: a 500 from the server on an edit
    await page.unroute(`**/api/stocks/${aapl.id}`)
    await page.route(`**/api/stocks/${aapl.id}`, async (route) => {
      if (route.request().method() === 'PATCH') await route.fulfill({ status: 500, contentType: 'application/problem+json', body: JSON.stringify({ code: 'internal', title: 'Internal Server Error', status: 500 }) })
      else await route.fallback()
    })
    await page.getByRole('button', { name: 'Edit' }).click()
    await dialog.getByLabel('Shares (optional)').fill('99')
    await dialog.getByRole('button', { name: 'Save' }).click()

    // Assert 3
    await expect(dialog.getByRole('alert')).toBeVisible()
    await page.unroute(`**/api/stocks/${aapl.id}`)
    expect((await api.getStock(aapl.id)).holding).toMatchObject({ shares: '7.0000' })
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await expect(holdingCard(page).getByText('7', { exact: true })).toBeVisible()
  })

  test('TC-E-421: a failed settings save keeps the dialog; a failing settings read is the route error page', async ({ page }) => {
    // Arrange
    const { user, api } = await seedHoldingsDataset()
    await openAs(page, user, '/concentration')
    await page.getByRole('button', { name: 'Settings' }).click()
    const dialog = page.getByRole('dialog', { name: 'Concentration settings' })
    await dialog.getByLabel('Exchange rate, THB per 1 USD').fill('36.25')

    // Act 1: the write fails, then works
    let down = true
    await page.route('**/api/settings', async (route) => {
      if (down && route.request().method() === 'PATCH') await route.abort('connectionfailed')
      else await route.fallback()
    })
    await dialog.getByRole('button', { name: 'Save' }).click()
    await expect(dialog.getByRole('alert')).toBeVisible()
    await expect(dialog.getByLabel('Exchange rate, THB per 1 USD')).toHaveValue('36.25')
    down = false
    await dialog.getByRole('button', { name: 'Save' }).click()

    // Assert 1
    await expect(toast(page, 'Settings saved')).toBeVisible()
    expect((await api.settings()).usdThbRate).toBe('36.250000')

    // Act 2: the settings read fails
    await page.unroute('**/api/settings')
    await page.route('**/api/settings', (route) => route.abort('connectionfailed'))
    await page.goto('/concentration')

    // Assert 2: the error page with a way back, and no figures
    await expect(h1(page)).toHaveText('Something went wrong')
    await expect(page.getByRole('link', { name: 'Go to stocks' })).toBeVisible()
    await expect(page.getByRole('table')).toHaveCount(0)
  })

  test('TC-E-422: mock-mode smoke: /concentration loads without sign-in, a rate and a holding save and read back', async ({ page }) => {
    // Arrange
    const mockWeb = `http://localhost:${process.env.E2E_MOCK_WEB_PORT ?? '5273'}`
    let loads = 0
    page.on('load', () => loads++)

    // Act 1: the page
    await page.goto(`${mockWeb}/concentration`)
    await settled(page)

    // Assert 1: no sign-in redirect
    expect(new URL(page.url()).pathname).toBe('/concentration')
    await expect(h1(page)).toHaveText('Concentration')

    // Act 2: a held stock, then a rate
    const ticker = `MK${Date.now().toString(36).toUpperCase().slice(-6)}`
    await page.goto(`${mockWeb}/stocks/new`)
    await fillStockForm(page, { market: 'US', ticker, exchange: 'NASDAQ', name: 'Mock held' })
    await holdBox(page).check()
    await page.locator('#stock-holdingShares').fill('2')
    await page.locator('#stock-holdingAverageCost').fill('3')
    await saveStock(page).click()
    await expect(toast(page, `${ticker} added`)).toBeVisible()
    await page.goto(`${mockWeb}/concentration`)
    await settled(page)
    const loadsBefore = loads
    await page.getByRole('button', { name: 'Settings' }).click()
    // The mock user is one fixed user across runs, so the rate is new every time (an unchanged one saves nothing).
    const rate = `36.${String(Date.now() % 100000).padStart(5, '0')}`
    await page.getByLabel('Exchange rate, THB per 1 USD').fill(rate)
    await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click()
    await expect(toast(page, 'Settings saved')).toBeVisible()

    // Assert 2: read back from the mock API
    const settings = await fetch(`${MOCK_API_ORIGIN}/settings`).then((r) => r.json() as Promise<{ usdThbRate: string }>)
    expect(settings.usdThbRate).toBe(`${rate}0`)
    const stocks = await fetch(`${MOCK_API_ORIGIN}/stocks`).then((r) => r.json() as Promise<{ items: { ticker: string; holding: unknown }[] }>)
    expect(stocks.items.find((s) => s.ticker === ticker)?.holding).toEqual({ shares: '2.0000', averageCost: '3.0000', costCurrency: 'USD' })
    // global-setup visited the route, so Vite did not re-optimise and reload the page under the test.
    expect(loads).toBe(loadsBefore)
  })
})
