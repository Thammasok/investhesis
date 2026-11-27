import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type Page, type Request } from '@playwright/test'
import { groupRow, openAs, pickOption, seedHoldingsDataset } from './lib/hc.ts'
import { apiAs, h1, newUser, noHorizontalScroll, settled, signedInUser, th, toast, us } from './lib/sl.ts'
import type { SavedList } from './lib/sl.ts'

const share = (page: Page, group: string) => groupRow(page, group).getByText(/^\d+\.\d%$/)
const flag = (page: Page, group: string) => groupRow(page, group).getByText(/^Over \d+%$/)
const settingsButton = (page: Page) => page.getByRole('button', { name: 'Settings' })
const dialog = (page: Page) => page.getByRole('dialog', { name: 'Concentration settings' })
const apiRequests = (page: Page) => {
  const seen: Request[] = []
  page.on('request', (r) => {
    if (r.url().includes('/api/')) seen.push(r)
  })
  return seen
}

test.describe('concentration page', () => {
  test('TC-E-406: default views, scopes, lenses and expanding a group', async ({ page }) => {
    // Arrange
    const { user, stocks } = await seedHoldingsDataset()
    await openAs(page, user)

    // Assert: the default view is All stocks / Sector / Count with HC-A's figures
    await expect(page.getByRole('combobox', { name: 'Scope' })).toHaveText('All stocks (8)')
    await expect(page.getByRole('combobox', { name: 'Group by' })).toHaveText('Sector (GICS)')
    await expect(page.getByRole('radio', { name: 'Count' })).toBeChecked()
    for (const [group, value] of [['Information Technology', '37.5%'], ['Financials', '25.0%'], ['Energy', '12.5%'], ['Health Care', '12.5%'], ['Not set', '12.5%']] as const) {
      await expect(share(page, group)).toHaveText(value)
    }
    await expect(page.getByText('No group at 40% or more of the stocks')).toBeVisible()
    await expect(page.getByText('These groupings and costs are your own classifications, not advice.')).toBeVisible()
    await expect(page.getByText('Not set', { exact: true })).toBeVisible()
    await expect(page.getByText(/Over/)).toHaveCount(0)
    const requests = apiRequests(page)

    // Act + Assert: Held stocks
    await pickOption(page, 'Scope', /^Held stocks/)
    await expect(share(page, 'Information Technology')).toHaveText('60.0%')
    await expect(flag(page, 'Information Technology')).toHaveText('Over 40%')
    await expect(page.getByText('1 group at 40% or more of the stocks')).toBeVisible()

    // Act + Assert: the Core holdings list
    await pickOption(page, 'Scope', /^Core holdings/)
    await expect(share(page, 'Information Technology')).toHaveText('66.7%')

    // Act + Assert: the other lenses regroup
    await pickOption(page, 'Scope', /^All stocks/)
    await pickOption(page, 'Group by', 'Market')
    await expect(share(page, 'US')).toHaveText('62.5%')
    await expect(flag(page, 'US')).toBeVisible()
    await expect(share(page, 'TH')).toHaveText('37.5%')
    await pickOption(page, 'Group by', 'Style')
    await expect(share(page, 'Not set')).toHaveText('100.0%')
    await expect(flag(page, 'Not set')).toHaveCount(0)
    await pickOption(page, 'Group by', 'Economic cycle')
    await expect(share(page, 'Sensitive')).toHaveText('50.0%')
    await expect(share(page, 'Cyclical')).toHaveText('25.0%')
    await pickOption(page, 'Group by', 'SET industry group')
    await expect(share(page, 'Resources')).toHaveText('12.5%')
    await expect(share(page, 'Financials')).toHaveText('25.0%')
    expect(requests.map((r) => r.url())).toEqual([])

    // Act: expand a group and follow a ticker
    await pickOption(page, 'Group by', 'Sector (GICS)')
    await groupRow(page, 'Information Technology').getByRole('button', { name: 'Show stocks in Information Technology' }).click()
    const links = page.getByRole('link', { name: /^(NVDA|MSFT|AAPL)$/ })
    await expect(links).toHaveCount(3)
    expect((await links.allTextContents()).sort()).toEqual(['AAPL', 'MSFT', 'NVDA'])
    const before = page.url()
    await page.getByRole('link', { name: 'NVDA', exact: true }).click()
    await expect(page).toHaveURL(`/stocks/${stocks.NVDA.id}`)
    await page.goBack()

    // Assert: Back returns to the same view
    await expect(page).toHaveURL(before)
    await expect(share(page, 'Information Technology')).toHaveText('37.5%')
  })

  test('TC-E-407: value at cost: the left-out note, then the rate makes USD join', async ({ page }) => {
    // Arrange
    const { user, api } = await seedHoldingsDataset()
    await openAs(page, user, '/concentration?measure=value')

    // Assert: no rate yet, PTTEP and KBANK only
    await expect(share(page, 'Energy')).toHaveText('57.7%')
    await expect(share(page, 'Financials')).toHaveText('42.3%')
    await expect(flag(page, 'Energy')).toBeVisible()
    await expect(flag(page, 'Financials')).toBeVisible()
    await expect(page.getByText('2 groups at 40% or more of value at cost')).toBeVisible()
    const note = page.getByText(/^Not in the value:/)
    await expect(note).toContainText('1 held stock without shares or cost (AAPL)')
    await expect(note).toContainText('2 USD holdings need a rate')
    await expect(note).toContainText('3 stocks not held')

    // Act: Set rate
    await page.getByRole('button', { name: 'Set rate' }).click()
    const rate = dialog(page).getByLabel('Exchange rate, THB per 1 USD')
    await expect(rate).toBeFocused()
    await rate.fill('36.25')
    await dialog(page).getByRole('button', { name: 'Save' }).click()

    // Assert: USD joins the value
    await expect(toast(page, 'Settings saved')).toBeVisible()
    await expect(groupRow(page, 'Information Technology')).toContainText('฿72,500.00')
    await expect(share(page, 'Information Technology')).toHaveText('67.1%')
    await expect(flag(page, 'Information Technology')).toBeVisible()
    await expect(share(page, 'Energy')).toHaveText('19.0%')
    await expect(share(page, 'Financials')).toHaveText('13.9%')
    await expect(page.getByText(/USD holdings? needs? a rate/)).toHaveCount(0)
    const today = await page.evaluate(() => new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }))
    await expect(page.getByText(`Threshold 40% · 1 USD = 36.25 THB, saved ${today}`)).toBeVisible()
    expect(await api.settings()).toMatchObject({ usdThbRate: '36.250000' })

    // Act: Clear rate
    await settingsButton(page).click()
    await dialog(page).getByRole('button', { name: 'Clear rate' }).click()
    await dialog(page).getByRole('button', { name: 'Save' }).click()

    // Assert: back to the no-rate numbers
    await expect(share(page, 'Energy')).toHaveText('57.7%')
    await expect(page.getByText('Threshold 40% · No exchange rate saved')).toBeVisible()
    expect(await api.settings()).toEqual({ concentrationThreshold: 40, usdThbRate: null, usdThbRateUpdatedAt: null, language: null })
  })

  test('TC-E-408: the threshold and rate persist across a reload and a second device', async ({ page, browser }) => {
    // Arrange
    const { user } = await seedHoldingsDataset()
    await openAs(page, user)

    // Act: threshold 35 and a rate
    await settingsButton(page).click()
    await dialog(page).getByLabel('Warning threshold').fill('35')
    await dialog(page).getByLabel('Exchange rate, THB per 1 USD').fill('36.25')
    await dialog(page).getByRole('button', { name: 'Save' }).click()
    await expect(toast(page, 'Settings saved')).toBeVisible()
    await page.reload()

    // Assert: first context
    await expect(flag(page, 'Information Technology')).toHaveText('Over 35%')
    await expect(page.getByText(/Threshold 35% · 1 USD = 36.25 THB, saved/)).toBeVisible()

    // Act + Assert: a second browser context for the same user, no local state
    const second = await browser.newContext()
    const page2 = await second.newPage()
    await openAs(page2, user)
    await expect(flag(page2, 'Information Technology')).toHaveText('Over 35%')
    await expect(page2.getByText(/Threshold 35% · 1 USD = 36.25 THB, saved/)).toBeVisible()
    await second.close()

    // Act + Assert: 100 removes every flag, 1 flags every group but Not set
    const api = await apiAs(user)
    await api.saveSettings({ concentrationThreshold: 100 })
    await page.reload()
    await expect(page.getByText(/Over/)).toHaveCount(0)
    await api.saveSettings({ concentrationThreshold: 1 })
    await page.reload()
    await expect(page.getByText(/^Over 1%$/)).toHaveCount(4)
    await expect(flag(page, 'Not set')).toHaveCount(0)
  })

  test('TC-E-409: the address survives reload and a new tab, Back leaves the page, bad addresses fall back', async ({ page, context }) => {
    // Arrange
    const { user, api, core } = await seedHoldingsDataset()
    const other = await newUser('e2e-hc-v')
    const foreign: SavedList = await (await apiAs(other)).list('V list')
    await openAs(page, user, '/stocks')
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    await page.getByRole('link', { name: 'Concentration' }).first().click()
    await expect(h1(page)).toHaveText('Concentration')

    // Act: choose scope, lens and measure
    await pickOption(page, 'Scope', /^Core holdings/)
    await pickOption(page, 'Group by', 'Moat')
    await page.getByRole('radio', { name: 'Value at cost' }).click()

    // Assert: the address
    await expect(page).toHaveURL(`/concentration?scope=${core.id}&lens=moat&measure=value`)
    const view = async (p: Page) => [await p.getByRole('combobox', { name: 'Scope' }).textContent(), await p.getByRole('combobox', { name: 'Group by' }).textContent(), await p.getByRole('radio', { name: 'Value at cost' }).isChecked()]
    const expected = ['Core holdings (3)', 'Moat', true]
    await expect.poll(() => view(page)).toEqual(expected)
    await page.reload()
    await settled(page)
    await expect.poll(() => view(page)).toEqual(expected)
    const tab = await context.newPage()
    await tab.goto(page.url())
    await settled(tab)
    await expect.poll(() => view(tab)).toEqual(expected)
    await tab.close()

    // Act + Assert: Back leaves the page instead of stepping through each tweak
    await page.goBack()
    await expect(page).toHaveURL(/\/stocks$/)

    // Act + Assert: stale and foreign list ids show the same note
    await api.deleteList(core.id)
    const notes: string[] = []
    for (const path of [`/concentration?scope=${core.id}`, `/concentration?scope=${foreign.id}`]) {
      await page.goto(path)
      await settled(page)
      notes.push((await page.getByText(/That list no longer exists/).textContent()) ?? '')
    }
    expect(notes).toEqual(['That list no longer exists. Showing all stocks.', 'That list no longer exists. Showing all stocks.'])
    await expect(page.getByRole('combobox', { name: 'Scope' })).toHaveText(/^All stocks/)

    // Act + Assert: unknown lens and measure
    await page.goto('/concentration?lens=banana')
    await expect(page.getByText("That grouping isn't available. Showing Sector (GICS).")).toBeVisible()
    await page.goto('/concentration?measure=sum')
    await expect(page.getByText("That measure isn't available. Showing Count.")).toBeVisible()
    await expect(page.getByRole('radio', { name: 'Count' })).toBeChecked()
    expect(errors).toEqual([])
  })

  test('TC-E-410: empty states', async ({ page }) => {
    // Arrange: a user with no stocks
    const { user } = await signedInUser(page, '')
    await openAs(page, user)

    // Assert 1: nothing to group, with working links
    await expect(page.getByRole('heading', { name: 'Nothing to group yet' })).toBeVisible()
    await expect(page.getByText('These groupings and costs are your own classifications, not advice.')).toBeVisible()
    await page.getByRole('link', { name: 'Add stock' }).click()
    await expect(page).toHaveURL(/\/stocks\/new$/)
    await page.goto('/concentration')
    await page.getByRole('main').getByRole('link', { name: 'Import' }).click()
    await expect(page).toHaveURL(/\/import-export$/)

    // Arrange 2: stocks, none held, and an empty list
    const api = await apiAs(user)
    await api.stock(us('AAPL'))
    const empty = await api.list('Core holdings')

    // Act + Assert 2: an empty list as scope
    await page.goto(`/concentration?scope=${empty.id}`)
    await expect(page.getByRole('heading', { name: 'Core holdings has no stocks yet.' })).toBeVisible()
    await page.getByRole('link', { name: 'Open Core holdings' }).click()
    await expect(page).toHaveURL(`/lists/${empty.id}`)

    // Act + Assert 3: scope held with nothing held, value asked for
    await page.goto('/concentration?scope=held&measure=value')
    await expect(page.getByText('No stock is marked as held yet.')).toBeVisible()
    await expect(page.getByRole('radio', { name: 'Value at cost' })).toBeDisabled()
    await expect(page.getByText('No held stock in this scope has shares and cost.')).toBeVisible()
    await expect(page.getByRole('link', { name: "Mark holdings on a stock's page." }).first()).toHaveAttribute('href', '/stocks')
    await expect(page.getByRole('radio', { name: 'Count' })).toBeChecked()
    await expect(page.getByText('These groupings and costs are your own classifications, not advice.')).toBeVisible()

    // Assert 4: the count view of all stocks still works
    await page.goto('/concentration?scope=all&measure=value')
    await expect(page.getByRole('button', { name: 'Show stocks in Not set' })).toBeVisible()
  })

  test('TC-E-411: a multi-value lens counts a stock in each group, and says so', async ({ page }) => {
    // Arrange
    const { user, api } = await signedInUser(page, '')
    await api.stock(us('AAA', { themes: ['AI', 'EV'], indexMembership: ['S&P 500', 'Nasdaq-100'] }))
    await api.stock(us('BBB', { themes: ['AI'] }))
    await api.stock(us('CCC'))
    await openAs(page, user, '/concentration?lens=themes')

    // Assert: themes
    await expect(share(page, 'AI')).toHaveText('66.7%')
    await expect(share(page, 'EV')).toHaveText('33.3%')
    await expect(share(page, 'Not set')).toHaveText('33.3%')
    const note = 'A stock with several themes counts in each of them, so the shares add up to more than 100%.'
    await expect(page.getByText(note)).toBeVisible()

    // Act + Assert: index membership has its own wording
    await pickOption(page, 'Group by', 'Index membership')
    await expect(page.getByText('A stock with several index memberships counts in each of them, so the shares add up to more than 100%.')).toBeVisible()
    await expect(share(page, 'S&P 500')).toHaveText('33.3%')

    // Act + Assert: Sector has no such note
    await pickOption(page, 'Group by', 'Sector (GICS)')
    await expect(page.getByText(/counts in each of them/)).toHaveCount(0)
  })

  test('TC-E-412: exact decimals and rounding end to end', async ({ page }) => {
    // Arrange: HC-B through the real API (both THB, so no rate is needed)
    const { user, api } = await signedInUser(page, '')
    const x = await api.stock(th('XXX', { gicsSector: 'Energy', setIndustryGroup: 'Resources', holding: { shares: '1', averageCost: '3996', costCurrency: 'THB' } }))
    const y = await api.stock(th('YYY', { gicsSector: 'Utilities', setIndustryGroup: 'Resources', holding: { shares: '1', averageCost: '6004', costCurrency: 'THB' } }))
    await openAs(page, user, '/concentration?measure=value')

    // Assert 1: 39.96% shows 40.0% and is not flagged; 60.04% shows 60.0% and is flagged
    await expect(groupRow(page, 'Energy')).toContainText('฿3,996.00')
    await expect(share(page, 'Energy')).toHaveText('40.0%')
    await expect(flag(page, 'Energy')).toHaveCount(0)
    await expect(share(page, 'Utilities')).toHaveText('60.0%')
    await expect(flag(page, 'Utilities')).toBeVisible()
    await expect(page.getByText('1 group at 40% or more of value at cost')).toBeVisible()
    await expect(page.getByText('Utilities — 60.0%')).toBeVisible()

    // Act: edit both costs through the form so X is exactly 40
    for (const [stock, cost] of [[x, '4000'], [y, '6000']] as const) {
      await page.goto(`/stocks/${stock.id}/edit`)
      await page.locator('#stock-holdingAverageCost').fill(cost)
      await page.getByRole('button', { name: 'Save changes' }).click()
      await expect(toast(page, `${stock.ticker} updated`)).toBeVisible()
    }
    await page.goto('/concentration?measure=value')

    // Assert 2: exactly 40 is flagged
    await expect(share(page, 'Energy')).toHaveText('40.0%')
    await expect(flag(page, 'Energy')).toBeVisible()
    await expect(page.getByText('2 groups at 40% or more of value at cost')).toBeVisible()

    // Act + Assert 3: 0.1 + 0.2 in one sector is 0.30, not a float
    await api.stock(th('ZA', { gicsSector: 'Real Estate', setIndustryGroup: 'Property & Construction', holding: { shares: '1', averageCost: '0.1', costCurrency: 'THB' } }))
    await api.stock(th('ZB', { gicsSector: 'Real Estate', setIndustryGroup: 'Property & Construction', holding: { shares: '1', averageCost: '0.2', costCurrency: 'THB' } }))
    await page.reload()
    await expect(groupRow(page, 'Real Estate')).toContainText('฿0.30')

    // Act + Assert 4: the largest holding on its page
    const big = await api.stock(th('BIG', { holding: { shares: '99999999999999.9999', averageCost: '99999999999999.9999', costCurrency: 'THB' } }))
    await page.goto(`/stocks/${big.id}`)
    await expect(page.getByText('฿9,999,999,999,999,999,980,000,000,000.00')).toBeVisible()
    expect(await noHorizontalScroll(page)).toBe(true)
    expect((await api.getStock(big.id)).holding).toEqual({ shares: '99999999999999.9999', averageCost: '99999999999999.9999', costCurrency: 'THB' })
  })
})

const GICS = ['Information Technology', 'Financials', 'Energy', 'Health Care', 'Materials', 'Utilities', 'Industrials', 'Real Estate', 'Consumer Staples', 'Communication Services', 'Consumer Discretionary']
const THEMES = ['AI', 'EV', 'Cloud', 'Biotech']

test.describe('performance', () => {
  test('TC-E-419: regrouping 200 stocks takes under 200 ms (p95) and makes no request', async ({ page }) => {
    test.setTimeout(240_000)
    // Arrange: HC-E, 200 stocks, 100 held (60 USD, 30 THB, 10 without amounts), themes 0..3, 12 lists
    const { user, api } = await signedInUser(page, '')
    const lists: SavedList[] = []
    for (let i = 0; i < 12; i++) lists.push(await api.list(`List ${String(i).padStart(2, '0')}`))
    const bodies = Array.from({ length: 200 }, (_, i) => {
      const gicsSector = GICS[i % GICS.length]
      const holding = i < 60 ? { shares: String(i + 1), averageCost: '10.5', costCurrency: 'USD' } : i < 90 ? { shares: String(i + 1), averageCost: '20', costCurrency: 'THB' } : i < 100 ? { shares: null, averageCost: null } : undefined
      const base = i % 3 === 0 ? th(`T${i}`, { setIndustryGroup: 'Resources' }) : us(`U${i}`)
      return { ...base, gicsSector, themes: THEMES.slice(0, i % 4), ...(holding && { holding }), listIds: [lists[i % 12]?.id] }
    })
    for (let from = 0; from < bodies.length; from += 10) await Promise.all(bodies.slice(from, from + 10).map((b) => api.stock(b)))
    await api.saveSettings({ usdThbRate: '36.25' })
    await openAs(page, user, '/concentration')
    await page.evaluate(() => {
      const w = window as unknown as { __t0: number; __done: number }
      w.__t0 = 0
      w.__done = 0
      for (const type of ['pointerup', 'click', 'keydown']) addEventListener(type, () => { w.__t0 = performance.now(); w.__done = 0 }, true)
      const watch = new MutationObserver((records) => {
        if (!records.some((r) => (r.target instanceof Element ? r.target : r.target.parentElement)?.closest('table'))) return
        requestAnimationFrame(() => { w.__done = performance.now() })
      })
      watch.observe(document.body, { subtree: true, childList: true, characterData: true })
    })
    const requests = apiRequests(page)
    const samples: Record<'scope' | 'lens' | 'measure', number[]> = { scope: [], lens: [], measure: [] }
    const read = async (kind: keyof typeof samples) => {
      await expect.poll(() => page.evaluate(() => (window as unknown as { __done: number }).__done), { timeout: 5000 }).toBeGreaterThan(0)
      samples[kind].push(await page.evaluate(() => { const w = window as unknown as { __t0: number; __done: number }; return w.__done - w.__t0 }))
    }

    // Act: 20 changes each of scope, lens (including Themes) and measure
    const scopes = [/^All stocks/, /^Held stocks/, ...lists.slice(0, 4).map((l) => new RegExp(`^${l.name}`))]
    for (let i = 0; i < 20; i++) {
      await pickOption(page, 'Scope', scopes[(i + 1) % scopes.length] as RegExp)
      await read('scope')
    }
    await pickOption(page, 'Scope', /^All stocks/)
    const lensNames = ['Sector (GICS)', 'Themes', 'Market', 'Size', 'Style', 'Economic cycle']
    for (let i = 0; i < 20; i++) {
      await pickOption(page, 'Group by', lensNames[(i + 1) % lensNames.length] as string)
      await read('lens')
    }
    await pickOption(page, 'Group by', 'Sector (GICS)')
    for (let i = 0; i < 20; i++) {
      await page.getByRole('radio', { name: i % 2 === 0 ? 'Value at cost' : 'Count' }).click()
      await read('measure')
    }

    // Assert: p95 under 200 ms for each control, no request, final table equals the dataset
    const p95 = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.ceil(0.95 * xs.length) - 1] as number
    const report = Object.fromEntries(Object.entries(samples).map(([k, xs]) => [k, { p95: Math.round(p95(xs) * 10) / 10, max: Math.round(Math.max(...xs) * 10) / 10, samples: xs.map((x) => Math.round(x * 10) / 10) }]))
    writeFileSync(join(__dirname, '.output/regroup-timings.json'), JSON.stringify(report, null, 2))
    for (const kind of ['scope', 'lens', 'measure'] as const) expect(p95(samples[kind]), `${kind} p95`).toBeLessThan(200)
    expect(requests.map((r) => r.url())).toEqual([])
    await page.getByRole('radio', { name: 'Count' }).click()
    for (const g of GICS) {
      const n = bodies.filter((b) => b.gicsSector === g).length
      await expect(groupRow(page, g)).toContainText(`${((n / 200) * 100).toFixed(1)}%`)
    }
  })
})
