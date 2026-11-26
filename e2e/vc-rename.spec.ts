import { expect, test, type Page } from '@playwright/test'
import { apiAs, fillSignIn, lens, newUser, noHorizontalScroll, STORAGE_KEY, toast, us } from './lib/sl.ts'
import { chainCard, chainSummary, chainTitles, laneIn, laneTickers, nameBox, openChains, renameButton, renameDialog, renameTo, seedChainsDataset, ZONE } from './lib/vc.ts'

test.use({ timezoneId: ZONE })

const chainPosts = (page: Page) => {
  const bodies: { from: string; to: string; merge: boolean }[] = []
  page.on('request', (r) => {
    if (r.url().endsWith('/api/chains/rename') && r.method() === 'POST') bodies.push(r.postDataJSON())
  })
  return bodies
}
const chain = (name: string, position = 'Upstream') => ({ valueChain: name, valueChainPosition: position })

test.describe('rename and merge', () => {
  test('TC-E-904: renaming keeps every figure and counts all stocks of the chain, in view or not', async ({ page }) => {
    test.setTimeout(120_000)
    const seed = await seedChainsDataset({ msftTh: true })
    await openChains(page, seed.user, '?market=US')
    const lanes = async () => ({
      summary: await chainSummary(chainCard(page, /AI/)).textContent(),
      up: await laneIn(chainCard(page, /AI/), 'Upstream').textContent(),
      mid: await laneIn(chainCard(page, /AI/), 'Midstream').textContent(),
    })
    const figures = await lanes()
    const stocksBefore = await seed.api.stocks()

    await renameButton(page, 'AI & Semis').click()
    await expect(renameDialog(page)).toContainText('Changes the name on 6 stocks, including any outside this view.')
    await nameBox(page).fill('AI and Semis')
    await renameDialog(page).getByRole('button', { name: 'Rename' }).click()

    await expect(toast(page, 'Renamed to AI and Semis · 6 stocks changed')).toBeVisible()
    await expect(chainCard(page, 'AI and Semis')).toBeVisible()
    expect(await lanes()).toEqual(figures)
    const after = await seed.api.stocks()
    for (const s of after) {
      const was = stocksBefore.find((b) => b.id === s.id)!
      const inChain = ['ASML', 'AMAT', 'TSM', 'NVDA', 'MSFT', 'INTC'].includes(s.ticker)
      expect(s.valueChain, s.ticker).toBe(inChain ? 'AI and Semis' : was.valueChain)
      expect(s.valueChainPosition).toBe(was.valueChainPosition)
      expect(s.holding).toEqual(was.holding)
    }
    await page.reload()
    await expect(chainCard(page, 'AI and Semis')).toBeVisible()
  })

  test('TC-E-905: a case-only rename is a plain rename in both directions', async ({ page }) => {
    test.setTimeout(120_000)
    const seed = await seedChainsDataset()
    await openChains(page, seed.user)
    const bodies = chainPosts(page)
    const others = (await seed.api.stocks()).filter((s) => s.valueChain !== 'AI & Semis' && s.valueChain !== 'ai & semis').map((s) => [s.id, s.updatedAt])

    await renameTo(page, 'AI & Semis', 'ai & semis')
    await expect(toast(page, 'Renamed to ai & semis · 5 stocks changed')).toBeVisible()
    await expect(page.getByRole('heading', { name: /^Merge into/ })).toHaveCount(0)
    await expect(chainCard(page, 'ai & semis')).toBeVisible()
    await expect(chainCard(page, 'ai & semis').getByText(/Also spelled/)).toHaveCount(0)
    expect((await seed.api.stocks()).filter((s) => ['ASML', 'AMAT', 'TSM', 'NVDA', 'MSFT', 'INTC'].includes(s.ticker)).map((s) => s.valueChain)).toEqual(Array(6).fill('ai & semis'))

    await renameTo(page, 'ai & semis', 'AI & Semis')
    await expect(toast(page, 'Renamed to AI & Semis · 6 stocks changed')).toBeVisible()
    await expect(chainCard(page, 'AI & Semis')).toBeVisible()
    expect(bodies).toEqual([{ from: 'AI & Semis', to: 'ai & semis', merge: false }, { from: 'ai & semis', to: 'AI & Semis', merge: false }])
    const now = (await seed.api.stocks()).filter((s) => s.valueChain !== 'AI & Semis' && s.valueChain !== 'ai & semis').map((s) => [s.id, s.updatedAt])
    expect(now).toEqual(others)
  })

  test('TC-E-906: renaming onto another chain asks first, Back changes nothing, Merge joins both chains', async ({ page }) => {
    test.setTimeout(120_000)
    const seed = await seedChainsDataset({ extraSemis: 2, extraAiSemis: 3 })
    await openChains(page, seed.user)
    const before = JSON.stringify(await seed.api.stocks())

    await renameTo(page, 'AI semis', 'AI & Semis')
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByRole('heading', { name: 'Merge into "AI & Semis"?' })).toBeFocused()
    await expect(dialog).toContainText('"AI semis" (3 stocks) and "AI & Semis" (8 stocks) will become one chain named "AI & Semis".')
    await expect(dialog).toContainText("This can't be split again automatically.")
    await expect(dialog.getByRole('button', { name: 'Merge 11 stocks' })).toBeVisible()
    await dialog.getByRole('button', { name: 'Back' }).click()
    await expect(nameBox(page)).toHaveValue('AI & Semis')
    expect(JSON.stringify(await seed.api.stocks())).toBe(before)
    await renameDialog(page).getByRole('button', { name: 'Rename' }).click()
    await page.getByRole('button', { name: 'Merge 11 stocks' }).click()

    await expect(toast(page, 'Merged into AI & Semis · 11 stocks')).toBeVisible()
    await expect(page.getByRole('region', { name: 'AI semis' })).toHaveCount(0)
    const card = chainCard(page, 'AI & Semis')
    await expect(chainSummary(card)).toContainText('11 stocks')
    await expect(card.getByRole('heading', { level: 2 })).toBeFocused()
    expect((await laneTickers(card, 'Upstream')).sort()).toEqual(['AMAT', 'ASML', 'OLD1', 'OLD2', 'OLD3'])
    expect((await seed.api.stocks()).filter((s) => s.valueChain === 'AI & Semis')).toHaveLength(11)
  })

  test('TC-E-907: a stale page learns about the other chain from the server, and nothing changes until Merge', async ({ page }) => {
    test.setTimeout(120_000)
    const user = await newUser('e2e-vc-stale')
    const api = await apiAs(user)
    for (const t of ['B1', 'B2', 'B3']) await api.stock(us(t, chain('Banks')))
    await openChains(page, user)
    expect(await chainTitles(page)).toEqual(['Banks'])
    const bodies = chainPosts(page)
    // Another tab creates "Finance" with two stocks
    for (const t of ['F1', 'F2']) await api.stock(us(t, chain('Finance')))
    const before = JSON.stringify(await api.stocks())

    await renameTo(page, 'Banks', 'Finance')
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByRole('heading', { name: 'Merge into "Finance"?' })).toBeVisible()
    await expect(dialog).toContainText('"Banks" (3 stocks) and "Finance" (2 stocks)')
    expect(bodies).toEqual([{ from: 'Banks', to: 'Finance', merge: false }])
    expect(JSON.stringify(await api.stocks())).toBe(before)

    await dialog.getByRole('button', { name: 'Back' }).click()
    await nameBox(page).fill('Fin')
    await nameBox(page).fill('Finance')
    await renameDialog(page).getByRole('button', { name: 'Rename' }).click()
    await expect(dialog.getByRole('button', { name: 'Merge 5 stocks' })).toBeVisible()
    await dialog.getByRole('button', { name: 'Merge 5 stocks' }).click()

    await expect(toast(page, 'Merged into Finance · 5 stocks')).toBeVisible()
    // The first answer taught the page about "Finance" (the action re-reads), so the second try asks locally, with no request.
    expect(bodies.map((b) => b.merge)).toEqual([false, true])
    expect((await api.stocks()).filter((s) => s.valueChain === 'Finance')).toHaveLength(5)
    await expect.poll(() => chainTitles(page)).toEqual(['Finance'])
  })

  test('TC-E-907: cancelling the merge leaves both chains as they were', async ({ page }) => {
    const user = await newUser('e2e-vc-stale2')
    const api = await apiAs(user)
    for (const t of ['B1', 'B2']) await api.stock(us(t, chain('Banks')))
    await openChains(page, user)
    for (const t of ['F1', 'F2']) await api.stock(us(t, chain('Finance')))

    await renameTo(page, 'Banks', 'Finance')
    await expect(page.getByRole('dialog').getByRole('heading', { name: /^Merge into/ })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(0)

    const names = (await api.stocks()).map((s) => s.valueChain).sort()
    expect(names).toEqual(['Banks', 'Banks', 'Finance', 'Finance'])
    await expect(renameButton(page, 'Banks')).toBeFocused()
  })

  test('TC-E-908: a chain renamed elsewhere is reported as gone and the page catches up on Close', async ({ page }) => {
    test.setTimeout(120_000)
    const user = await newUser('e2e-vc-gone')
    const api = await apiAs(user)
    for (const t of ['A1', 'A2', 'A3']) await api.stock(us(t, chain('Alpha')))
    await openChains(page, user)
    expect((await api.renameChain({ from: 'Alpha', to: 'Beta' })).status).toBe(200)

    await renameTo(page, 'Alpha', 'Gamma')

    const dialog = page.getByRole('dialog')
    await expect(dialog.getByText('This chain no longer exists.')).toBeVisible()
    await expect(dialog.getByText('It may have been renamed elsewhere.')).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Rename' })).toHaveCount(0)
    expect((await api.stocks()).map((s) => s.valueChain)).toEqual(['Beta', 'Beta', 'Beta'])
    await dialog.getByRole('button', { name: 'Close' }).last().click()
    await expect(dialog).toHaveCount(0)
    await expect.poll(() => chainTitles(page)).toEqual(['Beta'])
  })

  test('TC-E-909: the stocks of the chain at save time decide how many change', async ({ page }) => {
    test.setTimeout(120_000)
    const user = await newUser('e2e-vc-late')
    const api = await apiAs(user)
    const made = []
    for (const t of ['A1', 'A2', 'A3']) made.push(await api.stock(us(t, chain('Alpha'))))
    await openChains(page, user)
    // Another tab: a fourth stock joins "alpha" and one of the three leaves for "Other"
    await api.stock(us('A4', chain('alpha')))
    await api.patchStock(made[2]!.id, { valueChain: 'Other' })

    await renameButton(page, 'Alpha').click()
    await expect(renameDialog(page)).toContainText('Changes the name on 3 stocks')
    await nameBox(page).fill('Omega')
    await renameDialog(page).getByRole('button', { name: 'Rename' }).click()

    await expect(toast(page, 'Renamed to Omega · 3 stocks changed')).toBeVisible()
    const names = Object.fromEntries((await api.stocks()).map((s) => [s.ticker, s.valueChain]))
    expect(names).toEqual({ A1: 'Omega', A2: 'Omega', A3: 'Other', A4: 'Omega' })
  })

  test('TC-E-910: failures keep the dialog and the typed name, and the retry changes things once', async ({ page }) => {
    test.setTimeout(120_000)
    const seed = await seedChainsDataset()
    await openChains(page, seed.user)
    const bodies = chainPosts(page)

    await renameButton(page, 'Oil & Gas').click()
    await nameBox(page).fill('Energy')
    const submit = () => renameDialog(page).getByRole('button', { name: 'Rename' }).click()

    // (a) the connection fails
    await page.route('**/api/chains/rename', (route) => route.abort())
    await submit()
    await expect(renameDialog(page).getByRole('alert')).toContainText("Couldn't rename the chain. Try again.")
    await expect(nameBox(page)).toHaveValue('Energy')
    await expect(toast(page, 'Renamed')).toHaveCount(0)
    // (b) a server error
    await page.unroute('**/api/chains/rename')
    await page.route('**/api/chains/rename', (route) => route.fulfill({ status: 500, contentType: 'application/problem+json', body: JSON.stringify({ type: 'about:blank', title: 'x', status: 500, code: 'internal' }) }))
    await submit()
    await expect(renameDialog(page).getByRole('alert')).toContainText("Couldn't rename the chain. Try again.")
    await expect(nameBox(page)).toHaveValue('Energy')
    // (c) a problem with the name
    await page.unroute('**/api/chains/rename')
    await page.route('**/api/chains/rename', (route) =>
      route.fulfill({ status: 400, contentType: 'application/problem+json', body: JSON.stringify({ type: 'about:blank', title: 'x', status: 400, code: 'validation_failed', errors: [{ path: 'to', message: 'Server says no.' }] }) }),
    )
    await submit()
    await expect(renameDialog(page).getByText('Server says no.')).toBeVisible()
    await expect(nameBox(page)).toHaveAttribute('aria-invalid', 'true')
    await expect(toast(page, 'Renamed')).toHaveCount(0)
    expect((await seed.api.stocks()).filter((s) => s.valueChain === 'Energy')).toHaveLength(0)

    // Let it through: one change
    await page.unroute('**/api/chains/rename')
    await submit()
    await expect(toast(page, 'Renamed to Energy · 3 stocks changed')).toBeVisible()
    expect((await seed.api.stocks()).filter((s) => s.valueChain === 'Energy')).toHaveLength(3)
    expect(bodies.length).toBeGreaterThanOrEqual(1)
  })
})

test.describe('names at the limits, on a phone', () => {
  test.use({ viewport: { width: 360, height: 740 } })

  test('TC-E-911: long, emoji, markup and Thai names are saved, shown as text and never scroll the page', async ({ page }) => {
    test.setTimeout(180_000)
    const user = await newUser('e2e-vc-names')
    const api = await apiAs(user)
    const first = await api.stock(us('N1', chain('Start')))
    await api.stock(us('N2', chain('Start', 'Midstream')))
    await openChains(page, user)

    const names = ['\u{1F600}'.repeat(60), 'w'.repeat(60), '<b>x</b>', 'น้ำมันและก๊าซ', 'A&B/C?d=e#f']
    let current = 'Start'
    for (const name of names) {
      await renameTo(page, current, name)
      await expect(toast(page, 'Renamed to').first()).toBeVisible()
      const card = page.getByRole('heading', { level: 2 }).filter({ hasText: name }).first()
      await expect(card).toHaveText(name)
      await expect(page.locator('[data-sonner-toast]').filter({ hasText: name }).first()).toBeVisible()
      expect(await noHorizontalScroll(page), name).toBe(true)
      const href = (await chainCard(page, name).getByRole('link', { name: /^Stocks/ }).getAttribute('href')) as string
      expect(new URL(href, 'http://x').searchParams.getAll('valueChain')).toEqual([name])
      expect((await api.stocks()).map((s) => s.valueChain)).toEqual([name, name])
      await page.goto(`/stocks/${first.id}`)
      await expect(lens(page, 'Value chain')).toContainText(name)
      await page.goto('/chains')
      await expect(page.getByRole('heading', { level: 2 }).filter({ hasText: name }).first()).toBeVisible()
      current = name
    }

    // A 61 character paste is cut to 60
    await renameButton(page, current).click()
    await nameBox(page).fill('x'.repeat(61))
    expect(await nameBox(page).inputValue()).toHaveLength(60)
  })
})

test.describe('accounts', () => {
  test('TC-E-912: renaming a chain never touches or shows another investor', async ({ page, browser }) => {
    test.setTimeout(180_000)
    const u = await newUser('e2e-vc-u')
    const v = await newUser('e2e-vc-v')
    const apiU = await apiAs(u)
    const apiV = await apiAs(v)
    for (const t of ['UB1', 'UO1']) await apiU.stock(us(t, chain(t === 'UB1' ? 'Banks' : 'Oil & Gas')))
    for (const t of ['VB1', 'VB2', 'VB3']) await apiV.stock(us(t, chain('Banks')))
    for (const t of ['VF1', 'VF2']) await apiV.stock(us(t, chain('Finance')))
    await apiV.stock(us('VO1', chain('Oil & Gas')))
    const vBefore = await apiV.stocks()
    const ctxV = await browser.newContext({ timezoneId: ZONE })
    const pageV = await ctxV.newPage()
    await openChains(pageV, v)

    await openChains(page, u)
    await renameTo(page, 'Banks', 'Finance')

    await expect(toast(page, 'Renamed to Finance · 1 stock changed')).toBeVisible()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    expect(await chainTitles(page)).toEqual(['Finance', 'Oil & Gas'])
    await expect(chainCard(page, 'Finance')).toContainText('1 stock')
    await expect(page.getByText('VB1')).toHaveCount(0)
    expect(await apiV.stocks()).toEqual(vBefore)
    await pageV.reload()
    await expect.poll(() => chainTitles(pageV)).toEqual(['Banks', 'Finance', 'Oil & Gas'])
    await ctxV.close()
    // U cannot reach V's chain by guessing its name
    const guess = await apiU.renameChain({ from: 'Banks', to: 'Mine' })
    expect(guess.status).toBe(404) // V still has three "Banks"; U has none left
    expect(JSON.stringify(guess.body)).not.toMatch(/Mine|VB\d/)
    expect((await apiV.stocks()).map((s) => s.valueChain).sort()).toEqual(vBefore.map((s) => s.valueChain).sort())
  })

  test('TC-E-913: a signed-out visit goes to sign-in and back, and a dead session cannot rename', async ({ page }) => {
    test.setTimeout(120_000)
    const seed = await seedChainsDataset()
    await page.goto('/chains')
    await expect(page).toHaveURL(/\/auth\/sign-in\?next=%2Fchains/)
    expect(await page.content()).not.toContain('AI & Semis')

    await fillSignIn(page, seed.user.email, seed.user.password)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page).toHaveURL(/\/chains$/)
    await expect(chainCard(page, 'AI & Semis')).toBeVisible()
    const before = JSON.stringify(await seed.api.stocks())

    await page.evaluate((key) => localStorage.removeItem(key), STORAGE_KEY)
    await renameTo(page, 'AI & Semis', 'Gone')

    await expect(page).toHaveURL(/\/auth\/sign-in/, { timeout: 15_000 })
    expect(JSON.stringify(await seed.api.stocks())).toBe(before)
  })
})
