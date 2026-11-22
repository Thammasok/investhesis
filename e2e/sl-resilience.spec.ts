import { expect, test } from '@playwright/test'
import { F, csv } from '../apps/api/test/fixtures/imports/build.ts'
import {
  apiAs,
  chooseTarget,
  fillSignIn,
  fillStockForm,
  h1,
  importButton,
  MOCK_API_ORIGIN,
  newUser,
  openSignedIn,
  PASSWORD,
  pickFile,
  previewCounts,
  psql,
  saveStock,
  settled,
  signedInUser,
  summaryLine,
  us,
} from './lib/sl.ts'

const MOCK_WEB = `http://localhost:${process.env.E2E_MOCK_WEB_PORT ?? '5273'}`

test.describe('isolation, session and resilience', () => {
  test('TC-E-116: two users, same app, nothing shared', async ({ page, browser }) => {
    // Arrange: A has NVDA in Core holdings
    const { api: a } = await signedInUser(page, '/stocks')
    const nvda = await a.stock(us('NVDA', { name: 'NVIDIA Corporation' }))
    const core = await a.list('Core holdings')
    await a.addToList(core.id, nvda.id)
    const ctxB = await browser.newContext()
    const pageB = await ctxB.newPage()
    const userB = await newUser()
    const b = await apiAs(userB)
    const bodies: string[] = []
    pageB.on('response', async (r) => {
      if (r.url().includes('/api/')) bodies.push(await r.text().catch(() => ''))
    })
    await openSignedIn(pageB, userB, '/stocks')

    // Act + Assert: B sees empty states
    await expect(pageB.getByRole('heading', { name: 'No stocks yet' })).toBeVisible()
    await pageB.goto('/lists')
    await expect(pageB.getByRole('heading', { name: 'No lists yet' })).toBeVisible()

    // Act + Assert: B opens A's URLs
    for (const path of [`/stocks/${nvda.id}`, `/stocks/${nvda.id}/edit`, `/lists/${core.id}`]) {
      await pageB.goto(path)
      await expect(h1(pageB)).toHaveText('Not found')
      await expect(pageB.locator('body')).not.toContainText('NVIDIA')
      await expect(pageB.locator('body')).not.toContainText('NVDA')
    }
    expect(bodies.filter((t) => t.includes('NVDA') || t.includes('NVIDIA'))).toEqual([])

    // Act: B creates the same ticker and list name, then imports NVDA
    await pageB.goto('/stocks/new')
    await fillStockForm(pageB, { market: 'US', ticker: 'NVDA', exchange: 'NASDAQ', name: 'NVIDIA Corporation' })
    await saveStock(pageB).click()
    await expect(pageB).toHaveURL(/\/stocks\/[0-9a-f-]{36}$/)
    await pageB.goto('/lists')
    await pageB.getByRole('button', { name: 'New list' }).click()
    await pageB.getByRole('dialog').getByLabel('Name').fill('Core holdings')
    await pageB.getByRole('dialog').getByRole('button', { name: 'Create' }).click()
    await expect(pageB.getByRole('link', { name: 'Core holdings' })).toBeVisible()
    await expect(pageB.getByRole('dialog')).toHaveCount(0)
    await b.stock(us('MSFT'))
    await pageB.goto('/import-export')
    await pickFile(pageB, 'x.csv', csv(['ticker', 'market', 'exchange', 'name'], [['AMZN', 'US', 'NASDAQ', 'Amazon']]), 'text/csv')
    expect(await previewCounts(pageB)).toEqual(['1 new', '0 duplicate', '0 error'])

    // Assert: A's data is exactly as before
    await page.reload()
    await settled(page)
    expect((await a.stocks()).map((s) => [s.ticker, s.listIds])).toEqual([['NVDA', [core.id]]])
    expect((await a.lists()).map((l) => [l.name, l.stockCount])).toEqual([['Core holdings', 1]])
    await ctxB.close()
  })

  test('TC-E-117: signed-out deep links return after sign-in', async ({ browser }) => {
    const user = await newUser()
    for (const path of ['/stocks/new', '/lists/x', '/import-export']) {
      // Arrange: a signed-out visitor
      const context = await browser.newContext()
      const page = await context.newPage()

      // Act
      await page.goto(path)
      await expect(page).toHaveURL(`/auth/sign-in?next=${encodeURIComponent(path)}`)
      await fillSignIn(page, user.email, PASSWORD)
      await page.getByRole('button', { name: 'Sign in' }).click()

      // Assert
      await expect(page).toHaveURL(path)
      await context.close()
    }
  })

  test('TC-E-129: mock-mode smoke (add a stock, create a list, add the stock to it, import once)', async ({ page }) => {
    // Arrange: unique names, since the mock user's rows persist between runs
    const run = Date.now().toString(36).toUpperCase().slice(-6)
    const ticker = `SM${run}`
    const listName = `Smoke ${run}`
    const tokens: (string | undefined)[] = []
    page.on('request', (r) => {
      if (r.url().includes('/api/')) tokens.push(r.headers()['authorization'])
    })
    const mockApi = async (path: string, init?: RequestInit) => (await fetch(`${MOCK_API_ORIGIN}${path}`, init)).json()
    try {
      // Act: add a stock
      await page.goto(`${MOCK_WEB}/stocks/new`)
      await fillStockForm(page, { market: 'US', ticker, exchange: 'NYSE', name: `Smoke ${run}` })
      await saveStock(page).click()
      await expect(page).toHaveURL(/\/stocks\/[0-9a-f-]{36}$/)
      const stockUrl = page.url()

      // Act: create a list and add the stock to it
      await page.goto(`${MOCK_WEB}/lists`)
      await page.getByRole('button', { name: 'New list' }).click()
      await page.getByRole('dialog').getByLabel('Name').fill(listName)
      await page.getByRole('dialog').getByRole('button', { name: 'Create' }).click()
      await expect(page.getByRole('link', { name: listName })).toBeVisible()
      await page.goto(stockUrl)
      await page.getByRole('button', { name: 'Add to list' }).click()
      await page.getByRole('option', { name: listName }).click()
      await expect(page.getByRole('link', { name: listName })).toBeVisible()

      // Act: import a file once
      await page.goto(`${MOCK_WEB}/import-export`)
      const rows = [1, 2, 3].map((n) => [`IM${run}${n}`, 'US', 'NYSE', `Import ${n}`])
      await pickFile(page, 'f.csv', csv(['ticker', 'market', 'exchange', 'name'], rows), 'text/csv')
      await chooseTarget(page, listName)
      await importButton(page).click()

      // Assert: it worked without a token, and the rows belong to the mock user
      await expect(summaryLine(page)).toContainText('3 created')
      expect(tokens.filter(Boolean)).toEqual([])
      const me = (await mockApi('/me')) as { id: string }
      const owners = psql(`select distinct user_id from app.stocks where ticker like '%${run}%';`).out
      expect(owners).toBe(me.id)
    } finally {
      psql(`delete from app.lists where name = '${listName}' and user_id = '0192f0a0-0000-7000-8000-000000000001'; delete from app.stocks where ticker like '%${run}%' and user_id = '0192f0a0-0000-7000-8000-000000000001';`)
    }
  })

  test('TC-E-131: reload, Back and double submit', async ({ page }) => {
    // Arrange
    const { api } = await signedInUser(page, '/stocks')
    const stock = await api.stock(us('NVDA'))
    const list = await api.list('Core holdings')
    await api.addToList(list.id, stock.id)

    // Act + Assert: reload keeps the edit page and the list page
    await page.goto(`/stocks/${stock.id}/edit`)
    await page.reload()
    await expect(page.locator('#stock-name')).toHaveValue('NVDA Inc.')
    await page.goto(`/lists/${list.id}`)
    await page.reload()
    await expect(page.getByRole('row', { name: /NVDA/ })).toBeVisible()

    // Act: add a stock with a double click, then Back
    const posts: string[] = []
    page.on('request', (r) => {
      if (r.method() === 'POST' && r.url().endsWith('/api/stocks')) posts.push(r.url())
    })
    await page.goto('/stocks/new')
    await fillStockForm(page, { market: 'US', ticker: 'DBL', exchange: 'NYSE', name: 'Double' })
    await saveStock(page).dblclick()
    await expect(page).toHaveURL(/\/stocks\/[0-9a-f-]{36}$/)
    await settled(page)
    await page.goBack()

    // Assert: one stock, one request, and Back did not save again
    await settled(page)
    expect(posts).toHaveLength(1)
    expect((await api.stocks()).filter((s) => s.ticker === 'DBL')).toHaveLength(1)
    expect(await page.locator('#stock-ticker').inputValue().catch(() => '')).toBe('')

    // Act: double-click Import
    await page.goto('/import-export')
    await pickFile(page, 'f.csv', F.noBom(), 'text/csv')
    await chooseTarget(page, 'Core holdings')
    const confirms: string[] = []
    page.on('request', (r) => {
      if (r.method() === 'POST' && r.url().endsWith('/api/imports')) confirms.push(r.url())
    })
    await importButton(page).dblclick()

    // Assert: once
    await expect(summaryLine(page)).toContainText('2 created · 1 skipped · 0 updated · 0 failed')
    expect(confirms).toHaveLength(1)
  })

  test('TC-E-132: the same ticker from two tabs', async ({ page, context }) => {
    // Arrange: two form pages of one user
    const { api } = await signedInUser(page, '/stocks/new')
    const second = await context.newPage()
    await second.goto('/stocks/new')
    await settled(second)
    const spec = { market: 'US', ticker: 'NVDA', exchange: 'NASDAQ', name: 'NVIDIA' } as const
    await fillStockForm(page, spec)
    await fillStockForm(second, spec)

    // Act: submit the first, then the second
    await saveStock(page).click()
    await expect(page).toHaveURL(/\/stocks\/[0-9a-f-]{36}$/)
    await saveStock(second).click()

    // Assert: the duplicate alert links to the first one's stock; one row
    const first = (await api.stocks())[0]!
    await expect(second.getByRole('alert')).toContainText('NVDA (US) is already saved.')
    await expect(second.getByRole('link', { name: 'Open NVDA' })).toHaveAttribute('href', `/stocks/${first.id}`)
    expect(await api.stocks()).toHaveLength(1)
  })

  test('TC-E-133: network failure on save and on confirm leaves nothing partial', async ({ page }) => {
    // Arrange
    const { api } = await signedInUser(page, '/stocks/new')
    let abortStock = true
    await page.route('**/api/stocks', async (route) => {
      if (route.request().method() === 'POST' && abortStock) {
        abortStock = false
        await route.abort('connectionfailed')
      } else await route.fallback()
    })
    await fillStockForm(page, { market: 'US', ticker: 'NET', exchange: 'NYSE', name: 'Network' })

    // Act 1: the save fails
    await saveStock(page).click()

    // Assert 1: a readable alert, the values are kept, nothing saved
    await expect(page.getByRole('alert')).toContainText("Couldn't reach the server. Check your connection and try again.")
    await expect(page.locator('#stock-ticker')).toHaveValue('NET')
    await expect(page.locator('#stock-name')).toHaveValue('Network')
    expect(await api.stocks()).toHaveLength(0)

    // Act 2: retry
    await saveStock(page).click()

    // Assert 2: exactly one stock
    await expect(page).toHaveURL(/\/stocks\/[0-9a-f-]{36}$/)
    expect(await api.stocks()).toHaveLength(1)

    // Arrange: an import that fails once by abort, once by 500
    await api.list('Target')
    await page.goto('/import-export')
    await pickFile(page, 'f.csv', F.noBom(), 'text/csv')
    await chooseTarget(page, 'Target')
    const failures: ('abort' | '500' | undefined)[] = ['abort', '500']
    await page.route('**/api/imports', async (route) => {
      const failure = failures.shift()
      if (failure === 'abort') await route.abort('connectionfailed')
      else if (failure === '500') await route.fulfill({ status: 500, contentType: 'application/problem+json', body: JSON.stringify({ status: 500, code: 'internal_error', title: 'x' }) })
      else await route.fallback()
    })

    // Act 3 + Assert 3: aborted
    await importButton(page).click()
    await expect(page.getByRole('alert')).toHaveText('Could not reach the server. Check your connection and try again.')
    await expect(page.getByRole('heading', { name: 'Review' })).toBeVisible()
    await expect(page.locator('#import-target')).toContainText('Target')
    expect((await api.stocks()).map((s) => s.ticker)).toEqual(['NET'])
    expect((await api.lists())[0]!.stockCount).toBe(0)

    // Act 4 + Assert 4: answered 500
    await importButton(page).click()
    await expect(page.getByRole('alert')).toHaveText('Something went wrong. Try again.')
    expect(await api.stocks()).toHaveLength(1)

    // Act 5: retry
    await importButton(page).click()

    // Assert 5: completed once
    await expect(summaryLine(page)).toContainText('3 created · 0 skipped · 0 updated · 0 failed')
    expect(await api.stocks()).toHaveLength(4)
    expect((await api.lists())[0]!.stockCount).toBe(3)
  })

  test('TC-E-134: navigation, breadcrumb and titles across pages', async ({ page }) => {
    // Arrange
    const { api } = await signedInUser(page, '/stocks')
    const stock = await api.stock(us('NVDA'))
    const list = await api.list('Core holdings')
    const errors: string[] = []
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text())
    })
    page.on('pageerror', (e) => errors.push(e.message))
    const main = page.getByRole('navigation', { name: 'Main' })
    const crumbs = page.getByRole('navigation', { name: 'breadcrumb' })
    const visit = async (nav: () => Promise<unknown>, title: string, active: string, trail: string[], focusH1 = true) => {
      await nav()
      await expect(page).toHaveTitle(`${title} · Investhesis`)
      if (focusH1) await expect(h1(page)).toBeFocused()
      await expect(main.getByRole('link', { name: active })).toHaveAttribute('data-active', 'true')
      for (const label of trail) await expect(crumbs).toContainText(label)
    }

    // Act + Assert: the sidebar items
    await visit(() => main.getByRole('link', { name: 'Lists' }).click(), 'Lists', 'Lists', ['Lists'])
    await visit(() => main.getByRole('link', { name: 'Import / export' }).click(), 'Import / export', 'Import / export', ['Import / export'], false)
    await visit(() => main.getByRole('link', { name: 'Stocks' }).click(), 'Stocks', 'Stocks', ['Stocks'])

    // Act + Assert: new, detail, edit, list detail
    await visit(() => page.getByRole('link', { name: 'Add stock' }).first().click(), 'Add stock', 'Stocks', ['Stocks', 'New stock'])
    await visit(() => page.goto(`/stocks/${stock.id}`), 'NVDA', 'Stocks', ['Stocks', 'NVDA'])
    await visit(() => page.getByRole('link', { name: 'Edit' }).click(), 'Edit NVDA', 'Stocks', ['Stocks', 'NVDA', 'Edit'])
    await visit(() => page.goto(`/lists/${list.id}`), 'Core holdings', 'Lists', ['Lists', 'Core holdings'])
    expect(errors).toEqual([])
  })

  // Finding F-1: the import wizard's focus effect runs twice under StrictMode (dev server), so on arrival
  // focus ends on the wizard's step heading instead of the page h1. Pinned as an expected failure; the
  // production build is not what this suite runs against.
  test.fail('TC-E-134 [F-1]: the h1 of /import-export holds focus on arrival', async ({ page }) => {
    await signedInUser(page, '/import-export')

    await expect(h1(page)).toBeFocused({ timeout: 3000 })
  })
})
