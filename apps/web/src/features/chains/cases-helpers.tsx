import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApiError } from '@/lib/api-client'
import type { Holding, ListSummary, Stock } from '@/features/stocks/types'
import { renderApp } from '@/test/render-app'
import { makeList, makeStock } from '@/test/stock-fixtures'
import { DEFAULT_SETTINGS, StubApi } from '@/test/stub-api'

export const held = (shares: string | null, cost: string | null, costCurrency: Holding['costCurrency'] = 'THB'): Holding => ({ shares, averageCost: cost, costCurrency })
export const TH = { market: 'TH', exchange: 'SET', currency: 'THB' } as const
export const RATE_SETTINGS = { ...DEFAULT_SETTINGS, usdThbRate: '36.500000' }

/** Creation times that increase with the call order, so "the earliest spelling" is the first stock made. */
let clock = 0
export const created = () => new Date(Date.UTC(2026, 0, 1) + ++clock * 1000).toISOString()

export const stockOf = (ticker: string, over: Partial<Stock> = {}): Stock => makeStock({ ticker, createdAt: created(), ...over })

/** Dataset VC-A of test-cases.md (twelve stocks, list Core = ASML, TSM, PTTEP). */
export function vcA(): Stock[] {
  const usd = (shares: string, cost: string) => held(shares, cost, 'USD')
  const core = ['ASML', 'TSM', 'PTTEP']
  const one = (ticker: string, name: string, chain: string | null, position: string | null, extra: Partial<Stock> = {}) =>
    stockOf(ticker, { name, valueChain: chain, valueChainPosition: position, listIds: core.includes(ticker) ? ['L-core'] : [], ...extra })
  return [
    one('ASML', 'ASML Holding', 'AI & Semis', 'Upstream', { holding: usd('2', '850.00') }),
    one('AMAT', 'Applied Materials', 'ai & semis', 'Upstream'),
    one('TSM', 'Taiwan Semiconductor', 'AI & Semis', 'Midstream', { holding: usd('10', '100.00') }),
    one('NVDA', 'NVIDIA Corporation', 'AI & Semis', 'Midstream', { holding: usd('5', '120.00') }),
    one('MSFT', 'Microsoft Corporation', 'AI & Semis', 'Downstream', { holding: usd('5', '300.00') }),
    one('INTC', 'Intel Corporation', 'AI & Semis', 'Integrated'),
    one('PTTEP', 'PTT Exploration', 'Oil & Gas', 'Upstream', { ...TH, holding: held('1000', '100.00') }),
    one('PTT', 'PTT Public Company', 'Oil & Gas', 'Midstream', { ...TH, holding: held(null, null) }),
    one('BCP', 'Bangchak', 'Oil & Gas', 'None', { ...TH }),
    one('AAPL', 'Apple Inc', null, null),
    one('KO', 'Coca-Cola', null, null, { holding: usd('10', '60.00') }),
    one('JNJ', 'Johnson & Johnson', null, null),
  ]
}

export const LISTS: ListSummary[] = [makeList('L-core', 'Core', 3)]

export function apiOf(stocks: Stock[], settings: unknown = RATE_SETTINGS, lists: ListSummary[] = LISTS): StubApi {
  return new StubApi({ 'GET /stocks': { items: stocks }, 'GET /lists': { items: lists }, 'GET /settings': settings })
}

export async function openChains(path: string, stub: StubApi) {
  const view = renderApp(path, stub)
  await screen.findByRole('heading', { level: 1, name: 'Value chains' }, { timeout: 8000 })
  return { ...view, stub }
}

export const chainRegion = (name: string | RegExp) => screen.getByRole('region', { name })
export const laneOf = (chain: HTMLElement, name: string | RegExp) => within(chain).getByRole('region', { name })
/** The h2 titles of the chains on screen, in order. */
export const chainTitles = () => screen.queryAllByRole('heading', { level: 2 }).map((h) => h.textContent)

/** The entry link of a stock by ticker (its href is `/stocks/s-<ticker>` with `makeStock` ids). */
export const entryLink = (ticker: string): HTMLElement => {
  const link = document.querySelector<HTMLElement>(`main a[href="/stocks/s-${ticker}"], section a[href="/stocks/s-${ticker}"]`)
  if (!link) throw new Error(`no entry for ${ticker}`)
  return link
}

/**
 * A stub that behaves like `POST /chains/rename`: it rewrites its own stocks (rows of the chain, or of the
 * target too when `merge` is true) and answers 200, 404 or 409 as the API does, so later reads show the result.
 */
export function serverApi(initial: Stock[], settings: unknown = RATE_SETTINGS, lists: ListSummary[] = LISTS) {
  let rows = initial.map((s) => ({ ...s }))
  const stub = new StubApi({ 'GET /lists': { items: lists }, 'GET /settings': settings })
  stub.on('GET /stocks', () => ({ items: rows.map((s) => ({ ...s })) }))
  stub.on('POST /chains/rename', (request: { body: unknown }) => {
    const { from, to, merge } = request.body as { from: string; to: string; merge: boolean }
    const key = (n: string | null) => (n ?? '').trim().toLocaleLowerCase('en')
    const members = rows.filter((r) => r.valueChain !== null && key(r.valueChain) === key(from))
    if (members.length === 0) throw new ApiError(404, { code: 'chain_not_found' })
    const others = key(to) === key(from) ? [] : rows.filter((r) => r.valueChain !== null && key(r.valueChain) === key(to))
    if (others.length > 0 && !merge) throw new ApiError(409, { code: 'chain_exists', existingName: others[0]?.valueChain, existingCount: others.length })
    const touched = new Set([...members, ...others].filter((r) => r.valueChain !== to.trim()).map((r) => r.id))
    rows = rows.map((r) => (touched.has(r.id) ? { ...r, valueChain: to.trim() } : r))
    return { name: to.trim(), changed: touched.size, merged: others.length > 0 }
  })
  return Object.assign(stub, { rows: () => rows, setRows: (next: Stock[]) => (rows = next) })
}

/** Stocks of one chain, all Upstream, with tickers `<prefix>1..n`. */
export const inChain = (name: string, prefix: string, n: number, extra: Partial<Stock> = {}) =>
  Array.from({ length: n }, (_, i) => stockOf(`${prefix}${i + 1}`, { valueChain: name, valueChainPosition: 'Upstream', ...extra }))

export const renameButtonOf = (chainTitle: string) => within(chainRegion(chainTitle)).getByRole('button', { name: /Rename/ })
export async function openRenameOf(chainTitle: string) {
  await userEvent.click(renameButtonOf(chainTitle))
  return screen.findByRole('dialog')
}
export async function typeName(dialog: HTMLElement, text: string) {
  const input = within(dialog).getByRole('textbox', { name: 'Chain name' })
  await userEvent.clear(input)
  if (text) await userEvent.type(input, text)
  return input
}
