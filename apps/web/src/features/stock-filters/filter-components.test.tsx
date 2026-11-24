import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { describe, expect, it } from 'vitest'
import { DEFAULT_SORT } from '@/features/stocks/sort-stocks'
import { StockTable } from '@/features/stocks/components/stock-table'
import type { Stock } from '@/features/stocks/types'
import { renderApp } from '@/test/render-app'
import { makeList, makeStock } from '@/test/stock-fixtures'
import { DEFAULT_SETTINGS, StubApi } from '@/test/stub-api'

const th = { market: 'TH', exchange: 'SET', currency: 'THB' } as const
const rowsOf = () => within(screen.getByRole('table')).getAllByRole('row', { hidden: true }).slice(1)
const tickers = () => rowsOf().map((r) => within(r).getAllByRole('cell', { hidden: true })[0]?.textContent)
const apiFor = (items: Stock[]) =>
  new StubApi({
    'GET /stocks': { items },
    'GET /lists': { items: [makeList('core', 'Core', 0)] },
    'GET /settings': DEFAULT_SETTINGS,
    ...Object.fromEntries(items.map((s) => [`GET /stocks/${s.id}`, s])),
  })

const sample = () => [
  makeStock({ ticker: 'PTT', name: 'PTT Public', ...th, economicCycle: 'Cyclical' }),
  makeStock({ ticker: 'PTTEP', name: 'บริษัท ปตท. สำรวจและผลิตปิโตรเลียม', ...th, economicCycle: 'Cyclical' }),
  makeStock({ ticker: 'KBANK', name: 'Kasikorn', ...th }),
  makeStock({ ticker: 'NVDA', name: 'NVIDIA', themes: ['AI'] }),
]

describe('the table sort is controlled by its page', () => {
  it('TC-C-500 reports a click and shows only the sort it is given', async () => {
    const onSort = vi_fn()
    const stocks = sample()
    const router = createMemoryRouter([
      { path: '/', element: <StockTable stocks={stocks} sort={{ column: 'name', direction: 'asc' }} onSort={onSort.fn} /> },
    ])
    render(<RouterProvider router={router} />)
    const before = tickers()
    await userEvent.click(screen.getByRole('button', { name: 'Sort by Market' }))
    expect(onSort.calls).toEqual(['market'])
    expect(tickers()).toEqual(before) // nothing reorders until the page passes a new sort
    expect(screen.getByRole('columnheader', { name: /Name/ })).toHaveAttribute('aria-sort', 'ascending')
    expect(screen.getByRole('columnheader', { name: /Market/ })).toHaveAttribute('aria-sort', 'none')
    expect(DEFAULT_SORT).toEqual({ column: 'ticker', direction: 'asc' })
  })
})

describe('the view in the address', () => {
  it('TC-C-503 returns to the same search, filters and order after Back from a stock page', async () => {
    const { router } = renderApp('/stocks?q=ptt&market=TH&sort=name&dir=desc', apiFor(sample()))
    await screen.findByRole('table')
    const shown = tickers()
    expect(shown).toEqual(['PTTEP', 'PTT'])
    await userEvent.click(within(screen.getByRole('table')).getByRole('link', { name: 'PTT' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/stocks/s-PTT'))

    await act(() => router.navigate(-1))
    await screen.findByRole('table')
    expect(router.state.location.pathname).toBe('/stocks')
    expect(router.state.location.search).toBe('?q=ptt&market=TH&sort=name&dir=desc')
    expect(tickers()).toEqual(shown)
    expect(screen.getByRole('searchbox', { name: 'Search stocks' })).toHaveValue('ptt')
    expect(screen.getByText('Market: TH')).toBeInTheDocument()
  })

  it('TC-C-504 typing and picking add no history entry', async () => {
    const { router } = renderApp('/stocks', apiFor(sample()))
    await screen.findByRole('table')
    const actions: string[] = []
    router.subscribe((state) => actions.push(state.historyAction))
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search stocks' }), 'ptt')
    await userEvent.click(screen.getByRole('button', { name: 'Filters' }))
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('checkbox', { name: /^TH, / }))
    await waitFor(() => expect(router.state.location.search).toBe('?q=ptt&market=TH'))
    expect(actions).toContain('REPLACE')
    expect(actions).not.toContain('PUSH') // other state changes keep the earlier action; no write adds an entry
  })

  it('TC-C-506 searches Thai text as typed and keeps it in the address', async () => {
    const { router } = renderApp('/stocks', apiFor(sample()))
    await screen.findByRole('table')
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search stocks' }), 'ปตท.')
    await waitFor(() => expect(tickers()).toEqual(['PTTEP']))
    expect(decodeURIComponent(router.state.location.search)).toBe('?q=ปตท.')
    expect(router.state.location.search).toContain('%E0%B8')
  })

  it('TC-C-518 names every dropped part of a concentration address, ignores unknown names and cleans up on the first change', async () => {
    const stub = apiFor(sample())
    const { router } = renderApp('/concentration?scope=all&lens=gicsSector&measure=count&market=Bitcoin&held=maybe&lens=size&utm_source=mail', stub)
    await screen.findByRole('heading', { level: 1, name: 'Concentration' }, { timeout: 8000 })
    expect(screen.getByText('"Bitcoin" isn\'t a Market value, so that filter was left out.')).toBeInTheDocument()
    expect(screen.getByText('"maybe" isn\'t a Held value, so that filter was left out.')).toBeInTheDocument()
    expect(screen.getByText(/grouping isn't available/)).toBeInTheDocument()
    expect(document.body.textContent).not.toContain('utm_source')
    expect(router.state.location.search).toContain('market=Bitcoin') // not rewritten on load

    await userEvent.click(screen.getByRole('combobox', { name: 'Group by' }))
    await userEvent.click(await screen.findByRole('option', { name: 'Style' }))
    await waitFor(() => expect(router.state.location.search).toBe('?scope=all&lens=style&measure=count'))
  })
})

describe('the filter sheet', () => {
  it('TC-C-507 keeps a zero count pickable, and picking it leads to the no-match card', async () => {
    const { router } = renderApp('/stocks', apiFor(sample()))
    await screen.findByRole('table')
    await userEvent.click(screen.getByRole('button', { name: 'Filters' }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: /Economic cycle/ }))
    const defensive = within(dialog).getByRole('checkbox', { name: 'Defensive, 0 stocks' })
    expect(defensive).toBeEnabled()
    await userEvent.click(defensive)
    await waitFor(() => expect(router.state.location.search).toBe('?economicCycle=Defensive'))
    await userEvent.keyboard('{Escape}')
    expect(await screen.findByRole('heading', { level: 2, name: 'No stocks match' })).toBeInTheDocument()
  })

  it('TC-C-509 shows only Not set for a free-text filter nobody has values for', async () => {
    renderApp('/stocks', apiFor([makeStock({ ticker: 'A' }), makeStock({ ticker: 'B' })]))
    await screen.findByRole('table')
    await userEvent.click(screen.getByRole('button', { name: 'Filters' }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: /Themes/ }))
    const group = within(dialog).getByRole('group', { name: 'Themes' })
    expect(within(group).getAllByRole('checkbox')).toHaveLength(1)
    expect(within(group).getByRole('checkbox', { name: 'Not set, 2 stocks' })).toBeInTheDocument()
  })

  it('TC-C-511 gives every control an accessible name', async () => {
    renderApp('/stocks?q=ptt&market=TH&economicCycle=Cyclical&economicCycle=', apiFor(sample()))
    await screen.findByRole('table')
    expect(screen.getByRole('searchbox', { name: 'Search stocks' })).toBeInTheDocument()
    const filters = screen.getByRole('button', { name: 'Filters 2 active' })
    expect(filters).toHaveAttribute('aria-haspopup', 'dialog')
    expect(filters).toHaveAttribute('aria-expanded', 'false')
    for (const name of ['Remove search: ptt', 'Remove filter Market: TH', 'Remove filter Economic cycle: Cyclical, Not set']) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument()
    }
    await userEvent.click(filters)
    const dialog = await screen.findByRole('dialog', { name: 'Filters' })
    expect(screen.getByRole('button', { name: 'Filters 2 active', hidden: true })).toHaveAttribute('aria-expanded', 'true')
    expect(within(dialog).getByRole('group', { name: 'Market' })).toBeInTheDocument()
    expect(within(dialog).getByRole('checkbox', { name: 'Cyclical, 2 stocks' })).toBeInTheDocument()
  })

  it('TC-C-512 has one live region for the count on the page, and one more inside the open sheet', async () => {
    renderApp('/stocks', apiFor(sample()))
    await screen.findByRole('table')
    expect(screen.getAllByRole('status')).toHaveLength(1)
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search stocks' }), 'ptt')
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('2 of 4 stocks'))
    await userEvent.click(screen.getByRole('button', { name: 'Filters' }))
    const dialog = await screen.findByRole('dialog')
    const description = within(dialog).getByText('2 of 4 stocks')
    expect(description).toHaveAttribute('aria-live', 'polite')
  })

  it('TC-C-531 is a bottom sheet below the sm breakpoint and a side sheet from it', async () => {
    const original = window.matchMedia
    const at = (narrow: boolean) => {
      window.matchMedia = ((query: string) => ({
        matches: narrow && query.includes('max-width: 639px'),
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      })) as typeof window.matchMedia
    }
    try {
      for (const [narrow, side] of [[true, 'bottom'], [false, 'right']] as const) {
        at(narrow)
        const view = renderApp('/stocks', apiFor(sample()))
        await screen.findByRole('table')
        await userEvent.click(screen.getByRole('button', { name: 'Filters' }))
        const dialog = await screen.findByRole('dialog', { name: 'Filters' })
        expect(dialog).toHaveAttribute('data-side', side)
        expect(within(dialog).getAllByRole('button').filter((b) => b.hasAttribute('aria-expanded'))).toHaveLength(18)
        view.unmount()
      }
    } finally {
      window.matchMedia = original
    }
  })
})

describe('what is sent', () => {
  it('TC-C-529 never puts the search text or a filter value in a request', async () => {
    const stub = apiFor([makeStock({ ticker: 'A', themes: ['SENTINEL-theme'] }), makeStock({ ticker: 'B' })])
    const { router } = renderApp('/stocks', stub)
    await screen.findByRole('table')
    const before = stub.calls.length
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search stocks' }), 'SENTINEL-q-91')
    await userEvent.click(screen.getByRole('button', { name: 'Filters' }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: /Themes/ }))
    await userEvent.click(within(dialog).getByRole('checkbox', { name: /^SENTINEL-theme, / }))
    await userEvent.keyboard('{Escape}')
    await act(() => router.navigate('/concentration?scope=all&q=SENTINEL-q-91&themes=SENTINEL-theme'))
    await screen.findByRole('heading', { level: 1, name: 'Concentration' }, { timeout: 8000 })
    const sent = JSON.stringify(stub.calls.slice(before))
    expect(sent).not.toContain('SENTINEL')
    expect(router.state.location.search).toContain('SENTINEL')
  })
})

/** A tiny spy: the calls it received, without pulling in vi.fn for one test. */
function vi_fn() {
  const calls: string[] = []
  return { calls, fn: (column: string) => void calls.push(column) }
}
