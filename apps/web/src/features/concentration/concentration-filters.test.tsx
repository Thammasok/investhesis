import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Stock } from '@/features/stocks/types'
import { renderApp } from '@/test/render-app'
import { makeList, makeStock } from '@/test/stock-fixtures'
import { DEFAULT_SETTINGS, StubApi } from '@/test/stub-api'

vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }), Toaster: () => null }))

const th = { market: 'TH', exchange: 'SET', currency: 'THB' } as const
const held = { shares: '10.0000', averageCost: '10.0000', costCurrency: 'THB' } as const

/** 10 stocks: 6 TH (4 Energy, 2 Financials) and 4 US Information Technology. */
function ten(): Stock[] {
  return [
    ...['PTT', 'PTTEP', 'PTTGC', 'BANPU'].map((ticker) => makeStock({ ticker, ...th, gicsSector: 'Energy' })),
    ...['KBANK', 'SCB'].map((ticker) => makeStock({ ticker, ...th, gicsSector: 'Financials' })),
    ...['NVDA', 'MSFT', 'AAPL', 'ORCL'].map((ticker) => makeStock({ ticker, gicsSector: 'Information Technology' })),
  ]
}
const lists = [makeList('L1', 'Core', 2)]
const apiFor = (stocks: Stock[]) =>
  new StubApi({ 'GET /stocks': { items: stocks }, 'GET /lists': { items: lists }, 'GET /settings': DEFAULT_SETTINGS })

const open = async (path: string, stocks: Stock[] = ten()) => {
  const stub = apiFor(stocks)
  const view = renderApp(path, stub)
  await screen.findByRole('heading', { level: 1, name: 'Concentration' }, { timeout: 8000 })
  return { ...view, stub }
}
const rowFor = (label: string) => screen.getByRole('button', { name: `Show stocks in ${label}` }).closest('tr') as HTMLElement
// The result line; the flag summary on this page is a status region too.
const status = () => screen.getByText(/ stocks? in scope$/)

describe('concentration with search and filters', () => {
  it('TC-U-620 groups only the filtered stocks and counts them against the scope', async () => {
    await open('/concentration?scope=all&lens=gicsSector&measure=count&market=TH')
    await waitFor(() => expect(status()).toHaveTextContent('6 of 10 stocks in scope'))
    const energy = rowFor('Energy')
    expect(within(energy).getByText('4')).toBeInTheDocument()
    expect(within(energy).getByText('66.7%')).toBeInTheDocument()
    expect(energy).toHaveTextContent('Over 40%')
    expect(within(rowFor('Financials')).getByText('33.3%')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Show stocks in Information Technology' })).not.toBeInTheDocument()
  })

  it('an unfiltered view reads "N stocks in scope"', async () => {
    await open('/concentration')
    expect(status()).toHaveTextContent('10 stocks in scope')
    expect(status()).not.toHaveTextContent(' of ')
  })

  it('TC-U-622 changing the grouping keeps the filters in the address', async () => {
    const { router } = await open('/concentration?scope=all&lens=gicsSector&measure=count&market=TH')
    await userEvent.click(screen.getByRole('combobox', { name: 'Group by' }))
    await userEvent.click(await screen.findByRole('option', { name: 'Economic cycle' }))
    await waitFor(() => expect(router.state.location.search).toBe('?scope=all&lens=economicCycle&measure=count&market=TH'))
    expect(status()).toHaveTextContent('6 of 10 stocks in scope')
  })

  it('picking a filter keeps scope, lens and measure and regroups with no API request', async () => {
    const { router, stub } = await open('/concentration?scope=all&lens=style&measure=count')
    const before = stub.calls.length
    await userEvent.click(screen.getByRole('button', { name: 'Filters' }))
    const dialog = await screen.findByRole('dialog', { name: 'Filters' })
    await userEvent.click(within(dialog).getByRole('checkbox', { name: /^US, / }))
    await waitFor(() => expect(router.state.location.search).toBe('?scope=all&lens=style&measure=count&market=US'))
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(status()).toHaveTextContent('4 of 10 stocks in scope'))
    expect(stub.calls.length).toBe(before)
  })

  it('TC-U-623 filters that leave nothing show the no-match card, not the summary', async () => {
    const stocks = [
      makeStock({ ticker: 'NVDA', holding: held }),
      makeStock({ ticker: 'MSFT', holding: held }),
      makeStock({ ticker: 'AAPL', holding: held }),
      makeStock({ ticker: 'PTT', ...th }),
    ]
    await open('/concentration?scope=held&lens=gicsSector&measure=count&market=TH', stocks)
    await waitFor(() => expect(status()).toHaveTextContent('0 of 3 stocks in scope'))
    expect(screen.getByRole('heading', { level: 2, name: 'No stocks match' })).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(screen.queryByText(/group at/i)).not.toBeInTheDocument()
  })

  it('counts the filter options over the scope, not over every stock', async () => {
    const stocks = [
      makeStock({ ticker: 'A', ...th, listIds: ['L1'] }),
      makeStock({ ticker: 'B', listIds: ['L1'] }),
      makeStock({ ticker: 'C', ...th }),
      makeStock({ ticker: 'D', ...th }),
    ]
    await open('/concentration?scope=L1', stocks)
    await userEvent.click(screen.getByRole('button', { name: 'Filters' }))
    const dialog = await screen.findByRole('dialog', { name: 'Filters' })
    expect(within(dialog).getByRole('checkbox', { name: 'TH, 1 stock' })).toBeInTheDocument()
    expect(within(dialog).getByRole('checkbox', { name: 'US, 1 stock' })).toBeInTheDocument()
  })

  it('a list scope with no stocks keeps its card and shows no toolbar', async () => {
    await open('/concentration?scope=L1', [makeStock({ ticker: 'A' })])
    expect(await screen.findByText('Core has no stocks yet.')).toBeInTheDocument()
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument()
  })

  const valued = () => [
    makeStock({ ticker: 'PTT', ...th, gicsSector: 'Energy', holding: { shares: '100.0000', averageCost: '10.0000', costCurrency: 'THB' } }),
    makeStock({ ticker: 'KBANK', ...th, gicsSector: 'Financials', holding: { shares: '100.0000', averageCost: '30.0000', costCurrency: 'THB' } }),
    makeStock({ ticker: 'NVDA', gicsSector: 'Information Technology', holding: { shares: '1.0000', averageCost: '100.0000', costCurrency: 'USD' } }),
  ]

  it('names a USD holding that cannot be valued while it is in the filtered set', async () => {
    // No exchange rate is saved, so the USD holding is left out of the value shares and named in the note.
    await open('/concentration?scope=all&lens=gicsSector&measure=value', valued())
    expect(screen.getAllByText(/NVDA/).length).toBeGreaterThan(0)
  })

  it('value shares and the left-out note are computed over the filtered stocks only', async () => {
    await open('/concentration?scope=all&lens=gicsSector&measure=value&market=TH', valued())
    await waitFor(() => expect(status()).toHaveTextContent('2 of 3 stocks in scope'))
    expect(screen.queryAllByText(/NVDA/)).toHaveLength(0)
    expect(within(rowFor('Financials')).getByText('75.0%')).toBeInTheDocument()
    expect(within(rowFor('Energy')).getByText('25.0%')).toBeInTheDocument()
  })
})

describe('See concentration from the stocks pages', () => {
  const stocksApi = () =>
    new StubApi({
      'GET /stocks': { items: [makeStock({ ticker: 'PTT', listIds: ['L1'], holding: held }), makeStock({ ticker: 'AAPL' })] },
      'GET /lists': { items: lists },
      'GET /lists/L1': lists[0],
    })

  it('TC-U-621 carries the search and filters but not the sort, with the list as scope', async () => {
    const { router } = renderApp('/lists/L1?q=ptt&held=yes&sort=name', stocksApi())
    const link = await screen.findByRole('link', { name: 'See concentration' })
    expect(link).toHaveAttribute('href', '/concentration?scope=L1&lens=gicsSector&measure=count&q=ptt&held=yes')
    await userEvent.click(link)
    await waitFor(() => expect(router.state.location.pathname).toBe('/concentration'))
    expect(router.state.location.search).toBe('?scope=L1&lens=gicsSector&measure=count&q=ptt&held=yes')
  })

  it('links /stocks to the all-stocks scope, bare when nothing is filtered', async () => {
    renderApp('/stocks', stocksApi())
    expect(await screen.findByRole('link', { name: 'See concentration' })).toHaveAttribute(
      'href',
      '/concentration?scope=all&lens=gicsSector&measure=count',
    )
  })
})
