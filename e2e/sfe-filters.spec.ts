import { expect, test } from '@playwright/test'
import { closeSheet, filtersButton, heldOf, openAs, openSheet, pick, resultLine, searchBox, section, seedFilterDataset, sheet, sorted, stocksOf, tableTickers, unpick } from './lib/sfe.ts'
import { h1 } from './lib/sl.ts'

const collator = new Intl.Collator('en', { sensitivity: 'base', numeric: true })
const byTicker = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

test.describe('search, filters and sort in the address', () => {
  test('TC-E-500: search and filter, open a stock, Back and reload keep the view', async ({ page }) => {
    // Arrange
    const seed = await seedFilterDataset()
    await openAs(page, seed.user)
    const historyBefore = await page.evaluate(() => history.length)

    // Act: type (one keystroke at a time), pick Market TH in the sheet
    await searchBox(page).pressSequentially('ptt')
    await openSheet(page)
    await pick(page, 'Market', /^TH, /)
    await closeSheet(page)

    // Assert: the view, the address, and no history entry per keystroke or pick
    await expect(page).toHaveURL(/\/stocks\?q=ptt&market=TH$/)
    await expect(resultLine(page)).toHaveText('3 of 12 stocks')
    await expect.poll(() => tableTickers(page)).toEqual(['PTT', 'PTTEP', 'PTTGC'])
    expect(await page.evaluate(() => history.length)).toBe(historyBefore)

    // Act 2: open a stock, then Back
    await page.getByRole('link', { name: 'PTTEP', exact: true }).click()
    await expect(page).toHaveURL(new RegExp(`/stocks/${seed.stocks['PTTEP']?.id}$`))
    await page.goBack()

    // Assert 2: the same view, then the same after a reload
    for (const step of ['after Back', 'after reload']) {
      await expect(page, step).toHaveURL(/\/stocks\?q=ptt&market=TH$/)
      await expect(searchBox(page), step).toHaveValue('ptt')
      await expect(resultLine(page), step).toHaveText('3 of 12 stocks')
      await expect.poll(() => tableTickers(page), { message: step }).toEqual(['PTT', 'PTTEP', 'PTTGC'])
      if (step === 'after Back') await page.reload()
    }
  })

  test('TC-E-501: the sort lives in the address too: reload and Back keep it, the default leaves it bare', async ({ page }) => {
    const seed = await seedFilterDataset()
    await openAs(page, seed.user)
    const rows = stocksOf(seed)
    const nameDesc = [...rows].sort((a, b) => collator.compare(b.name, a.name) || byTicker(a.ticker, b.ticker)).map((s) => s.ticker)

    await page.getByRole('button', { name: 'Sort by Name' }).click()
    await page.getByRole('button', { name: 'Sort by Name' }).click()
    await expect(page).toHaveURL(/\/stocks\?sort=name&dir=desc$/)
    await expect.poll(() => tableTickers(page)).toEqual(nameDesc)

    await page.reload()
    await expect.poll(() => tableTickers(page)).toEqual(nameDesc)
    await page.getByRole('link', { name: 'NVDA', exact: true }).click()
    await expect(page).toHaveURL(new RegExp(`/stocks/${seed.stocks['NVDA']?.id}$`))
    await page.goBack()
    await expect(page).toHaveURL(/\/stocks\?sort=name&dir=desc$/)
    await expect.poll(() => tableTickers(page)).toEqual(nameDesc)

    await page.getByRole('button', { name: 'Sort by Held' }).click()
    await expect(page).toHaveURL(/\/stocks\?sort=held&dir=desc$/)
    await expect.poll(async () => (await tableTickers(page)).slice(0, 3).sort()).toEqual(['KO', 'NVDA', 'PTT'])

    await page.getByRole('button', { name: 'Sort by Ticker' }).click() // the default sort: ticker ascending
    await expect(page).toHaveURL(/\/stocks$/)
  })

  test('TC-E-502: market, held and cycle (with Not set) narrow the table to what the data implies; counts agree', async ({ page }) => {
    const seed = await seedFilterDataset()
    await openAs(page, seed.user)
    const rows = stocksOf(seed)

    await openSheet(page)
    await pick(page, 'Market', /^TH, /)
    await pick(page, 'Held', /^Held, /)
    await pick(page, 'Economic cycle', /^Cyclical, /)
    await pick(page, 'Economic cycle', /^Not set, /)
    await closeSheet(page)

    const expected = rows
      .filter((s) => s.market === 'TH' && heldOf(s) && (s['economicCycle'] === 'Cyclical' || s['economicCycle'] === null))
      .map((s) => s.ticker)
    expect(expected.length).toBeGreaterThan(0)
    await expect.poll(() => tableTickers(page)).toEqual(sorted(expected).sort(byTicker))
    await expect(resultLine(page)).toHaveText(`${expected.length} of 12 stocks`)
    await expect(page.getByRole('button', { name: 'Filters 3 active' })).toBeVisible()
    await expect(page).toHaveURL(/market=TH&held=yes&economicCycle=Cyclical&economicCycle=$/)

    // The sheet's counts are over every stock, not over the result
    await openSheet(page)
    const cycle = await section(page, 'Economic cycle')
    for (const value of ['Cyclical', 'Sensitive', 'Defensive']) {
      const n = rows.filter((s) => s['economicCycle'] === value).length
      await expect(cycle.getByRole('checkbox', { name: `${value}, ${n} ${n === 1 ? 'stock' : 'stocks'}` })).toBeVisible()
    }
    // Free text merges case-insensitively: "AI" and "ai" are one option
    const themes = await section(page, 'Themes')
    const withAi = rows.filter((s) => (s['themes'] as string[]).some((t) => t.toLowerCase() === 'ai')).length
    await expect(themes.getByRole('checkbox', { name: new RegExp(`^ai, ${withAi} stocks$`, 'i') })).toHaveCount(1)
    await expect(themes.getByRole('checkbox', { name: /^(AI|ai), / })).toHaveCount(1)
  })

  test('TC-E-503: "None" and "Not set" are different filters on the value chain position', async ({ page }) => {
    const seed = await seedFilterDataset()
    await openAs(page, seed.user)
    const rows = stocksOf(seed)
    const none = rows.filter((s) => s['valueChainPosition'] === 'None').map((s) => s.ticker)
    const unset = rows.filter((s) => s['valueChainPosition'] === null).map((s) => s.ticker)
    expect(none.length).toBe(2)

    await openSheet(page)
    await pick(page, 'Value chain position', /^None, /)
    await expect(page).toHaveURL(/valueChainPosition=None$/)
    await expect.poll(() => tableTickers(page)).toEqual([...none].sort(byTicker))
    await expect(page.getByText('Value chain position: None')).toBeVisible()

    await unpick(page, 'Value chain position', /^None, /)
    await pick(page, 'Value chain position', /^Not set, /)
    await expect(page).toHaveURL(/valueChainPosition=$/)
    await expect.poll(() => tableTickers(page)).toEqual([...unset].sort(byTicker))
    await expect(page.getByText('Value chain position: Not set')).toBeVisible()
    await closeSheet(page)
  })

  test('TC-E-504: Thai text is searched as typed, kept in the address and restored on reload', async ({ page }) => {
    const seed = await seedFilterDataset()
    await openAs(page, seed.user)

    await searchBox(page).fill('ปตท.')
    await expect.poll(() => tableTickers(page)).toEqual(['PTTEP'])
    await expect.poll(() => decodeURIComponent(page.url())).toContain('?q=ปตท.')
    await page.reload()
    await expect(searchBox(page)).toHaveValue('ปตท.')
    await expect.poll(() => tableTickers(page)).toEqual(['PTTEP'])

    await searchBox(page).clear()
    await searchBox(page).pressSequentially('ปตท.')
    await expect.poll(() => tableTickers(page)).toEqual(['PTTEP'])
  })

  test('TC-E-505: a bad address is read as far as it can be, with one note per dropped part, and not rewritten', async ({ page }) => {
    const seed = await seedFilterDataset()
    await openAs(page, seed.user, '/stocks')
    const bad = '/stocks?market=Bitcoin&sort=price&q=a&q=b&utm_source=mail&held=yes'
    await page.goto(bad)
    await expect(h1(page)).toHaveText('Stocks')

    const notes = page.locator('[data-slot="alert"][role="status"]')
    await expect(notes).toContainText('"Bitcoin" isn\'t a Market value')
    await expect(notes).toContainText('"price" isn\'t a column you can sort by')
    await expect(notes).toContainText('The search was given more than once')
    await expect(notes).not.toContainText('utm_source')
    await expect.poll(() => tableTickers(page)).toEqual(['KO', 'NVDA', 'PTT']) // the one good part, held=yes, still applies
    expect(page.url()).toContain(bad)

    await page.getByRole('button', { name: 'Sort by Name' }).click() // the first change writes the clean address
    await expect(page).toHaveURL(/\/stocks\?held=yes&sort=name$/)
    await expect(notes).toHaveCount(0)
  })

  test('TC-E-506: after editing a stock, going back to the filtered table shows the saved change and keeps the filters', async ({ page }) => {
    const seed = await seedFilterDataset()
    await openAs(page, seed.user)
    await page.goto('/stocks?market=TH')
    await page.getByRole('link', { name: 'PTT', exact: true }).click()
    await page.getByRole('link', { name: 'Edit' }).click()
    await page.locator('#stock-name').fill('PTT Renamed Public')
    await page.getByRole('button', { name: 'Save changes' }).click()
    await expect(page).toHaveURL(new RegExp(`/stocks/${seed.stocks['PTT']?.id}$`))

    for (let i = 0; i < 4 && !/\/stocks\?market=TH$/.test(page.url()); i++) await page.goBack()
    await expect(page).toHaveURL(/\/stocks\?market=TH$/)
    await expect(page.getByRole('row', { name: /PTT Renamed Public/ })).toBeVisible()
    await expect(page.getByText('Market: TH')).toBeVisible()
    await expect.poll(async () => (await tableTickers(page)).length).toBe(6)
    await expect(filtersButton(page)).toHaveAccessibleName('Filters 1 active')
    await expect(sheet(page)).toHaveCount(0)
  })
})
