import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { describe, expect, it } from 'vitest'
import { renderApp } from '@/test/render-app'
import { makeList, makeStock } from '@/test/stock-fixtures'
import { StubApi } from '@/test/stub-api'
import type { Stock } from '@/features/stocks/types'
import { FilterToolbar } from './filter-toolbar'
import { useStockFilters } from './use-stock-filters'

const status = () => screen.getByRole('status')
// `hidden`: while the sheet is open, the page behind it is out of the accessibility tree.
const rows = () => within(screen.getByRole('table', { hidden: true })).getAllByRole('row', { hidden: true }).slice(1)
const tickers = () => rows().map((r) => within(r).getAllByRole('cell', { hidden: true })[0]?.textContent)
const stocksApi = (items: Stock[], lists = [makeList('core', 'Core', 0)]) =>
  new StubApi({ 'GET /stocks': { items }, 'GET /lists': { items: lists }, 'GET /lists/core': makeList('core', 'Core', 3) })
const reads = (stub: StubApi) => stub.calls.filter((c) => c.path !== '/me').length

/** 42 stocks: PTT, PTTEP and PTTGC (TH) plus 39 others (US). */
function fortyTwo() {
  const th = ['PTT', 'PTTEP', 'PTTGC'].map((ticker, i) =>
    makeStock({ ticker, name: `${ticker} Co`, market: 'TH', exchange: 'SET', currency: 'THB', economicCycle: i === 0 ? 'Cyclical' : null }),
  )
  const us = Array.from({ length: 39 }, (_, i) =>
    makeStock({ ticker: `S${String(i).padStart(2, '0')}`, name: `Company ${i}`, economicCycle: i % 2 ? 'Defensive' : 'Cyclical' }),
  )
  return [...th, ...us]
}

describe('search', () => {
  it('TC-U-600 narrows the table and the count, writes the address and shows a badge', async () => {
    const { router } = renderApp('/stocks', stocksApi(fortyTwo()))
    await screen.findByRole('table')
    expect(status()).toHaveTextContent('42 stocks')

    await userEvent.type(screen.getByRole('searchbox', { name: 'Search stocks' }), 'ptt')

    await waitFor(() => expect(rows()).toHaveLength(3))
    expect(status()).toHaveTextContent('3 of 42 stocks')
    await waitFor(() => expect(router.state.location.search).toBe('?q=ptt'))
    expect(screen.getByText('Search: ptt')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remove search: ptt' })).toBeInTheDocument()
  })

  it('TC-U-606 keeps a typed space inside the box while the address holds the trimmed text; Esc clears', async () => {
    const { router } = renderApp('/stocks', stocksApi(fortyTwo()))
    await screen.findByRole('table')
    const box = screen.getByRole('searchbox', { name: 'Search stocks' })
    await userEvent.type(box, 'ptt c')
    expect(box).toHaveValue('ptt c')
    await waitFor(() => expect(router.state.location.search).toBe('?q=ptt+c'))
    await userEvent.type(box, '{Escape}')
    expect(box).toHaveValue('')
    await waitFor(() => expect(router.state.location.search).toBe(''))
    expect(screen.queryByRole('button', { name: 'Clear search' })).not.toBeInTheDocument()
  })

  it('TC-U-607 the box follows the address when it changes from outside', async () => {
    const { router } = renderApp('/stocks?q=ptt', stocksApi(fortyTwo()))
    const box = await screen.findByRole('searchbox', { name: 'Search stocks' })
    expect(box).toHaveValue('ptt')
    await act(() => router.navigate('/stocks?q=nvda', { replace: true }))
    await waitFor(() => expect(box).toHaveValue('nvda'))
  })
})

describe('filter sheet', () => {
  it('TC-U-601 applies picks at once, counts them on the button and closes with focus back on it', async () => {
    const { router } = renderApp('/stocks', stocksApi(fortyTwo()))
    await screen.findByRole('table')
    await userEvent.click(screen.getByRole('button', { name: 'Filters' }))
    const dialog = await screen.findByRole('dialog', { name: 'Filters' })
    expect(within(dialog).getByText('42 stocks')).toBeInTheDocument()

    await userEvent.click(within(dialog).getByRole('checkbox', { name: /^TH, 3 stocks$/ }))
    await userEvent.click(within(dialog).getByRole('button', { name: /Economic cycle/ }))
    await userEvent.click(within(dialog).getByRole('checkbox', { name: /^Cyclical, / }))

    await waitFor(() => expect(router.state.location.search).toBe('?market=TH&economicCycle=Cyclical'))
    await waitFor(() => expect(within(dialog).getByText('1 of 42 stocks')).toBeInTheDocument())
    expect(within(dialog).getByRole('button', { name: 'Show 1 stock' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Filters, 2 active', hidden: true })).toHaveAttribute('aria-haspopup', 'dialog')

    await userEvent.click(within(dialog).getByRole('button', { name: 'Show 1 stock' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await waitFor(() => expect(screen.getByRole('button', { name: 'Filters, 2 active' })).toHaveFocus())
    expect(tickers()).toEqual(['PTT'])
  })

  it('TC-U-608 lists the sections in the sheet order, with Market, Held and picked sections open', async () => {
    renderApp('/stocks?themes=ai', stocksApi([makeStock({ ticker: 'AI1', themes: ['AI'] }), ...fortyTwo()]))
    await screen.findByRole('table')
    await screen.findByRole('table')
    await userEvent.click(screen.getByRole('button', { name: 'Filters, 1 active' }))
    const dialog = await screen.findByRole('dialog', { name: 'Filters' })
    const triggers = within(dialog).getAllByRole('button').filter((b) => b.hasAttribute('aria-expanded'))
    expect(triggers.map((b) => b.textContent?.replace(/\(\d+\)/, '').trim())).toEqual([
      'Market', 'Held', 'Exchange', 'Sector (GICS)', 'SET industry group', 'Value chain position', 'Value chain name',
      'Size', 'Style', 'Economic cycle', 'Lynch type', 'Life cycle', 'Customers', 'Revenue types', 'Moat', 'Themes',
      'Volatility', 'Index membership',
    ])
    const open = triggers.filter((b) => b.getAttribute('aria-expanded') === 'true').map((b) => b.textContent?.replace(/\(\d+\)/, '').trim())
    expect(open).toEqual(['Market', 'Held', 'Themes'])
  })

  it('TC-U-609 puts Not set last in italics, keeps zero counts pickable and None apart from Not set', async () => {
    const items = [
      makeStock({ ticker: 'A', valueChainPosition: 'None' }),
      makeStock({ ticker: 'B', valueChainPosition: null }),
      makeStock({ ticker: 'C', valueChainPosition: 'Upstream' }),
    ]
    const { router } = renderApp('/stocks', stocksApi(items))
    await screen.findByRole('table')
    await userEvent.click(screen.getByRole('button', { name: 'Filters' }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: /Value chain position/ }))
    const group = within(dialog).getByRole('group', { name: 'Value chain position' })
    const names = within(group).getAllByRole('checkbox').map((c) => c.getAttribute('aria-labelledby') ? c.id : c.id)
    expect(names).toHaveLength(6)
    const labels = within(group).getAllByText(/^(Upstream|Midstream|Downstream|Integrated|None|Not set)$/).map((e) => e.textContent)
    expect(labels).toEqual(['Upstream', 'Midstream', 'Downstream', 'Integrated', 'None', 'Not set'])
    expect(within(group).getByText('Not set')).toHaveClass('italic')
    expect(within(group).getByRole('checkbox', { name: 'Midstream, 0 stocks' })).toBeEnabled()

    await userEvent.click(within(group).getByRole('checkbox', { name: 'None, 1 stock' }))
    await waitFor(() => expect(router.state.location.search).toBe('?valueChainPosition=None'))
    await waitFor(() => expect(tickers()).toEqual(['A']))
    await userEvent.click(within(group).getByRole('checkbox', { name: 'None, 1 stock' }))
    await userEvent.click(within(group).getByRole('checkbox', { name: 'Not set, 1 stock' }))
    await waitFor(() => expect(router.state.location.search).toBe('?valueChainPosition='))
    await waitFor(() => expect(tickers()).toEqual(['B']))
  })

  it('TC-U-610 a section with more than 8 options has a Find box; picked options stay visible', async () => {
    const sectors = ['Energy', 'Financials', 'Health Care', 'Industrials', 'Materials', 'Utilities', 'Real Estate', 'Consumer Staples', 'Consumer Discretionary']
    const items = sectors.map((gicsSector, i) => makeStock({ ticker: `G${i}`, gicsSector }))
    renderApp('/stocks', stocksApi(items))
    await screen.findByRole('table')
    await userEvent.click(screen.getByRole('button', { name: 'Filters' }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: /Sector \(GICS\)/ }))
    const find = within(dialog).getByRole('searchbox', { name: 'Find in Sector (GICS)' })
    expect(within(dialog).queryByRole('searchbox', { name: 'Find in Market' })).not.toBeInTheDocument()

    await userEvent.click(within(dialog).getByRole('checkbox', { name: /^Energy, / }))
    await userEvent.type(find, 'cons')
    const group = within(dialog).getByRole('group', { name: 'Sector (GICS)' })
    expect(within(group).getAllByRole('checkbox').map((c) => c.getAttribute('aria-label') ?? '')).toHaveLength(4) // 2 matches, the pick, Not set
    expect(within(group).getByRole('checkbox', { name: /^Energy, / })).toBeChecked()
    await userEvent.clear(find)
    await userEvent.type(find, 'zzz')
    expect(within(group).getByText('No match')).toBeInTheDocument()
  })

  it('TC-U-611 Clear all in the sheet clears the filters, keeps the search and stays open', async () => {
    const { router } = renderApp('/stocks?q=ptt&market=TH', stocksApi(fortyTwo()))
    await screen.findByRole('table')
    await userEvent.click(screen.getByRole('button', { name: 'Filters, 1 active' }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Clear all' }))
    await waitFor(() => expect(router.state.location.search).toBe('?q=ptt'))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Clear all' })).toBeDisabled()
  })

  it('TC-U-612 works from the keyboard: opens, traps focus, toggles with Space and closes with Esc back to Filters', async () => {
    const { router } = renderApp('/stocks', stocksApi(fortyTwo()))
    await screen.findByRole('table')
    const filtersButton = screen.getByRole('button', { name: 'Filters' })
    filtersButton.focus()
    await userEvent.keyboard('{Enter}')
    const dialog = await screen.findByRole('dialog', { name: 'Filters' })
    await waitFor(() => expect(within(dialog).getByRole('button', { name: /^Market/ })).toHaveFocus())
    await userEvent.keyboard('{Tab}') // first option of Market
    expect(within(dialog).getByRole('checkbox', { name: /^US, / })).toHaveFocus()
    await userEvent.keyboard(' ')
    await waitFor(() => expect(router.state.location.search).toBe('?market=US'))
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await waitFor(() => expect(screen.getByRole('button', { name: 'Filters, 1 active' })).toHaveFocus())
  })
})

describe('active filters and the result line', () => {
  it('TC-U-602 removes a badge and moves focus on; Clear all clears everything and focuses the search', async () => {
    const { router } = renderApp('/stocks?q=ptt&market=TH&economicCycle=Cyclical&economicCycle=', stocksApi(fortyTwo()))
    await screen.findByRole('table')
    expect(screen.getByText('Economic cycle: Cyclical, Not set')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Remove filter Market: TH' }))
    await waitFor(() => expect(router.state.location.search).toBe('?q=ptt&economicCycle=Cyclical&economicCycle='))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Remove filter Economic cycle: Cyclical, Not set' })).toHaveFocus())

    await userEvent.click(screen.getByRole('button', { name: 'Remove filter Economic cycle: Cyclical, Not set' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Remove search: ptt' })).toHaveFocus())
    await userEvent.click(screen.getByRole('button', { name: 'Remove search: ptt' }))
    await waitFor(() => expect(screen.getByRole('searchbox', { name: 'Search stocks' })).toHaveFocus())

    await userEvent.type(screen.getByRole('searchbox', { name: 'Search stocks' }), 'p')
    await userEvent.click(screen.getByRole('button', { name: 'Filters' }))
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('checkbox', { name: /^TH, / }))
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await userEvent.click(await screen.findByRole('button', { name: 'Clear all' }))
    await waitFor(() => expect(router.state.location.search).toBe(''))
    await waitFor(() => expect(screen.getByRole('searchbox', { name: 'Search stocks' })).toHaveFocus())
    await waitFor(() => expect(screen.getByRole('searchbox', { name: 'Search stocks' })).toHaveValue(''))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Clear all' })).not.toBeInTheDocument())
  })

  it('TC-U-603 tells no match from no stocks', async () => {
    const { unmount } = renderApp('/stocks?q=zzz', stocksApi(fortyTwo()))
    expect(await screen.findByRole('heading', { level: 2, name: 'No stocks match' })).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(status()).toHaveTextContent('0 of 42 stocks')
    await userEvent.click(within(screen.getByRole('heading', { name: 'No stocks match' }).closest('[data-slot="card"]') as HTMLElement).getByRole('button', { name: 'Clear all' }))
    expect(await screen.findByRole('table')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('searchbox', { name: 'Search stocks' })).toHaveFocus())
    unmount()

    renderApp('/stocks', stocksApi([]))
    expect(await screen.findByText('No stocks yet')).toBeInTheDocument()
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument()
  })

  it('TC-U-605 names the dropped address parts, still shows every stock and leaves the address alone', async () => {
    const { router } = renderApp('/stocks?market=Bitcoin', stocksApi(fortyTwo()))
    await screen.findByRole('table')
    const note = screen.getByText('"Bitcoin" isn\'t a Market value, so that filter was left out.')
    expect(note.closest('[data-slot="alert"]')).toHaveAttribute('role', 'status')
    expect(rows()).toHaveLength(42)
    await waitFor(() => expect(router.state.location.search).toBe('?market=Bitcoin'))
  })
})

describe('list page', () => {
  it('TC-U-604 filters the members only and counts options over them', async () => {
    const members = [
      makeStock({ ticker: 'A', market: 'TH', exchange: 'SET', listIds: ['core'] }),
      makeStock({ ticker: 'B', market: 'TH', exchange: 'SET', listIds: ['core'] }),
      makeStock({ ticker: 'C', listIds: ['core'] }),
    ]
    const others = Array.from({ length: 40 }, (_, i) => makeStock({ ticker: `X${i}`, market: 'TH', exchange: 'SET' }))
    renderApp('/lists/core?market=TH', stocksApi([...members, ...others]))
    await screen.findByRole('table')
    expect(tickers()).toEqual(['A', 'B'])
    expect(status()).toHaveTextContent('2 of 3 stocks')
    await userEvent.click(screen.getByRole('button', { name: 'Filters, 1 active' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('checkbox', { name: 'TH, 2 stocks' })).toBeChecked()
    expect(within(dialog).getByRole('checkbox', { name: 'US, 1 stock' })).toBeInTheDocument()
  })

  it('TC-U-613 an empty list keeps its empty card with no toolbar', async () => {
    renderApp('/lists/core', new StubApi({ 'GET /stocks': { items: [makeStock({ ticker: 'A' })] }, 'GET /lists': { items: [makeList('core', 'Core', 0)] }, 'GET /lists/core': makeList('core', 'Core', 0) }))
    expect(await screen.findByText('This list is empty.')).toBeInTheDocument()
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument()
  })
})

describe('no request, speed and layout', () => {
  it('TC-U-614 typing, picking, removing and sorting send no API request', async () => {
    const stub = stocksApi(fortyTwo())
    renderApp('/stocks', stub)
    await screen.findByRole('table')
    const first = reads(stub)
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search stocks' }), 'ptt')
    await userEvent.click(screen.getByRole('button', { name: 'Filters' }))
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('checkbox', { name: /^TH, / }))
    await userEvent.keyboard('{Escape}')
    await userEvent.click(screen.getByRole('button', { name: 'Remove filter Market: TH' }))
    await userEvent.click(screen.getByRole('button', { name: 'Sort by Name' }))
    expect(reads(stub)).toBe(first)
  })

  it('TC-U-615 a keystroke on 200 stocks updates the table in under 200 ms (median of 5)', () => {
    const stocks = Array.from({ length: 200 }, (_, i) =>
      makeStock({ ticker: `T${String(i).padStart(3, '0')}`, name: `Company ${(i * 7919) % 200}`, market: i % 2 ? 'TH' : 'US', themes: [`theme${i % 7}`] }),
    )
    function Harness() {
      const filters = useStockFilters(stocks)
      return (
        <div>
          <FilterToolbar filters={filters} />
          <output data-testid="n">{filters.shown.length}</output>
        </div>
      )
    }
    const times: number[] = []
    for (let run = 0; run < 5; run++) {
      const router = createMemoryRouter([{ path: '/', element: <Harness /> }])
      const view = render(<RouterProvider router={router} />)
      const box = screen.getByRole('searchbox', { name: 'Search stocks' })
      const t0 = performance.now()
      act(() => {
        fireEvent.change(box, { target: { value: 'company 1' } })
      })
      times.push(performance.now() - t0)
      expect(Number(screen.getByTestId('n').textContent)).toBeLessThan(200)
      view.unmount()
    }
    expect([...times].sort((a, b) => a - b)[2]).toBeLessThan(200)
  })
})
