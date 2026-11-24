import { expect, test } from '@playwright/test'
import { apiAs, choose, codePoints, fillStockForm, h1, headerCount, lens, newUser, openSignedIn, saveStock, signedInUser, settled, th, toast, us } from './lib/sl.ts'

test.describe('stocks', () => {
  test('TC-E-101: Add stock is a dialog; Esc and Back return to Stocks, a typed URL falls back to Stocks', async ({ page }) => {
    // Arrange
    await signedInUser(page, '/stocks')

    // Act + Assert: opened from the page, Esc closes it and Back does not reopen it
    await page.getByRole('link', { name: 'Add stock' }).first().click()
    await expect(page.getByRole('dialog', { name: 'Add stock' })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(page).toHaveURL('/stocks')

    // Act + Assert: browser Back closes it
    await page.getByRole('link', { name: 'Add stock' }).first().click()
    await expect(page.getByRole('dialog', { name: 'Add stock' })).toBeVisible()
    await page.goBack()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(page).toHaveURL('/stocks')

    // Act + Assert: a typed URL has nothing to go back to
    await page.goto('/stocks/new')
    await expect(page.getByRole('dialog', { name: 'Add stock' })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page).toHaveURL('/stocks')
    await expect(page.getByRole('dialog')).toHaveCount(0)
  })

  test('TC-E-101: add a US stock with lenses into a list', async ({ page }) => {
    // Arrange
    const { api } = await signedInUser(page, '/stocks')
    await api.list('Core holdings')
    await page.reload()
    await settled(page)

    // Act
    await page.getByRole('link', { name: 'Add stock' }).first().click()
    await expect(page).toHaveURL('/stocks/new')
    await expect(page.getByRole('dialog', { name: 'Add stock' })).toBeVisible()
    await fillStockForm(page, {
      market: 'US',
      ticker: 'nvda',
      exchange: 'NASDAQ',
      name: 'NVIDIA Corporation',
      indexes: ['S&P 500', 'Nasdaq-100'],
      selects: { gicsSector: 'Information Technology', style: 'Growth', size: 'Mega' },
      themes: ['AI', 'Data center'],
      lists: ['Core holdings'],
    })
    await expect(page.locator('#stock-ticker')).toHaveValue('NVDA')
    await saveStock(page).click()

    // Assert: toast, detail page, table, reload
    await expect(toast(page, 'NVDA added')).toBeVisible()
    await expect(page).toHaveURL(/\/stocks\/[0-9a-f-]{36}$/)
    await expect(page.getByText('US · NASDAQ · USD · S&P 500, Nasdaq-100')).toBeVisible()
    await expect(lens(page, 'Economic cycle')).toContainText('Sensitive')
    await expect(lens(page, 'Economic cycle').getByText('Default')).toBeVisible()
    await expect(lens(page, 'Style')).toHaveText('Growth')
    await expect(lens(page, 'Size')).toHaveText('Mega')
    await expect(lens(page, 'Themes')).toContainText('AI')
    await expect(page.getByRole('link', { name: 'Core holdings' })).toBeVisible()
    await page.reload()
    await expect(lens(page, 'Style')).toHaveText('Growth')
    await expect(page.getByRole('link', { name: 'Core holdings' })).toBeVisible()
    await page.goto('/stocks')
    const row = page.getByRole('row', { name: /NVDA/ })
    await expect(row).toContainText('Core holdings')
  })

  test('TC-E-102: add a TH stock with Thai text', async ({ page }) => {
    // Arrange
    const { api } = await signedInUser(page, '/stocks/new')
    const name = 'บมจ. ปตท. สำรวจและผลิตปิโตรเลียม'

    // Act
    await page.getByRole('radio', { name: 'TH', exact: true }).click()
    await expect(page.getByText('THB', { exact: true })).toBeVisible()
    await page.locator('#stock-exchange').click()
    const offered = await page.getByRole('option').allTextContents()
    await page.keyboard.press('Escape')
    await fillStockForm(page, {
      market: 'TH',
      ticker: 'pttep',
      exchange: 'SET',
      name,
      indexes: ['SET50'],
      selects: { setIndustryGroup: 'Resources', gicsSector: 'Energy' },
      themes: ['พลังงาน'],
    })
    await saveStock(page).click()

    // Assert
    expect(offered).toEqual(['SET', 'mai'])
    await expect(page).toHaveURL(/\/stocks\/[0-9a-f-]{36}$/)
    await expect(page.getByText('TH · SET · THB')).toBeVisible()
    await expect(h1(page)).toContainText(name)
    await page.goto('/stocks')
    const row = page.getByRole('row', { name: /PTTEP/ })
    await expect(row).toContainText(name)
    await expect(row.getByRole('cell').filter({ hasText: 'Energy' })).toContainText('Resources')
    const saved = (await api.stocks())[0]!
    expect(codePoints(saved.name)).toEqual(codePoints(name))
    expect(saved.themes).toEqual(['พลังงาน'])
  })

  test('TC-E-103: a duplicate is refused with a link; the same ticker in another market is a different stock', async ({ page }) => {
    // Arrange
    const { api } = await signedInUser(page, '/stocks/new')
    const aapl = await api.stock(us('AAPL', { name: 'Apple Inc' }))

    // Act 1: the same stock again
    await fillStockForm(page, { market: 'US', ticker: 'aapl', exchange: 'NASDAQ', name: 'Apple again' })
    await saveStock(page).click()

    // Assert 1
    const alert = page.getByRole('alert')
    await expect(alert).toContainText('AAPL (US) is already saved.')
    await expect(alert).toBeFocused()
    await expect(alert.getByRole('link', { name: 'Open AAPL' })).toHaveAttribute('href', `/stocks/${aapl.id}`)
    expect((await api.stocks()).length).toBe(1)

    // Act 2: AAPL in TH, then TRUE in both markets
    for (const [market, ticker, exchange] of [['TH', 'AAPL', 'SET'], ['US', 'TRUE', 'NYSE'], ['TH', 'TRUE', 'SET']] as const) {
      await page.goto('/stocks/new')
      await fillStockForm(page, { market, ticker, exchange, name: `${ticker} ${market}` })
      await saveStock(page).click()
      await expect(page).toHaveURL(/\/stocks\/[0-9a-f-]{36}$/)
    }

    // Assert 2
    await page.goto('/stocks')
    await expect(page.getByRole('row', { name: /TRUE/ })).toHaveCount(2)
    expect((await api.stocks()).map((s) => `${s.market}/${s.ticker}`).sort()).toEqual(['TH/AAPL', 'TH/TRUE', 'US/AAPL', 'US/TRUE'])
  })

  test('TC-E-104: edit a stock; a default cycle follows the sector, a manual one survives', async ({ page }) => {
    // Arrange
    const { api } = await signedInUser(page, '/stocks')
    const nvda = await api.stock(us('NVDA', { gicsSector: 'Information Technology', style: 'Growth', moat: 'Intangibles' }))
    await page.goto(`/stocks/${nvda.id}/edit`)
    const lensSources = async () => (await api.stocks())[0]!.lensSources

    // Assert: market and ticker are text, no Lists card
    await expect(page.getByRole('radio')).toHaveCount(0)
    await expect(page.locator('#stock-ticker')).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Lists' })).toHaveCount(0)

    // Act 1: sector to Utilities
    await choose(page, 'gicsSector', 'Utilities')
    await page.getByRole('button', { name: 'Save changes' }).click()
    await expect(toast(page, 'NVDA updated')).toBeVisible()
    await expect(lens(page, 'Economic cycle')).toContainText('Defensive')
    await expect(lens(page, 'Economic cycle').getByText('Default')).toBeVisible()
    expect(await lensSources()).toMatchObject({ economicCycle: 'default' })

    // Act 2: cycle Cyclical
    await page.getByRole('link', { name: 'Edit' }).click()
    await choose(page, 'economicCycle', 'Cyclical')
    await page.getByRole('button', { name: 'Save changes' }).click()
    await expect(lens(page, 'Economic cycle')).toHaveText('Cyclical')
    expect(await lensSources()).toMatchObject({ economicCycle: 'manual' })

    // Act 3: sector to Energy, moat cleared
    await page.getByRole('link', { name: 'Edit' }).click()
    await choose(page, 'gicsSector', 'Energy')
    await choose(page, 'moat', 'Not set')
    await page.getByRole('button', { name: 'Save changes' }).click()

    // Assert
    await expect(lens(page, 'Economic cycle')).toHaveText('Cyclical')
    await expect(lens(page, 'Moat')).toContainText('—')
    await expect(lens(page, 'Sector')).toHaveText('Energy')
    expect(await lensSources()).toMatchObject({ economicCycle: 'manual', gicsSector: 'manual' })
    expect((await api.stocks())[0]!.moat).toBeNull()
  })

  test('TC-E-105: delete a stock after a confirmation that names its lists', async ({ page }) => {
    // Arrange
    const { api } = await signedInUser(page, '/stocks')
    const nvda = await api.stock(us('NVDA'))
    const [a, b] = [await api.list('Core holdings'), await api.list('Watching')]
    await api.addToList(a.id, nvda.id)
    await api.addToList(b.id, nvda.id)
    await page.goto(`/stocks/${nvda.id}`)
    const more = page.getByRole('button', { name: 'More actions' })
    const dialog = page.getByRole('alertdialog')

    // Act 1: Cancel
    await more.click()
    await page.getByRole('menuitem', { name: 'Delete' }).click()
    await expect(dialog).toContainText('It will be removed from 2 lists.')
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await expect(more).toBeFocused()

    // Act 2: Esc
    await more.click()
    await page.getByRole('menuitem', { name: 'Delete' }).click()
    await page.keyboard.press('Escape')
    await expect(more).toBeFocused()
    expect((await api.stocks()).length).toBe(1)

    // Act 3: confirm
    await more.click()
    await page.getByRole('menuitem', { name: 'Delete' }).click()
    await dialog.getByRole('button', { name: 'Delete' }).click()

    // Assert
    await expect(page).toHaveURL(/\/stocks$/)
    await expect(toast(page, 'NVDA deleted')).toBeVisible()
    expect(await api.stocks()).toHaveLength(0)
    expect((await api.lists()).map((l) => l.stockCount)).toEqual([0, 0])
    await page.goto(`/stocks/${nvda.id}`)
    await expect(h1(page)).toHaveText('Not found')
  })

  test('TC-E-107: the same stock in several lists from its page, with undo', async ({ page }) => {
    // Arrange
    const { api } = await signedInUser(page, '/stocks')
    const stock = await api.stock(us('NVDA'))
    await api.list('Core holdings')
    await api.list('Watching')
    await page.goto(`/stocks/${stock.id}`)
    const card = page.locator('[data-slot="card"]', { has: page.getByRole('heading', { name: 'Lists' }) })

    // Act: add to both lists
    for (const list of ['Core holdings', 'Watching']) {
      await card.getByRole('button', { name: 'Add to list' }).click()
      await page.getByRole('option', { name: list }).click()
      await expect(card.getByRole('link', { name: list })).toBeVisible()
    }
    await card.getByRole('button', { name: 'Add to list' }).click()

    // Assert: nothing left to offer, counts agree
    await expect(page.getByText('In every list')).toBeVisible()
    await page.keyboard.press('Escape')
    expect((await api.lists()).map((l) => l.stockCount)).toEqual([1, 1])

    // Act: remove one, then undo
    await card.getByRole('button', { name: 'Remove from Watching' }).click()
    await expect(toast(page, 'Removed from Watching')).toBeVisible()
    await expect(card.getByRole('link', { name: 'Watching' })).toHaveCount(0)
    await toast(page, 'Removed from Watching').getByRole('button', { name: 'Undo' }).click()

    // Assert
    await expect(card.getByRole('link', { name: 'Watching' })).toBeVisible()
    expect((await api.lists()).map((l) => l.stockCount)).toEqual([1, 1])
    await page.goto('/stocks')
    await expect(page.getByRole('row', { name: /NVDA/ })).toContainText('Watching')
  })

  test('TC-E-108: empty states, sorting and the list view', async ({ page, browser }) => {
    // Arrange: a new user sees the empty states
    const fresh = await signedInUser(page, '/stocks')
    await expect(page.getByRole('heading', { name: 'No stocks yet' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Add stock' })).toHaveAttribute('href', '/stocks/new')
    await expect(page.getByRole('link', { name: 'Import from file' })).toHaveAttribute('href', '/import-export/import')
    await page.goto('/lists')
    await expect(page.getByRole('heading', { name: 'No lists yet' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'New list' })).toBeVisible()
    void fresh

    // Arrange: eight stocks, three in a list
    const user = await newUser()
    const api = await apiAs(user)
    const seeded = [
      us('MSFT', { name: 'Microsoft', gicsSector: 'Information Technology' }),
      us('AAPL', { name: 'Apple', gicsSector: 'Information Technology' }),
      us('BRK.B', { name: 'Berkshire', exchange: 'NYSE' }),
      us('XOM', { name: 'Exxon', gicsSector: 'Energy', exchange: 'NYSE' }),
      th('PTTEP', { name: 'ปตท.สผ.', gicsSector: 'Energy', setIndustryGroup: 'Resources' }),
      th('ADVANC', { name: 'แอดวานซ์', gicsSector: 'Communication Services', setIndustryGroup: 'Technology' }),
      th('XYZMAI', { name: 'ตัวอย่าง', exchange: 'mai' }),
      us('NVDA', { name: 'NVIDIA' }),
    ]
    const saved = []
    for (const s of seeded) saved.push(await api.stock(s))
    const list = await api.list('Study')
    for (const t of ['AAPL', 'PTTEP', 'NVDA']) await api.addToList(list.id, saved.find((s) => s.ticker === t)!.id)
    await openSignedIn(page, user, '/stocks')
    const tickers = async () => (await page.locator('tbody tr').locator('td:first-child').allTextContents()).map((t) => t.trim())
    const sortBy = (column: string) => page.getByRole('button', { name: `Sort by ${column}` })
    const header = (column: string) => page.getByRole('columnheader', { name: new RegExp(column) })

    // Act + Assert: ticker asc is the default, click toggles
    await expect(header('Ticker')).toHaveAttribute('aria-sort', 'ascending')
    expect(await tickers()).toEqual(['AAPL', 'ADVANC', 'BRK.B', 'MSFT', 'NVDA', 'PTTEP', 'XOM', 'XYZMAI'])
    await sortBy('Ticker').click()
    await expect(header('Ticker')).toHaveAttribute('aria-sort', 'descending')
    expect((await tickers())[0]).toBe('XYZMAI')
    await sortBy('Market').click()
    await expect(header('Market')).toHaveAttribute('aria-sort', 'ascending')
    await sortBy('Name').click()
    await expect(header('Name')).toHaveAttribute('aria-sort', 'ascending')
    await sortBy('Sector').click()
    await expect(header('Sector')).toHaveAttribute('aria-sort', 'ascending')
    const ascending = await tickers()
    await sortBy('Sector').click()
    await expect(header('Sector')).toHaveAttribute('aria-sort', 'descending')
    const descending = await tickers()
    // Stocks without a sector sort last in both directions.
    for (const order of [ascending, descending]) expect(order.slice(-3).sort()).toEqual(['BRK.B', 'NVDA', 'XYZMAI'])

    // Act: the list view
    await page.goto('/lists')
    await page.getByRole('link', { name: 'Study' }).click()

    // Assert
    await expect(h1(page)).toHaveText('Study')
    await expect(headerCount(page, '3 stocks')).toBeVisible()
    await expect(page.locator('tbody tr')).toHaveCount(3)
    await expect(page.getByRole('columnheader', { name: 'Lists' })).toHaveCount(0)
    void browser
  })
})
