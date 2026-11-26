import { expect, type Locator, type Page } from '@playwright/test'
import { apiAs, newUser, openSignedIn, settled, th, us, type Api, type SavedList, type SavedStock, type TestUser } from './sl.ts'

export const ZONE = 'Asia/Bangkok'

export type VcSeed = {
  user: TestUser
  api: Api
  core: SavedList
  stocks: Record<string, SavedStock>
}

export type VcOptions = {
  /** Saved rate, THB per USD (dataset VC-A has 36.500000). `null` saves none. */
  rate?: string | null
  /** MSFT is a Thai-market stock (still held in USD), so one AI & Semis stock is outside a Market = US filter. */
  msftTh?: boolean
  /** Extra stocks named "AI & Semis" and "AI semis" (TC-E-906). */
  extraSemis?: number
  extraAiSemis?: number
}

const usd = (shares: string, cost: string) => ({ holding: { shares, averageCost: cost, costCurrency: 'USD' } })
const thb = (shares: string | null, cost: string | null) => ({ holding: { shares, averageCost: cost, costCurrency: 'THB' } })

/**
 * Dataset VC-A of test-cases.md through the real API, in creation order (so the earliest spelling of a chain is
 * the first stock made): twelve stocks in two chains and three without one, list Core = {ASML, TSM, PTTEP}.
 * Seven stocks are held (PTT without amounts), and the saved rate is 36.500000.
 */
export async function seedChainsDataset(opts: VcOptions = {}, user?: TestUser): Promise<VcSeed> {
  const owner = user ?? (await newUser('e2e-vc'))
  const api = await apiAs(owner)
  const stocks: Record<string, SavedStock> = {}
  const save = async (key: string, body: Record<string, unknown>) => (stocks[key] = await api.stock(body))
  const chain = (valueChain: string, valueChainPosition: string) => ({ valueChain, valueChainPosition })
  await save('ASML', us('ASML', { name: 'ASML Holding', ...chain('AI & Semis', 'Upstream'), ...usd('2', '850.00') }))
  await save('AMAT', us('AMAT', { name: 'Applied Materials', ...chain('ai & semis', 'Upstream') }))
  await save('TSM', us('TSM', { name: 'Taiwan Semiconductor', exchange: 'NYSE', ...chain('AI & Semis', 'Midstream'), ...usd('10', '100.00') }))
  await save('NVDA', us('NVDA', { name: 'NVIDIA Corporation', ...chain('AI & Semis', 'Midstream'), ...usd('5', '120.00') }))
  await save('MSFT', (opts.msftTh ? th : us)('MSFT', { name: 'Microsoft Corporation', ...chain('AI & Semis', 'Downstream'), ...usd('5', '300.00') }))
  await save('INTC', us('INTC', { name: 'Intel Corporation', ...chain('AI & Semis', 'Integrated') }))
  await save('PTTEP', th('PTTEP', { name: 'PTT Exploration', ...chain('Oil & Gas', 'Upstream'), ...thb('1000', '100.00') }))
  await save('PTT', th('PTT', { name: 'PTT Public Company', ...chain('Oil & Gas', 'Midstream'), ...thb(null, null) }))
  await save('BCP', th('BCP', { name: 'Bangchak', ...chain('Oil & Gas', 'None') }))
  await save('AAPL', us('AAPL', { name: 'Apple Inc' }))
  await save('KO', us('KO', { name: 'Coca-Cola', ...usd('10', '60.00') }))
  await save('JNJ', us('JNJ', { name: 'Johnson & Johnson' }))
  for (let i = 1; i <= (opts.extraSemis ?? 0); i++) await save(`SEMI${i}`, us(`SEMI${i}`, { name: `Semi ${i}`, ...chain('AI & Semis', 'Downstream') }))
  for (let i = 1; i <= (opts.extraAiSemis ?? 0); i++) await save(`OLD${i}`, us(`OLD${i}`, { name: `Old ${i}`, ...chain('AI semis', 'Upstream') }))
  const core = await api.list('Core')
  for (const t of ['ASML', 'TSM', 'PTTEP']) await api.addToList(core.id, (stocks[t] as SavedStock).id)
  if (opts.rate !== null) await api.saveSettings({ usdThbRate: opts.rate ?? '36.500000' })
  return { user: owner, api, core, stocks }
}

/** Dataset VC-C: 200 stocks in 20 chains of 10 ("Chain 01".."Chain 20", three lanes), 100 of them held (THB). */
export async function seedBigChains(user?: TestUser): Promise<{ user: TestUser; api: Api }> {
  const owner = user ?? (await newUser('e2e-vc-big'))
  const api = await apiAs(owner)
  const positions = ['Upstream', 'Midstream', 'Downstream']
  const bodies = Array.from({ length: 200 }, (_, i) =>
    th(`C${String(i).padStart(3, '0')}`, {
      name: `Company ${i}`,
      valueChain: `Chain ${String(Math.floor(i / 10) + 1).padStart(2, '0')}`,
      valueChainPosition: positions[i % 3],
      ...(i % 2 === 0 ? thb('10', `${i + 1}.50`) : {}),
    }),
  )
  for (let i = 0; i < bodies.length; i += 20) await Promise.all(bodies.slice(i, i + 20).map((b) => api.stock(b)))
  return { user: owner, api }
}

export async function openChains(page: Page, user: TestUser, query = '') {
  await openSignedIn(page, user, `/chains${query}`)
  await expect(page.getByRole('heading', { level: 1, name: 'Value chains' })).toBeVisible()
  await settled(page)
}

// ---- locators ------------------------------------------------------------------------------

/** A chain's card by its exact title (a string is matched whole, case and all; a pattern as given). */
export const chainCard = (page: Page, title: string | RegExp): Locator =>
  page.getByRole('region', typeof title === 'string' ? { name: title, exact: true } : { name: title }).first()
export const laneIn = (card: Locator, name: string | RegExp): Locator => card.getByRole('region', { name })
export const chainTitles = async (page: Page) => (await page.locator('main h2, section h2').allTextContents()).map((t) => t.trim())
export const renameButton = (page: Page, title: string) => chainCard(page, title).getByRole('button', { name: 'Rename' })
export const renameDialog = (page: Page) => page.getByRole('dialog', { name: 'Rename chain' })
export const nameBox = (page: Page) => renameDialog(page).getByRole('textbox', { name: 'Chain name' })
export const mergeDialog = (page: Page) => page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: /^Merge into/ }) })

/** The one-line summary under a chain title ("6 stocks · 4 held · ฿175,200.00"). */
export const chainSummary = (card: Locator) => card.locator('[data-slot="card-description"]').first()

/** Opens Rename on a chain, types the new name (the field is selected) and presses Rename. Returns the dialog. */
export async function renameTo(page: Page, from: string, to: string, opts: { submit?: boolean } = {}) {
  await renameButton(page, from).click()
  await expect(renameDialog(page)).toBeVisible()
  await nameBox(page).fill(to)
  if (opts.submit !== false) await renameDialog(page).getByRole('button', { name: 'Rename' }).click()
  return renameDialog(page)
}

export const tickersInView = async (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('main ul a[href^="/stocks/"], section ul a[href^="/stocks/"]')]
      .filter((a) => !(a.getAttribute('href') ?? '').endsWith('/edit'))
      .map((a) => (a.firstElementChild?.textContent ?? '').trim()),
  )

/** The accessible text of a chain's lane as `Upstream: ASML, AMAT`. */
export async function laneTickers(card: Locator, lane: string): Promise<string[]> {
  return laneIn(card, lane).locator('ul > li > a').evaluateAll((as) => as.map((a) => (a.firstElementChild?.textContent ?? '').trim()))
}

// ---- Scope select and filters (the same controls as /concentration) -------------------------

export const scopeBox = (page: Page) => page.getByRole('combobox', { name: 'Scope' })
export async function pickScope(page: Page, option: string | RegExp) {
  await scopeBox(page).click()
  await page.getByRole('option', { name: option }).click()
}

export const VC_COUNT = { chains: 2, stocks: 12, held: 7 } as const
