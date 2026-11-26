import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Holding, Stock } from '@/features/stocks/types'
import { renderApp } from '@/test/render-app'
import { makeList, makeStock } from '@/test/stock-fixtures'
import { DEFAULT_SETTINGS, StubApi, emptyApi } from '@/test/stub-api'

vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }), Toaster: () => null }))

const held = (shares: string | null, cost: string | null, costCurrency: Holding['costCurrency'] = 'THB'): Holding => ({
  shares,
  averageCost: cost,
  costCurrency,
})
const th = { market: 'TH', exchange: 'SET', currency: 'THB' } as const

const lists = [makeList('L1', 'Core', 2)]

function api(stocks: Stock[], settings: unknown = DEFAULT_SETTINGS) {
  return new StubApi({ 'GET /stocks': { items: stocks }, 'GET /lists': { items: lists }, 'GET /settings': settings })
}

const open = async (path: string, stub: StubApi) => {
  const view = renderApp(path, stub)
  await screen.findByRole('heading', { level: 1, name: 'Value chains' }, { timeout: 8000 })
  return { ...view, stub }
}
const chain = (name: string) => screen.getByRole('region', { name })
const lane = (within_: HTMLElement, name: string) => within(within_).getByRole('region', { name })

describe('value chains page', () => {
  it('TC-U-927: chains render in order with their lanes and stocks', async () => {
    await open(
      '/chains',
      api([
        makeStock({ ticker: 'ASML', valueChain: 'AI & Semis', valueChainPosition: 'Upstream' }),
        makeStock({ ticker: 'TSM', valueChain: 'AI & Semis', valueChainPosition: 'Midstream', holding: held('10.0000', '100.0000') }),
        makeStock({ ticker: 'MSFT', valueChain: 'AI & Semis', valueChainPosition: 'Downstream' }),
        makeStock({ ticker: 'PTT', ...th, valueChain: 'Oil & Gas', valueChainPosition: 'Upstream' }),
      ]),
    )
    const names = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)
    expect(names).toEqual(['AI & Semis', 'Oil & Gas'])
    const ai = chain('AI & Semis')
    expect(within(lane(ai, 'Upstream')).getAllByRole('listitem')).toHaveLength(1)
    const mid = within(lane(ai, 'Midstream')).getByRole('link', { name: /^TSM/ })
    expect(mid).toHaveTextContent('Held')
    expect(mid).toHaveAttribute('href', '/stocks/s-TSM')
    expect(within(lane(ai, 'Upstream')).getByRole('link', { name: /^ASML/ })).not.toHaveTextContent('Held')
    expect(within(lane(ai, 'Downstream')).getByRole('link', { name: /^MSFT/ })).toHaveAttribute('href', '/stocks/s-MSFT')
    expect(within(chain('Oil & Gas')).getByRole('link', { name: /^PTT/ })).toBeInTheDocument()
  })

  it('TC-U-928: Integrated and No position appear only when used; empty lanes say so', async () => {
    await open(
      '/chains',
      api([
        makeStock({ ticker: 'INTC', valueChain: 'Chips', valueChainPosition: 'Integrated' }),
        makeStock({ ticker: 'BCP', valueChain: 'Chips', valueChainPosition: 'None' }),
        makeStock({ ticker: 'UP', valueChain: 'Chips', valueChainPosition: 'Upstream' }),
        makeStock({ ticker: 'ONLY', valueChain: 'Simple', valueChainPosition: 'Upstream' }),
      ]),
    )
    const chips = chain('Chips')
    expect(within(lane(chips, 'Integrated (spans every stage)')).getByRole('link', { name: /^INTC/ })).toBeInTheDocument()
    const none = lane(chips, 'No position')
    expect(within(none).getByRole('link', { name: /^BCP/ })).toBeInTheDocument()
    expect(within(none).getByRole('link', { name: 'Set position of BCP' })).toHaveAttribute('href', '/stocks/s-BCP/edit')
    expect(within(lane(chips, 'Midstream')).getByText('No stocks')).toBeInTheDocument()
    expect(within(chain('Simple')).queryByRole('region', { name: 'No position' })).toBeNull()
    expect(within(chain('Simple')).queryByRole('region', { name: /Integrated/ })).toBeNull()
    expect(screen.queryAllByRole('link', { name: /Set position/ })).toHaveLength(1)
  })

  it('TC-U-929: lane counts and values are shown as text', async () => {
    await open(
      '/chains',
      api([
        makeStock({ ticker: 'TSM', valueChain: 'AI', valueChainPosition: 'Midstream', holding: held('10.0000', '100.0000') }),
        makeStock({ ticker: 'NVDA', valueChain: 'AI', valueChainPosition: 'Midstream' }),
        makeStock({ ticker: 'NONE', valueChain: 'Plain', valueChainPosition: 'Upstream' }),
      ]),
    )
    const mid = lane(chain('AI'), 'Midstream')
    expect(within(mid).getByText('2 stocks · 1 held · ฿1,000.00 · 100.0%')).toBeInTheDocument()
    expect(within(mid).getByRole('link', { name: /^TSM/ })).toHaveTextContent('฿1,000.00')
    expect(within(chain('AI')).getByText('2 stocks · 1 held · ฿1,000.00')).toBeInTheDocument()
    // Nothing held: no value, no share, never the domain's 0.00.
    expect(within(chain('Plain')).getAllByText('1 stock · none held')).toHaveLength(2)
    expect(screen.queryByText(/฿0\.00/)).toBeNull()
  })

  it('TC-U-930: scope and filters narrow the chains without a request', async () => {
    const stub = api([
      makeStock({ ticker: 'A', ...th, valueChain: 'Held chain', valueChainPosition: 'Upstream', holding: held('1.0000', '1.0000') }),
      makeStock({ ticker: 'B', valueChain: 'Held chain', valueChainPosition: 'Upstream', holding: held('1.0000', '1.0000', 'USD') }),
      makeStock({ ticker: 'C', ...th, valueChain: 'Other chain', valueChainPosition: 'Upstream' }),
    ])
    const { router } = await open('/chains', stub)
    const baseline = stub.calls.length
    expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(2)

    await userEvent.click(screen.getByRole('combobox', { name: 'Scope' }))
    await userEvent.click(await screen.findByRole('option', { name: /^Held stocks/ }))
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Other chain' })).toBeNull())

    await userEvent.click(screen.getByRole('button', { name: 'Filters' }))
    const dialog = await screen.findByRole('dialog', { name: 'Filters' })
    await userEvent.click(within(dialog).getByRole('checkbox', { name: /^TH, / }))
    await waitFor(() => expect(router.state.location.search).toBe('?scope=held&market=TH'))
    expect(router.state.historyAction).toBe('REPLACE')
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(within(chain('Held chain')).queryByRole('link', { name: /^B/ })).toBeNull())
    expect(within(chain('Held chain')).getByRole('link', { name: /^A/ })).toBeInTheDocument()
    expect(stub.calls.length).toBe(baseline)
  })

  it('TC-U-931: stocks without a chain are counted and linked by scope', async () => {
    const stocks = [
      makeStock({ ticker: 'IN', valueChain: 'X', valueChainPosition: 'Upstream', listIds: ['L1'], holding: held('1.0000', '1.0000') }),
      ...['N1', 'N2', 'N3', 'N4'].map((t) => makeStock({ ticker: t, listIds: ['L1'], holding: held('1.0000', '1.0000') })),
    ]
    const href = () => screen.getByRole('link', { name: 'Show them' }).getAttribute('href')
    const first = await open('/chains', api(stocks))
    expect(screen.getByText('4 stocks in view have no value chain.')).toBeInTheDocument()
    expect(href()).toBe('/stocks?valueChain=')
    first.unmount()
    const second = await open('/chains?scope=L1', api(stocks))
    expect(href()).toBe('/lists/L1?valueChain=')
    second.unmount()
    await open('/chains?scope=held', api(stocks))
    expect(href()).toBe('/stocks?held=yes&valueChain=')
  })

  it('TC-U-931: a single stock reads in the singular', async () => {
    await open('/chains', api([makeStock({ ticker: 'IN', valueChain: 'X' }), makeStock({ ticker: 'NO' })]))
    expect(screen.getByText('1 stock in view has no value chain.')).toBeInTheDocument()
  })

  it('TC-U-932: chain and concentration links carry scope and filters', async () => {
    await open(
      '/chains?scope=held&market=TH&valueChain=Old',
      api([makeStock({ ticker: 'A', ...th, valueChain: 'AI & Semis', valueChainPosition: 'Upstream', holding: held('1.0000', '1.0000') })]),
    )
    // The old value-chain pick hides the stock; clear it by address for the link read.
    expect(screen.queryByRole('region', { name: 'AI & Semis' })).toBeNull()
    expect(screen.getByRole('link', { name: 'See concentration' })).toHaveAttribute(
      'href',
      '/concentration?scope=held&lens=valueChain&measure=count&market=TH&valueChain=Old',
    )
  })

  it('TC-U-932: the chain link replaces value-chain picks and keeps the rest', async () => {
    await open(
      '/chains?scope=held&market=TH',
      api([makeStock({ ticker: 'A', ...th, valueChain: 'AI & Semis', valueChainPosition: 'Upstream', holding: held('1.0000', '1.0000') })]),
    )
    const stocksLink = within(chain('AI & Semis')).getByRole('link', { name: /^Stocks/ })
    const url = new URL(stocksLink.getAttribute('href') as string, 'http://x')
    expect(url.pathname).toBe('/stocks')
    expect(url.search).toBe(`?${new URLSearchParams([['market', 'TH'], ['held', 'yes'], ['valueChain', 'AI & Semis']])}`)
    expect(screen.getByRole('link', { name: 'See concentration' })).toHaveAttribute(
      'href',
      '/concentration?scope=held&lens=valueChain&measure=count&market=TH',
    )
  })

  it('TC-U-933: empty states', async () => {
    const none = await open('/chains', emptyApi())
    expect(screen.getByRole('heading', { name: 'No value chains yet' })).toBeInTheDocument()
    const main = within(screen.getByRole('heading', { name: 'No value chains yet' }).closest('[data-slot="card"]') as HTMLElement)
    expect(main.getByRole('link', { name: /Add stock/ })).toHaveAttribute('href', '/stocks/new')
    expect(main.getByRole('link', { name: /Import/ })).toHaveAttribute('href', '/import-export')
    none.unmount()

    const noChain = await open('/chains', api([makeStock({ ticker: 'A' }), makeStock({ ticker: 'B' })]))
    expect(screen.getByRole('heading', { name: 'No value chains in this view' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Show the 2 stocks with no chain' })).toHaveAttribute('href', '/stocks?valueChain=')
    noChain.unmount()

    await open('/chains?q=zzzz', api([makeStock({ ticker: 'A', valueChain: 'X' }), makeStock({ ticker: 'B' })]))
    expect(screen.getByText('0 of 2 stocks')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Clear all' }).length).toBeGreaterThan(0)
    expect(screen.queryByRole('heading', { level: 2 })).toBeNull()
  })

  it('TC-U-934: rate and left-out notes', async () => {
    await open(
      '/chains',
      api([
        makeStock({ ticker: 'USD', valueChain: 'X', valueChainPosition: 'Upstream', holding: held('1.0000', '10.0000', 'USD') }),
        makeStock({ ticker: 'NOSH', valueChain: 'X', valueChainPosition: 'Upstream', holding: held(null, null) }),
      ]),
    )
    const note = screen.getByText('USD holdings are left out of values until you save a rate.').closest('[role="status"]') as HTMLElement
    expect(within(note).getByRole('link')).toHaveAttribute('href', '/concentration')
    expect(
      within(chain('X')).getByText('1 held stock has no shares or cost, 1 needs a rate, and they are left out of the value.'),
    ).toBeInTheDocument()
  })

  it('TC-U-934: only no amounts, no rate note', async () => {
    await open(
      '/chains',
      api([makeStock({ ticker: 'NOSH', valueChain: 'X', valueChainPosition: 'Upstream', holding: held(null, null) })]),
    )
    expect(screen.queryByText(/USD holdings are left out/)).toBeNull()
    expect(within(chain('X')).getByText('1 held stock has no shares or cost and is left out of the value.')).toBeInTheDocument()
  })

  it('TC-U-935: several spellings are named under the title', async () => {
    await open(
      '/chains',
      api([
        makeStock({ ticker: 'A', valueChain: 'AI & Semis', createdAt: '2026-11-01T00:00:00.000Z' }),
        makeStock({ ticker: 'B', valueChain: 'ai & semis', createdAt: '2026-11-02T00:00:00.000Z' }),
        makeStock({ ticker: 'C', valueChain: 'Solo' }),
      ]),
    )
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual(['AI & Semis', 'Solo'])
    expect(within(chain('AI & Semis')).getByText('Also spelled: ai & semis')).toBeInTheDocument()
    expect(within(chain('Solo')).queryByText(/Also spelled/)).toBeNull()
  })

  it('TC-U-936: a bad scope falls back with a note and keeps the address', async () => {
    const { router } = await open('/chains?scope=missing', api([makeStock({ ticker: 'A', valueChain: 'X' })]))
    expect(screen.getByText('That list no longer exists. Showing all stocks.')).toBeInTheDocument()
    expect(router.state.location.search).toBe('?scope=missing')
    expect(screen.getByRole('combobox', { name: 'Scope' })).toHaveTextContent('All stocks (1)')
  })

  it('TC-U-937: regrouping 200 stocks in 20 chains is fast', async () => {
    const many = Array.from({ length: 200 }, (_, i) =>
      makeStock({
        ticker: `T${i}`,
        valueChain: `Chain ${i % 20}`,
        valueChainPosition: ['Upstream', 'Midstream', 'Downstream', 'Integrated'][i % 4] as string,
        holding: i % 2 === 0 ? held('10.0000', `${i + 1}.5000`) : null,
        listIds: i % 7 === 0 ? ['L1'] : [],
      }),
    )
    const { router, stub } = await open('/chains', api(many))
    const baseline = stub.calls.length
    const samples: number[] = []
    for (let i = 0; i < 12; i++) {
      const scope = ['held', 'L1', 'all'][i % 3] as string
      const t0 = performance.now()
      await act(async () => {
        await router.navigate(`/chains?scope=${scope}`, { replace: true })
      })
      samples.push(performance.now() - t0)
    }
    samples.sort((a, b) => a - b)
    const p95 = samples[Math.floor(samples.length * 0.95) - 1] as number
    console.info(`TC-U-937 regroup p95 ${p95.toFixed(1)} ms`)
    expect(p95).toBeLessThan(200)
    expect(stub.calls.length).toBe(baseline)
  })
})
