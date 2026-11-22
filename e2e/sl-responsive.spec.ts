import { expect, test, type Page } from '@playwright/test'
import { csv } from '../apps/api/test/fixtures/imports/build.ts'
import {
  arrow,
  h1,
  importButton,
  lens,
  newUser,
  noHorizontalScroll,
  openSignedIn,
  pickFile,
  saveStock,
  settled,
  signedInUser,
  summaryLine,
  us,
} from './lib/sl.ts'
import { enter, seedForScreens, STATES, type Ctx } from './lib/states.ts'

const PHONE = { width: 360, height: 640 }

test.describe('360 px layout', () => {
  test.use({ viewport: PHONE, hasTouch: true })

  test('TC-E-118: no page-level horizontal scroll on any screen or state at 360 px (and 320 px smoke)', async ({ page }) => {
    test.setTimeout(240_000)
    // Arrange: the shared screen states, plus 35 stocks for the table
    const ctx: Ctx = { ...(await seedForScreens()), empty: await newUser('e2e-sl-empty') }
    for (let from = 0; from < 32; from += 8) {
      await Promise.all(Array.from({ length: 8 }, (_, i) => ctx.api.stock(us(`P${String(from + i).padStart(3, '0')}`, { name: `Phone width company ${from + i} with a long name` }))))
    }
    const wide: string[] = []

    // Act + Assert: every state
    for (const state of STATES) {
      await enter(page, state, ctx)
      if (!(await noHorizontalScroll(page))) wide.push(state.name)
    }
    await openSignedIn(page, ctx.user, '/stocks')
    await settled(page)
    expect(await page.locator('tbody tr').count()).toBeGreaterThanOrEqual(35)
    if (!(await noHorizontalScroll(page))) wide.push('stocks-35')
    await page.goto(`/lists/${ctx.core.id}`)
    await page.getByRole('button', { name: 'More actions' }).click()
    await expect(page.getByRole('menuitem', { name: 'Delete' })).toBeVisible()
    if (!(await noHorizontalScroll(page))) wide.push('list-detail-menu-open')
    await page.keyboard.press('Escape')

    // Act + Assert: the 320 px smoke
    await page.setViewportSize({ width: 320, height: 568 })
    for (const path of ['/stocks', '/stocks/new', `/stocks/${ctx.nvda.id}`, '/lists', '/import-export']) {
      await page.goto(path)
      await settled(page)
      if (!(await noHorizontalScroll(page))) wide.push(`320:${path}`)
    }
    expect(wide).toEqual([])
  })

  test('TC-E-118: the specified phone layout rules hold (sticky ticker, stacked actions, one-column form, preview columns, menu)', async ({ page }) => {
    // Arrange
    const ctx: Ctx = { ...(await seedForScreens()), empty: await newUser('e2e-sl-empty') }

    // Stocks: the Ticker column is sticky; header actions sit under the title
    await openSignedIn(page, ctx.user, '/stocks')
    await settled(page)
    expect(await page.locator('thead th').first().evaluate((el) => getComputedStyle(el).position)).toBe('sticky')
    const title = await h1(page).boundingBox()
    const add = await page.getByRole('link', { name: 'Add stock' }).boundingBox()
    expect(add!.y).toBeGreaterThanOrEqual(title!.y + title!.height)
    expect(add!.width).toBeGreaterThan(250)

    // Form: one column, action bar full width with Save last in the DOM
    await page.goto('/stocks/new')
    const [ticker, exchange] = await Promise.all([page.locator('#stock-ticker').boundingBox(), page.locator('#stock-exchange').boundingBox()])
    expect(exchange!.y).toBeGreaterThan(ticker!.y)
    const save = saveStock(page)
    await save.scrollIntoViewIfNeeded()
    expect((await save.boundingBox())!.width).toBeGreaterThan(300)
    const order = await page.locator('form button[type="submit"], form a:has-text("Cancel")').evaluateAll((els) => els.map((e) => e.textContent?.trim()))
    expect(order).toEqual(['Cancel', 'Save stock'])

    // Import preview: Row, Ticker and Status columns only; the rest under the ticker
    await page.goto('/import-export')
    await pickFile(page, 'mixed.csv', csv(['ticker', 'market', 'exchange', 'name'], [['NEWA', 'US', 'NYSE', 'New A'], ['BAD', 'JP', 'XXX', '']]), 'text/csv')
    await expect(page.getByRole('heading', { name: 'Review' })).toBeVisible()
    const visibleHeaders = await page.locator('thead th').evaluateAll((els) => els.filter((e) => getComputedStyle(e).display !== 'none').map((e) => e.textContent?.trim()))
    expect(visibleHeaders).toEqual(['Row', 'Ticker', 'Status'])
    await expect(page.locator('tbody tr').first()).toContainText('US · New A')

    // List detail: Rename is inside the menu
    await page.goto(`/lists/${ctx.core.id}`)
    await expect(page.getByRole('button', { name: 'Rename' })).toBeHidden()
    await page.getByRole('button', { name: 'More actions' }).click()
    await expect(page.getByRole('menuitem', { name: 'Rename' })).toBeVisible()
    await page.keyboard.press('Escape')

    // Dialogs fit the viewport
    await page.goto('/lists')
    await page.getByRole('button', { name: 'New list' }).click()
    const box = await page.getByRole('dialog').boundingBox()
    expect(box!.x).toBeGreaterThanOrEqual(0)
    expect(box!.x + box!.width).toBeLessThanOrEqual(PHONE.width)
    expect(box!.y + box!.height).toBeLessThanOrEqual(PHONE.height)
  })

  test('TC-E-118: the 100-row preview with all three statuses has no page-level scroll and scrolls inside its table', async ({ page }) => {
    // Arrange: 20 duplicates, 20 error rows and 60 new rows
    const { api } = await signedInUser(page, '/import-export')
    for (let i = 0; i < 20; i++) await api.stock(us(`D${String(i).padStart(3, '0')}`))
    const rows = [
      ...Array.from({ length: 20 }, (_, i) => [`D${String(i).padStart(3, '0')}`, 'US', 'NASDAQ', `Dup ${i}`]),
      ...Array.from({ length: 20 }, (_, i) => [`E${i}`, 'JP', 'XXX', '']),
      ...Array.from({ length: 60 }, (_, i) => [`N${String(i).padStart(3, '0')}`, 'US', 'NASDAQ', `New ${i}`]),
    ]

    // Act
    await pickFile(page, 'hundred.csv', csv(['ticker', 'market', 'exchange', 'name'], rows), 'text/csv')
    await expect(page.getByRole('heading', { name: 'Review' })).toBeVisible()

    // Assert
    expect(await noHorizontalScroll(page)).toBe(true)
    const container = page.locator('div.overflow-auto', { has: page.locator('table') }).first()
    expect(await container.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true)
  })

  test('TC-E-119: the main tasks complete at 360 px with touch', async ({ page }) => {
    // Arrange
    const { api } = await signedInUser(page, '/stocks')
    const tap = (name: string, role: 'button' | 'link' | 'option' | 'radio' = 'button') => page.getByRole(role, { name, exact: true }).tap()

    // Act 1: add a stock with identity, three lenses and a list
    const list = await api.list('Phone list')
    await page.reload()
    await settled(page)
    await tap('Add stock', 'link')
    await expect(h1(page)).toHaveText('Add stock')
    await tap('US', 'radio')
    await page.locator('#stock-ticker').fill('PHN')
    await page.locator('#stock-exchange').tap()
    await tap('NASDAQ', 'option')
    await page.locator('#stock-name').fill('Phone Corp')
    await page.locator('#stock-style').tap()
    await tap('Growth', 'option')
    await page.locator('#stock-size').tap()
    await tap('Large', 'option')
    await page.locator('#stock-moat').tap()
    await tap('Brand', 'option')
    await page.getByRole('checkbox', { name: 'Phone list' }).tap()
    await saveStock(page).scrollIntoViewIfNeeded()
    await saveStock(page).tap()

    // Assert 1
    await expect(page).toHaveURL(/\/stocks\/[0-9a-f-]{36}$/)
    await expect(lens(page, 'Style')).toHaveText('Growth')
    expect(await noHorizontalScroll(page)).toBe(true)
    expect((await api.stocks())[0]!.listIds).toEqual([list.id])

    // Act 2: create a list, add the stock to it
    await page.goto('/lists')
    await tap('New list')
    await page.getByRole('dialog').getByLabel('Name').fill('Second')
    await page.getByRole('dialog').getByRole('button', { name: 'Create' }).tap()
    await expect(page.getByRole('link', { name: 'Second' })).toBeVisible()
    await page.goto(`/stocks/${(await api.stocks())[0]!.id}`)
    await tap('Add to list')
    await page.getByRole('option', { name: 'Second' }).tap()
    await expect(page.getByRole('link', { name: 'Second' })).toBeVisible()

    // Act 3: import a CSV into the list and read the summary
    await page.goto('/import-export')
    await pickFile(page, 'phone.csv', csv(['ticker', 'market', 'exchange', 'name', 'sector'], [['TAP1', 'US', 'NYSE', 'Tap 1', 'Energy'], ['BADROW', 'JP', 'NYSE', 'x', '']]), 'text/csv')
    await expect(page.getByRole('heading', { name: 'Review' })).toBeVisible()
    await page.locator('#import-target').tap()
    await tap('Second', 'option')
    await importButton(page).scrollIntoViewIfNeeded()
    await importButton(page).tap()

    // Assert 3
    await expect(summaryLine(page)).toContainText('1 created · 0 skipped · 0 updated · 1 failed')
    await expect(page.getByRole('button', { name: 'Download error rows (CSV)' })).toBeVisible()
    expect(await noHorizontalScroll(page)).toBe(true)
  })

  test('TC-E-119: with the on-screen keyboard open (360 x 360) the focused field and Save can be scrolled into view', async ({ page }) => {
    // Arrange
    await signedInUser(page, '/stocks/new')
    await page.setViewportSize({ width: 360, height: 360 })
    const inView = async (box: { y: number; height: number } | null) => !!box && box.y >= 0 && box.y + box.height <= 360.5

    // Act + Assert: the focused field
    await page.locator('#stock-name').focus()
    await page.locator('#stock-name').scrollIntoViewIfNeeded()
    expect(await inView(await page.locator('#stock-name').boundingBox())).toBe(true)

    // Act + Assert: Save
    await saveStock(page).scrollIntoViewIfNeeded()
    expect(await inView(await saveStock(page).boundingBox())).toBe(true)
    expect(await noHorizontalScroll(page)).toBe(true)
  })
})

test.describe('keyboard only', () => {
  const ring = (page: Page) =>
    page.evaluate(() => {
      const s = getComputedStyle(document.activeElement as HTMLElement)
      const outline = s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0
      return outline || (s.boxShadow !== 'none' && s.boxShadow !== '')
    })

  test('TC-E-120: add a stock with the keyboard only', async ({ page }) => {
    // Arrange
    const { api } = await signedInUser(page, '/stocks')
    await expect(h1(page)).toBeFocused()

    // Act 1: Tab to Add stock, Enter
    for (let i = 0; i < 6 && !(await page.getByRole('link', { name: 'Add stock' }).evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press('Tab')
    await expect(page.getByRole('link', { name: 'Add stock' })).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL('/stocks/new')
    await page.locator('input[type="radio"], button[role="radio"]').first().focus()

    // Assert 1: Market operated with the arrow keys, Enter in a text input submits and focus lands on the first invalid field
    await arrow(page, 'ArrowRight')
    await expect(page.getByRole('radio', { name: 'TH', exact: true })).toBeChecked()
    await arrow(page, 'ArrowLeft')
    await expect(page.getByRole('radio', { name: 'US', exact: true })).toBeChecked()
    await page.locator('#stock-ticker').focus()
    await expect.poll(() => ring(page)).toBe(true)
    await page.keyboard.press('Enter')
    await expect(page.locator('#stock-ticker')).toBeFocused()
    await expect(page.locator('#stock-ticker-error')).toBeVisible()
    await page.keyboard.type('KBD')
    await page.keyboard.press('Enter')
    await expect(page.locator('#stock-exchange')).toBeFocused()

    // Act 2: Tab order equals visual order (Identity, Classification, Lists, Cancel, Save)
    await page.locator('#stock-ticker').focus()
    const order: string[] = []
    for (let i = 0; i < 60; i++) {
      await page.keyboard.press('Tab')
      const label = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement
        return el.id || el.getAttribute('aria-label') || el.textContent?.trim() || el.tagName
      })
      order.push(label)
      if (label === 'Save stock') break
    }

    // Assert 2
    const fields = ['stock-exchange', 'stock-name', 'stock-gicsSector', 'stock-economicCycle', 'stock-size', 'stock-style', 'stock-volatility', 'stock-moat', 'stock-valueChain', 'stock-themes', 'Cancel', 'Save stock']
    const positions = fields.map((f) => order.indexOf(f))
    expect(positions.every((p) => p >= 0), JSON.stringify(order)).toBe(true)
    expect(positions).toEqual([...positions].sort((a, b) => a - b))

    // Act 3: operate the controls with the keyboard
    await page.locator('#stock-exchange').focus()
    await page.keyboard.press('Enter')
    await page.getByRole('option', { name: 'NYSE' }).focus()
    await page.keyboard.press('Enter')
    await expect(page.locator('#stock-exchange')).toHaveText('NYSE')
    await expect(page.locator('#stock-exchange')).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(page.locator('#stock-name')).toBeFocused()
    await page.keyboard.type('Keyboard Corp')
    await page.keyboard.press('Tab')
    await expect(page.getByRole('checkbox', { name: 'S&P 500' })).toBeFocused()
    await page.keyboard.press('Space')
    await expect(page.getByRole('checkbox', { name: 'S&P 500' })).toBeChecked()
    await page.locator('#stock-themes').focus()
    await page.keyboard.type('AI')
    await page.keyboard.press('Enter')
    await page.keyboard.type('Cloud,')
    await expect(page.getByRole('list', { name: 'Themes' }).getByText('Cloud')).toBeVisible()
    await page.getByRole('button', { name: 'Save stock' }).focus()
    await expect.poll(() => ring(page)).toBe(true)
    await page.keyboard.press('Enter')

    // Assert 3: saved, and the detail page h1 is focused
    await expect(page).toHaveURL(/\/stocks\/[0-9a-f-]{36}$/)
    await expect(h1(page)).toBeFocused()
    expect((await api.stocks())[0]).toMatchObject({ ticker: 'KBD', exchange: 'NYSE', name: 'Keyboard Corp', indexMembership: ['S&P 500'], themes: ['AI', 'Cloud'] })
  })
})
