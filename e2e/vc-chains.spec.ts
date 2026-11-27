import { readFileSync } from 'node:fs'
import { expect, test, type Page, type Request } from '@playwright/test'
import { groupRow, openAs as openConcentration } from './lib/hc.ts'
import { closeSheet, openSheet, pick, resultLine, searchBox, tableTickers } from './lib/sfe.ts'
import { apiAs, choose, importButton, newUser, noHorizontalScroll, openSignedIn, pickFile, settled, summaryLine, th, toast, us, chooseTarget } from './lib/sl.ts'
import { chainCard, chainSummary, chainTitles, laneIn, laneTickers, openChains, pickScope, renameTo, seedChainsDataset, tickersInView, ZONE } from './lib/vc.ts'

test.use({ timezoneId: ZONE })

const apiRequests = (page: Page) => {
  const seen: Request[] = []
  page.on('request', (r) => {
    if (new URL(r.url()).pathname.startsWith('/api/')) seen.push(r)
  })
  return seen
}

test.describe('the page and its links', () => {
  test('TC-E-900: the chains page shows both chains with their lanes, values, Held labels and notes', async ({ page }) => {
    test.setTimeout(120_000)
    const seed = await seedChainsDataset()
    const errors: string[] = []
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
    await openSignedIn(page, seed.user, '/stocks')
    await settled(page)

    const started = Date.now()
    await page.getByRole('link', { name: 'Value chains' }).first().click()
    await expect(page.getByRole('heading', { level: 1, name: 'Value chains' })).toBeVisible()
    await expect(chainCard(page, 'AI & Semis')).toBeVisible()
    expect(Date.now() - started).toBeLessThan(2000)
    await settled(page)

    expect(await chainTitles(page)).toEqual(['AI & Semis', 'Oil & Gas'])
    const ai = chainCard(page, 'AI & Semis')
    await expect(chainSummary(ai)).toHaveText('6 stocks · 4 held · ฿175,200.00')
    await expect(laneIn(ai, 'Upstream')).toContainText('2 stocks · 1 held · ฿62,050.00 · 35.4%')
    await expect(laneIn(ai, 'Midstream')).toContainText('2 stocks · 2 held · ฿58,400.00 · 33.3%')
    await expect(laneIn(ai, 'Downstream')).toContainText('1 stock · 1 held · ฿54,750.00 · 31.3%')
    await expect(laneIn(ai, /^Integrated/)).toContainText('1 stock · none held')
    await expect(page.locator('[data-slot="badge"]', { hasText: /^Held$/ })).toHaveCount(6)
    await expect(ai.getByText('Also spelled: ai & semis')).toBeVisible()
    const oil = chainCard(page, 'Oil & Gas')
    await expect(oil.getByText('1 held stock has no shares or cost and is left out of the value.')).toBeVisible()
    await expect(page.getByText('These chains and costs are your own classifications, not advice.')).toBeVisible()
    expect(errors).toEqual([])
  })

  test('TC-E-901: every link on the page leads where it says', async ({ page }) => {
    test.setTimeout(120_000)
    const seed = await seedChainsDataset()
    await openChains(page, seed.user)

    // An entry opens its stock page
    await laneIn(chainCard(page, 'AI & Semis'), 'Upstream').getByRole('link', { name: /^ASML/ }).click()
    await expect(page).toHaveURL(new RegExp(`/stocks/${seed.stocks['ASML']?.id}$`))
    await page.goBack()
    await expect(page.getByRole('heading', { level: 1, name: 'Value chains' })).toBeVisible()

    // Stocks → lists the chain's six stocks, both spellings
    await chainCard(page, 'AI & Semis').getByRole('link', { name: /^Stocks/ }).click()
    await expect(page).toHaveURL(/\/stocks\?valueChain=/)
    expect(new URL(page.url()).searchParams.getAll('valueChain')).toEqual(['AI & Semis'])
    await expect.poll(async () => (await tableTickers(page)).sort()).toEqual(['AMAT', 'ASML', 'INTC', 'MSFT', 'NVDA', 'TSM'])
    await page.goBack()

    // Show them → the stocks without a chain
    await page.getByRole('link', { name: 'Show them' }).click()
    await expect(page).toHaveURL(/\/stocks\?valueChain=$/)
    await expect.poll(async () => (await tableTickers(page)).sort()).toEqual(['AAPL', 'JNJ', 'KO'])
    await page.goBack()

    // Set position of BCP → its edit form; change it and come back
    await page.getByRole('link', { name: 'Set position of BCP' }).click()
    await expect(page).toHaveURL(new RegExp(`/stocks/${seed.stocks['BCP']?.id}/edit$`))
    await choose(page, 'valueChainPosition', 'Downstream')
    await page.getByRole('button', { name: 'Save changes' }).click()
    await expect(toast(page, /updated/i).first()).toBeVisible()
    await page.goto('/chains')
    await expect(laneIn(chainCard(page, 'Oil & Gas'), 'Downstream').getByRole('link', { name: /^BCP/ })).toBeVisible()

    // See concentration
    await page.getByRole('link', { name: 'See concentration' }).click()
    await expect(page).toHaveURL(/\/concentration\?scope=all&lens=valueChain&measure=count/)
    await expect(page.getByRole('combobox', { name: 'Group by' })).toContainText('Value chain name')
    for (const [label, count] of [['AI & Semis', '6'], ['Oil & Gas', '3'], ['Not set', '3']] as const) {
      await expect(groupRow(page, label).getByRole('cell').nth(1)).toHaveText(count)
    }
  })

  test('TC-E-902: scope, filters and search regroup in the browser with no request, and the address is the view', async ({ page, browser }) => {
    test.setTimeout(120_000)
    const seed = await seedChainsDataset()
    await openChains(page, seed.user)
    const requests = apiRequests(page)

    await pickScope(page, /^Held stocks/)
    await expect.poll(() => tickersInView(page).then((t) => t.includes('AMAT'))).toBe(false)
    await pickScope(page, /^Core/)
    await expect.poll(async () => (await tickersInView(page)).sort()).toEqual(['ASML', 'PTTEP', 'TSM'])
    await pickScope(page, /^All stocks/)
    await openSheet(page)
    await pick(page, 'Market', /^TH, /)
    await closeSheet(page)
    await searchBox(page).fill('ptt')
    await expect.poll(async () => (await tickersInView(page)).sort()).toEqual(['PTT', 'PTTEP'])
    expect(requests.map((r) => r.url())).toEqual([])
    await page.getByRole('button', { name: 'Clear all' }).first().click()
    await expect.poll(async () => (await tickersInView(page)).length).toBe(9)
    expect(requests.map((r) => r.url())).toEqual([])

    // The address holds the view: set it again, reload, and open it in a second browser context
    await pickScope(page, /^Core/)
    await openSheet(page)
    await pick(page, 'Market', /^US, /)
    await closeSheet(page)
    await searchBox(page).fill('t')
    await expect.poll(() => new URL(page.url()).search).toContain('scope=')
    const address = new URL(page.url())
    expect([...address.searchParams.keys()].sort()).toEqual(['market', 'q', 'scope'])
    const shown = (await tickersInView(page)).sort()
    await page.reload()
    await expect(page.getByRole('heading', { level: 1, name: 'Value chains' })).toBeVisible()
    await settled(page)
    expect((await tickersInView(page)).sort()).toEqual(shown)
    const second = await browser.newContext({ timezoneId: ZONE })
    const other = await second.newPage()
    await openSignedIn(other, seed.user, `${address.pathname}${address.search}`)
    await expect(other.getByRole('heading', { level: 1, name: 'Value chains' })).toBeVisible()
    await settled(other)
    expect((await tickersInView(other)).sort()).toEqual(shown)
    await second.close()

    // Back leaves /chains (every change was a replace)
    await page.goBack()
    expect(new URL(page.url()).pathname).not.toBe('/chains')
  })

  test('TC-E-903: a bad address is corrected with notes and never rewritten', async ({ page }) => {
    const seed = await seedChainsDataset()
    const address = '/chains?scope=does-not-exist&market=XX&utm_source=mail&sort=ticker'
    await openSignedIn(page, seed.user, address)
    await expect(page.getByRole('heading', { level: 1, name: 'Value chains' })).toBeVisible()
    await settled(page)

    const notes = page.getByRole('status').filter({ hasText: 'no longer exists' })
    await expect(notes).toContainText('That list no longer exists. Showing all stocks.')
    await expect(notes).toContainText(`"XX" isn't a Market value, so that filter was left out.`)
    await expect(notes).not.toContainText('utm_source')
    expect(await notes.locator('p').count()).toBe(2)
    expect(await chainTitles(page)).toEqual(['AI & Semis', 'Oil & Gas'])
    expect(page.url().endsWith(address)).toBe(true)

    // A list deleted in another tab: reloading its address shows the fallback
    await seed.api.deleteList(seed.core.id)
    await page.goto(`/chains?scope=${seed.core.id}`)
    await expect(page.getByText('That list no longer exists. Showing all stocks.')).toBeVisible()
    expect(await chainTitles(page)).toEqual(['AI & Semis', 'Oil & Gas'])
  })
})

test.describe('data that changes elsewhere, and the states of the page', () => {
  test('TC-E-914: the chains page and the Value chain lens show the same groups, counts and values', async ({ page }) => {
    test.setTimeout(180_000)
    const seed = await seedChainsDataset()
    await seed.api.stock(us('SP1', { name: 'Spelling one', valueChain: ' Banks ', valueChainPosition: 'Upstream' }))
    await seed.api.stock(us('SP2', { name: 'Spelling two', valueChain: 'banks', valueChainPosition: 'Downstream' }))
    await openChains(page, seed.user)

    const onChains = async (query: string) => {
      await page.goto(`/chains${query}`)
      await expect(page.getByRole('heading', { level: 1, name: 'Value chains' })).toBeVisible()
      await settled(page)
      const titles = await chainTitles(page)
      const out: Record<string, { count: string; value: string }> = {}
      for (const title of titles) {
        const text = (await chainSummary(chainCard(page, title)).textContent()) ?? ''
        out[title] = { count: /^(\d+)/.exec(text)?.[1] ?? '', value: /฿[\d,.]+/.exec(text)?.[0] ?? '' }
      }
      const note = page.getByText(/in view (has|have) no value chain/)
      const noChain = (await note.count()) > 0 ? Number(/^(\d+)/.exec((await note.first().textContent()) ?? '')?.[1] ?? 0) : 0
      return { out, noChain }
    }
    const onConcentration = async (query: string, measure: 'count' | 'value') => {
      await page.goto(`/concentration?lens=valueChain&measure=${measure}${query}`)
      await expect(page.getByRole('heading', { level: 1, name: 'Concentration' })).toBeVisible()
      await settled(page)
      const rows = page.getByRole('row').filter({ has: page.getByRole('button', { name: /^Show stocks in / }) })
      const out: Record<string, { count: string; value: string }> = {}
      for (const row of await rows.all()) {
        const label = ((await row.getByRole('button').textContent()) ?? '').trim()
        const cells = row.getByRole('cell')
        out[label] = measure === 'count' ? { count: ((await cells.nth(1).textContent()) ?? '').trim(), value: '' } : { count: ((await cells.nth(3).textContent()) ?? '').trim(), value: ((await cells.nth(1).textContent()) ?? '').trim() }
      }
      return out
    }

    const views: [string, string][] = [['all', ''], ['held', `&scope=held`], ['Core', `&scope=${seed.core.id}`], ['US', '&market=US']]
    for (const [name, query] of views) {
      const chains = await onChains(query.replace(/^&/, '?'))
      const counts = await onConcentration(query, 'count')
      const values = await onConcentration(query, 'value')
      const { 'Not set': notSet, ...groups } = counts
      expect(Object.fromEntries(Object.entries(groups).map(([k, v]) => [k, v.count])), `${name} counts`).toEqual(Object.fromEntries(Object.entries(chains.out).map(([k, v]) => [k, v.count])))
      expect(Number(notSet?.count ?? 0), `${name} not set`).toBe(chains.noChain)
      for (const [title, c] of Object.entries(chains.out)) if (c.value) expect(values[title]?.value, `${name} ${title}`).toBe(c.value)
    }
    expect(Object.keys((await onChains('')).out)).toContain('Banks')

    await seed.api.renameChain({ from: 'Oil & Gas', to: 'Energy' })
    const after = await onChains('')
    expect(Object.keys(after.out)).toContain('Energy')
    expect(Object.keys(after.out)).not.toContain('Oil & Gas')
    expect(Object.keys(await onConcentration('', 'count'))).toContain('Energy')
  })

  test('TC-E-915: a rate saved on Concentration scales the USD values; with none, USD stocks are Held but unvalued', async ({ page }) => {
    test.setTimeout(120_000)
    const seed = await seedChainsDataset()
    const asml = () => laneIn(chainCard(page, 'AI & Semis'), 'Upstream').getByRole('link', { name: /^ASML/ })
    await openConcentration(page, seed.user, '/concentration')

    await page.getByRole('button', { name: 'Settings' }).click()
    const dialog = page.getByRole('dialog', { name: 'Concentration settings' })
    await dialog.getByLabel('Exchange rate, THB per 1 USD').fill('40.000000')
    await dialog.getByRole('button', { name: 'Save' }).click()
    await expect(dialog).toHaveCount(0)
    await page.goto('/chains')
    await expect(asml()).toContainText('฿68,000.00')

    await seed.api.saveSettings({ usdThbRate: null })
    await page.reload()
    await expect(asml()).toBeVisible()
    await expect(asml()).not.toContainText('฿')
    await expect(asml()).toContainText('Held')
    await expect(chainSummary(chainCard(page, 'AI & Semis'))).toHaveText('6 stocks · 4 held')
    await expect(page.getByText('USD holdings are left out of values until you save a rate.')).toBeVisible()
    await expect(chainCard(page, 'AI & Semis').getByText('4 USD holdings need a rate and are left out of the value.')).toBeVisible()

    await page.getByRole('link', { name: 'Set rate on Concentration' }).click()
    await expect(page).toHaveURL(/\/concentration/)
    await page.getByRole('button', { name: 'Settings' }).click()
    await expect(page.getByRole('dialog', { name: 'Concentration settings' })).toBeVisible()
  })

  test('TC-E-916: holdings, positions, deleted stocks and lists change the page the next time it is opened', async ({ page }) => {
    test.setTimeout(180_000)
    const seed = await seedChainsDataset()
    const id = (t: string) => seed.stocks[t]?.id as string
    await openSignedIn(page, seed.user, `/stocks/${id('AMAT')}`)
    await settled(page)

    // AMAT marked as held with 3 x 200.00 USD
    await page.getByRole('button', { name: 'Mark as held' }).click()
    const dialog = page.getByRole('dialog', { name: /Holding · AMAT/ })
    await dialog.getByLabel('Shares (optional)').fill('3')
    await dialog.getByLabel('Average cost per share (optional)').fill('200')
    await dialog.getByRole('button', { name: 'Save' }).click()
    await expect(toast(page, 'AMAT marked as held')).toBeVisible()
    await page.goto('/chains')
    const ai = chainCard(page, 'AI & Semis')
    await expect(laneIn(ai, 'Upstream').getByRole('link', { name: /^AMAT/ })).toContainText('฿21,900.00')
    await expect(laneIn(ai, 'Upstream').getByRole('link', { name: /^AMAT/ })).toContainText('Held')
    await expect(chainSummary(ai)).toHaveText('6 stocks · 5 held · ฿197,100.00')

    // NVDA moved to Downstream through its form
    await page.goto(`/stocks/${id('NVDA')}/edit`)
    await choose(page, 'valueChainPosition', 'Downstream')
    await page.getByRole('button', { name: 'Save changes' }).click()
    await expect(toast(page, /updated/i).first()).toBeVisible()
    await page.goto('/chains')
    await expect.poll(() => laneTickers(chainCard(page, 'AI & Semis'), 'Midstream')).toEqual(['TSM'])
    await expect.poll(async () => (await laneTickers(chainCard(page, 'AI & Semis'), 'Downstream')).sort()).toEqual(['MSFT', 'NVDA'])

    // INTC deleted: the Integrated area goes
    await page.goto(`/stocks/${id('INTC')}`)
    await page.getByRole('button', { name: 'More actions' }).click()
    await page.getByRole('menuitem', { name: 'Delete' }).click()
    await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click()
    await expect(page).toHaveURL(/\/stocks$/)
    await page.goto('/chains')
    await expect(chainCard(page, 'AI & Semis').getByRole('region', { name: /^Integrated/ })).toHaveCount(0)

    // List Core deleted: the chains stay and a stale scope falls back with a note
    await seed.api.deleteList(seed.core.id)
    await page.goto('/chains')
    await expect.poll(() => chainTitles(page)).toEqual(['AI & Semis', 'Oil & Gas'])
    await page.goto(`/chains?scope=${seed.core.id}`)
    await expect(page.getByText('That list no longer exists. Showing all stocks.')).toBeVisible()

    // The last stock of a chain deleted: the chain goes
    for (const t of ['PTTEP', 'PTT', 'BCP']) await seed.api.deleteStock(id(t))
    await page.goto('/chains')
    await expect.poll(() => chainTitles(page)).toEqual(['AI & Semis'])
  })

  test('TC-E-917: the empty states say what to do and lead on', async ({ page }) => {
    test.setTimeout(120_000)
    // (a) a new user with no stocks
    const nobody = await newUser('e2e-vc-none')
    await openChains(page, nobody)
    await expect(page.getByRole('heading', { name: 'No value chains yet' })).toBeVisible()
    const card = page.locator('[data-slot="card"]').filter({ has: page.getByRole('heading', { name: 'No value chains yet' }) })
    await card.getByRole('link', { name: /Add stock/ }).click()
    await expect(page).toHaveURL(/\/stocks\/new$/)
    await page.goBack()
    await card.getByRole('link', { name: /Import/ }).click()
    await expect(page).toHaveURL(/\/import-export/)

    // (b) only stocks without a chain
    const plain = await newUser('e2e-vc-plain')
    const api = await apiAs(plain)
    for (const t of ['PA', 'PB', 'PC']) await api.stock(us(t))
    await openChains(page, plain)
    await expect(page.getByRole('heading', { name: 'No value chains in this view' })).toBeVisible()
    await page.getByRole('link', { name: 'Show the 3 stocks with no chain' }).click()
    await expect(page).toHaveURL(/\/stocks\?valueChain=$/)
    await expect.poll(async () => (await tableTickers(page)).sort()).toEqual(['PA', 'PB', 'PC'])

    // (c) a search that matches nothing
    const seed = await seedChainsDataset()
    await openChains(page, seed.user, '?q=zzzz')
    await expect(resultLine(page)).toHaveText('0 of 12 stocks')
    expect(await chainTitles(page)).toEqual([])
    await page.getByRole('button', { name: 'Clear all' }).first().click()
    await expect(resultLine(page)).toHaveText('12 stocks')
    expect(await chainTitles(page)).toEqual(['AI & Semis', 'Oil & Gas'])
  })
})

test.describe('names in Thai, history, exports and loading', () => {
  test.use({ locale: 'th-TH' })

  test('TC-E-925: Thai chain names render, link, rename and round trip unchanged, and numbers keep their format', async ({ page }) => {
    test.setTimeout(120_000)
    const user = await newUser('e2e-vc-thai')
    const api = await apiAs(user)
    const chain = (name: string) => ({ valueChain: name, valueChainPosition: 'Upstream' })
    await api.stock(th('T1', { name: 'ปตท.', ...chain('น้ำมัน A'), holding: { shares: '1234', averageCost: '1', costCurrency: 'THB' } }))
    await api.stock(th('T2', { name: 'บางจาก', ...chain('น้ำมัน a') }))
    await api.stock(th('T3', { name: 'ไทยออยล์', ...chain('น้ำมัน A ') }))
    await api.stock(th('T4', { name: 'ก๊าซ', ...chain('น้ำมันและก๊าซ') }))
    await openChains(page, user)

    expect(await chainTitles(page)).toEqual(['น้ำมัน A', 'น้ำมันและก๊าซ'])
    await expect(chainCard(page, 'น้ำมัน A').getByText('Also spelled: น้ำมัน a')).toBeVisible()
    await expect(chainCard(page, 'น้ำมัน A')).toContainText('฿1,234.00')
    await chainCard(page, 'น้ำมัน A').getByRole('link', { name: /^Stocks/ }).click()
    await expect(page).toHaveURL(/\/stocks\?valueChain=/)
    expect(new URL(page.url()).searchParams.getAll('valueChain')).toEqual(['น้ำมัน A'])
    await expect.poll(async () => (await tableTickers(page)).sort()).toEqual(['T1', 'T2', 'T3'])

    await page.goto('/chains')
    await renameTo(page, 'น้ำมัน A', 'พลังงาน')
    await expect(toast(page, 'Renamed to พลังงาน')).toBeVisible()
    await page.reload()
    await expect(chainCard(page, 'พลังงาน')).toBeVisible()
    expect((await api.stocks()).filter((s) => s.valueChain === 'พลังงาน').map((s) => s.ticker).sort()).toEqual(['T1', 'T2', 'T3'])
    const stored = (await api.stocks()).find((s) => s.ticker === 'T4')?.valueChain as string
    expect([...stored].map((c) => c.codePointAt(0))).toEqual([...'น้ำมันและก๊าซ'].map((c) => c.codePointAt(0)))
    await chainCard(page, 'พลังงาน').getByRole('link', { name: /^Stocks/ }).click()
    await expect.poll(async () => (await tableTickers(page)).sort()).toEqual(['T1', 'T2', 'T3'])
  })
})

test('TC-E-926: view changes are replaces, a rename adds no history entry, and Back and Forward keep the view', async ({ page }) => {
  test.setTimeout(120_000)
  const seed = await seedChainsDataset()
  await openChains(page, seed.user)

  await pickScope(page, /^Held stocks/)
  await openSheet(page)
  await pick(page, 'Market', /^US, /)
  await closeSheet(page)
  await searchBox(page).fill('a')
  await expect.poll(() => new URL(page.url()).searchParams.get('q')).toBe('a')
  // Held, US and "a" leave only the AI & Semis chain in view; rename it
  await renameTo(page, 'AI & Semis', 'AI and Semis')
  await expect(toast(page, /Renamed to AI and Semis/)).toBeVisible()
  const here = page.url()

  await page.goBack()
  expect(new URL(page.url()).pathname).not.toBe('/chains')
  await page.goForward()
  await expect(page).toHaveURL(here)
  await settled(page)
  const names = await chainTitles(page)
  expect(names).toEqual(['AI and Semis'])
})

test('TC-E-927: backups and the stock CSV carry the new name and nothing else changes, and a re-import keeps it', async ({ page }) => {
  test.setTimeout(180_000)
  const seed = await seedChainsDataset()
  const before = await seed.api.backupJson()
  await seed.api.renameChain({ from: 'Oil & Gas', to: 'Energy' })

  await openSignedIn(page, seed.user, '/import-export')
  await settled(page)
  const get = async (trigger: () => Promise<void>) => {
    const [file] = await Promise.all([page.waitForEvent('download'), trigger()])
    return readFileSync((await file.path())!, 'utf8')
  }
  const json = JSON.parse(await get(() => page.getByRole('button', { name: 'Download JSON' }).click())) as typeof before
  const csv = await get(() => page.getByRole('button', { name: 'Download CSV' }).click())
  const energy = json.stocks.filter((s) => s.valueChain === 'Energy').map((s) => s.ticker).sort()
  expect(energy).toEqual(['BCP', 'PTT', 'PTTEP'])
  const strip = (s: Record<string, unknown>) => ({ ...s, valueChain: null, updatedAt: null, lensSources: null })
  expect(json.formatVersion).toBe(before.formatVersion)
  expect(json.stocks.map(strip)).toEqual(before.stocks.map(strip))
  expect(csv.split('\r\n').filter((l) => l.includes('Energy'))).toHaveLength(3)
  expect(csv).not.toContain('Oil & Gas')

  await page.goto('/stocks')
  await settled(page)
  await page.getByRole('button', { name: 'Export' }).click()
  const stockCsv = await get(() => page.getByRole('menuitem', { name: /Download CSV/ }).click())
  expect(stockCsv.split('\r\n').filter((l) => l.includes('Energy'))).toHaveLength(3)

  // Importing the backup CSV in update mode keeps the name
  await page.goto('/import-export/import')
  await pickFile(page, 'backup.csv', csv, 'text/csv')
  await page.getByLabel('Update', { exact: true }).check()
  await chooseTarget(page, 'Core')
  await importButton(page).click()
  await expect(summaryLine(page)).toContainText('updated')
  expect((await seed.api.stocks()).filter((s) => s.valueChain === 'Energy')).toHaveLength(3)
})

test('TC-E-928: the skeleton shows while the page loads, and a stopped API gives the route error', async ({ page }) => {
  test.setTimeout(120_000)
  const seed = await seedChainsDataset()
  await openChains(page, seed.user)

  // Slow reads: the skeleton is on screen, then the page replaces it
  let released = false
  await page.route('**/api/stocks', async (route) => {
    await new Promise((r) => setTimeout(r, 1500))
    released = true
    await route.continue()
  })
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.reload()
  await expect(page.locator('[data-slot="skeleton"]').first()).toBeVisible()
  await expect(chainCard(page, 'AI & Semis')).toBeVisible()
  expect(released).toBe(true)
  await page.unroute('**/api/stocks')

  // API down: the route error page, and reloading works once it is back
  await page.route('**/api/stocks', (route) => route.abort())
  await page.reload()
  await expect(page.getByRole('alert').getByRole('heading', { name: 'Something went wrong' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Reload' })).toBeVisible()
  await page.unroute('**/api/stocks')
  await page.getByRole('button', { name: 'Reload' }).click()
  await expect(chainCard(page, 'AI & Semis')).toBeVisible()
  expect(errors).toEqual([])
  expect(await noHorizontalScroll(page)).toBe(true)
})

