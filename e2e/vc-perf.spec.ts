import { expect, test, type Page, type Request } from '@playwright/test'
import { openSheet, closeSheet, pick, searchBox } from './lib/sfe.ts'
import { openSignedIn, settled } from './lib/sl.ts'
import { chainCard, chainTitles, pickScope, renameButton, renameDialog, nameBox, seedBigChains, tickersInView, ZONE } from './lib/vc.ts'

test.use({ timezoneId: ZONE })

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] as number

/**
 * Arms an in-page stopwatch: it starts at the next pointer or key event and stops when the page lists
 * `expected` stock entries. Returns a function that reads the elapsed milliseconds once the page got there.
 */
async function arm(page: Page, expected: number) {
  await page.evaluate((count) => {
    const w = window as unknown as { __elapsed: Promise<number> }
    w.__elapsed = new Promise<number>((resolve) => {
      let t0 = 0
      const start = () => {
        if (t0 === 0) t0 = performance.now()
      }
      for (const type of ['pointerdown', 'keydown', 'input']) document.addEventListener(type, start, { capture: true, once: true })
      const entries = () => [...document.querySelectorAll('section ul a[href^="/stocks/"]')].filter((a) => !(a.getAttribute('href') ?? '').endsWith('/edit')).length
      const done = () => {
        if (t0 !== 0 && entries() === count) {
          observer.disconnect()
          requestAnimationFrame(() => resolve(performance.now() - t0))
        }
      }
      const observer = new MutationObserver(done)
      observer.observe(document.body, { childList: true, subtree: true })
    })
  }, expected)
  return () => page.evaluate(() => (window as unknown as { __elapsed: Promise<number> }).__elapsed)
}

test('TC-E-923: 200 stocks in 20 chains regroup in under 200 ms with no request, and a rename of 200 stocks answers fast', async ({ page }) => {
  test.setTimeout(420_000)
  const { user, api } = await seedBigChains()
  await openSignedIn(page, user, '/chains')
  await expect(page.getByRole('heading', { level: 1, name: 'Value chains' })).toBeVisible()
  await settled(page)
  await expect.poll(async () => (await tickersInView(page)).length).toBe(200)
  const requests: Request[] = []
  page.on('request', (r) => new URL(r.url()).pathname.startsWith('/api/') && requests.push(r))

  const all = await api.stocks()
  const searched = all.filter((s) => `${s.ticker} ${s.name}`.toLowerCase().includes('1')).length
  const upstream = all.filter((s) => s.valueChainPosition === 'Upstream').length
  const times: Record<string, number[]> = { scope: [], filter: [], search: [] }
  for (let i = 0; i < 5; i++) {
    let read = await arm(page, 100)
    await pickScope(page, /^Held stocks/)
    times.scope!.push(await read())
    read = await arm(page, 200)
    await pickScope(page, /^All stocks/)
    await read()

    await openSheet(page)
    read = await arm(page, upstream)
    await pick(page, 'Value chain position', /^Upstream, /)
    times.filter!.push(await read())
    read = await arm(page, 200)
    await page.getByRole('checkbox', { name: /^Upstream, / }).click()
    await read()
    await closeSheet(page)

    read = await arm(page, searched)
    await searchBox(page).focus()
    await page.keyboard.type('1')
    times.search!.push(await read())
    read = await arm(page, 200)
    await page.keyboard.press('Backspace')
    await read()
  }
  console.log(`TC-E-923 regroup of 200 stocks in 20 chains (browser): ${Object.entries(times).map(([k, v]) => `${k} median ${median(v).toFixed(1)} ms (max ${Math.max(...v).toFixed(1)})`).join(', ')}`)
  for (const [name, samples] of Object.entries(times)) expect(median(samples), name).toBeLessThan(200)
  expect(requests.map((r) => r.url())).toEqual([])

  // Rename: one chain of 10, then all 200 into one name by merging, never reloading the page
  await page.evaluate(() => ((window as unknown as { __kept: boolean }).__kept = true))
  const pending: Promise<number>[] = []
  page.on('response', (r) => {
    // `timing()` is only complete once the body has arrived
    if (r.url().endsWith('/api/chains/rename')) pending.push(r.finished().then(() => r.request().timing().responseEnd))
  })
  const rename = async (from: string, to: string, merge: boolean) => {
    await renameButton(page, from).click()
    await nameBox(page).fill(to)
    await renameDialog(page).getByRole('button', { name: 'Rename' }).click()
    if (merge) await page.getByRole('dialog').getByRole('button', { name: /^Merge \d+ stocks$/ }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
  }
  await rename('Chain 01', 'First chain', false)
  await expect(chainCard(page, 'First chain')).toBeVisible()
  for (let i = 2; i <= 20; i++) await rename(`Chain ${String(i).padStart(2, '0')}`, 'First chain', true)
  await expect.poll(() => chainTitles(page)).toEqual(['First chain'])
  await expect(chainCard(page, 'First chain')).toContainText('200 stocks')
  const answered = await Promise.all(pending)
  console.log(`TC-E-923 rename requests (browser response end): ${answered.map((a) => a.toFixed(0)).join(', ')} ms; median ${median(answered).toFixed(0)} ms`)
  expect(answered.length).toBe(20)
  for (const ms of answered) expect(ms).toBeLessThan(1000)
  for (const ms of answered) expect(ms).toBeGreaterThan(0)
  expect(await page.evaluate(() => (window as unknown as { __kept?: boolean }).__kept)).toBe(true)
  expect((await api.stocks()).every((s) => s.valueChain === 'First chain')).toBe(true)
})
