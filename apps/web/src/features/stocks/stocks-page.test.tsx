import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { describe, expect, it } from 'vitest'
import { ApiError } from '@/lib/api-client'
import { makeList, makeStock } from '@/test/stock-fixtures'
import { renderApp } from '@/test/render-app'
import { StubApi } from '@/test/stub-api'
import { StockTable } from './components/stock-table'

const tickerOrder = () =>
  screen
    .getAllByRole('row')
    .slice(1)
    .map((row) => within(row).getAllByRole('cell')[0]?.textContent)

const msft = makeStock({ ticker: 'MSFT', name: 'Microsoft' })
const aapl = makeStock({ ticker: 'AAPL', name: 'Apple' })
const pttep = makeStock({
  ticker: 'PTTEP',
  name: 'PTT Exploration and Production',
  market: 'TH',
  exchange: 'SET',
  currency: 'THB',
  gicsSector: 'Energy',
  setIndustryGroup: 'Resources',
})

function stocksApi(items = [msft, aapl, pttep], lists = [makeList('L1', 'Core holdings', 1)]) {
  return new StubApi({ 'GET /stocks': { items }, 'GET /lists': { items: lists } })
}

describe('stocks page', () => {
  it('TC-U-080: sorts by ticker by default and toggles on click', async () => {
    renderApp('/stocks', stocksApi())
    await screen.findByRole('table')
    expect(tickerOrder()).toEqual(['AAPL', 'MSFT', 'PTTEP'])
    const tickerHead = screen.getByRole('columnheader', { name: /Ticker/ })
    expect(tickerHead).toHaveAttribute('aria-sort', 'ascending')

    await userEvent.click(screen.getByRole('button', { name: 'Sort by Ticker' }))

    expect(tickerOrder()).toEqual(['PTTEP', 'MSFT', 'AAPL'])
    expect(tickerHead).toHaveAttribute('aria-sort', 'descending')
  })

  it('TC-U-081: shows the empty state with two links and no table', async () => {
    renderApp('/stocks', stocksApi([]))
    expect(await screen.findByText('No stocks yet')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Add stock/ })).toHaveAttribute('href', '/stocks/new')
    expect(screen.getByRole('link', { name: /Import from file/ })).toHaveAttribute('href', '/import-export')
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('TC-U-082: a TH stock shows the GICS sector and the SET group as secondary text', async () => {
    renderApp('/stocks', stocksApi())
    const row = (await screen.findByRole('link', { name: 'PTTEP' })).closest('tr') as HTMLElement
    expect(within(row).getByText('Energy')).toBeInTheDocument()
    expect(within(row).getByText('Resources')).toBeInTheDocument()
  })

  it('TC-C-110: has the columns in order, sortable headers only on four, and an updating caption', async () => {
    renderApp('/stocks', stocksApi())
    const table = await screen.findByRole('table')
    const heads = within(table).getAllByRole('columnheader')
    expect(heads.map((h) => h.textContent)).toEqual([
      'Ticker',
      'Name',
      'Market',
      'Exchange',
      'Sector',
      'Size',
      'Style',
      'Lists',
    ])
    const sortable = within(table)
      .getAllByRole('button')
      .map((b) => b.getAttribute('aria-label') ?? b.textContent)
    expect(sortable).toEqual(['Sort by Ticker', 'Sort by Name', 'Sort by Market', 'Sort by Sector'])
    expect(heads.filter((h) => h.getAttribute('aria-sort') && h.getAttribute('aria-sort') !== 'none')).toHaveLength(1)
    expect(within(table).getByText('Saved stocks, sorted by Ticker ascending', { selector: 'caption' })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Sort by Name' }))
    expect(screen.getByText('Saved stocks, sorted by Name ascending', { selector: 'caption' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Sort by Name' }))
    expect(screen.getByText('Saved stocks, sorted by Name descending', { selector: 'caption' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: /Ticker/ })).toHaveAttribute('aria-sort', 'none')

    const market = screen.getAllByText('US')[0] as HTMLElement
    expect(market).toHaveAttribute('data-slot', 'badge')
    expect(screen.getByRole('link', { name: 'AAPL' }).closest('td')).toHaveClass('font-medium', 'tabular-nums')
  })

  it('TC-C-111: shows at most two list badges then +N, a dash for none, and full long names', async () => {
    const lists = ['A', 'B', 'C', 'D', 'E'].map((n) => makeList(`l${n}`, `List ${n}`))
    const longName = 'L'.repeat(80)
    const thai = 'หุ้นหลัก'
    lists.push(makeList('lLong', longName), makeList('lThai', thai))
    const stocks = [
      makeStock({ ticker: 'ZERO' }),
      makeStock({ ticker: 'ONE', listIds: ['lA'] }),
      makeStock({ ticker: 'TWO', listIds: ['lA', 'lB'] }),
      makeStock({ ticker: 'THREE', listIds: ['lA', 'lB', 'lC'] }),
      makeStock({ ticker: 'FIVE', listIds: ['lA', 'lB', 'lC', 'lD', 'lE'] }),
      makeStock({ ticker: 'LONG', listIds: ['lLong', 'lThai'] }),
    ]
    renderApp('/stocks', stocksApi(stocks, lists))
    const rowOf = async (t: string) => (await screen.findByRole('link', { name: t })).closest('tr') as HTMLElement

    expect(within(await rowOf('ZERO')).getByText('no lists')).toHaveClass('sr-only')
    expect(within(await rowOf('ONE')).queryByText(/^\+/)).not.toBeInTheDocument()
    expect(within(await rowOf('TWO')).queryByText(/^\+/)).not.toBeInTheDocument()
    expect(within(await rowOf('THREE')).getByText('+1')).toBeInTheDocument()
    expect(within(await rowOf('FIVE')).getByText('+3')).toBeInTheDocument()
    const longRow = within(await rowOf('LONG'))
    expect(longRow.getByTitle(longName)).toHaveTextContent(longName)
    expect(longRow.getByText(thai).textContent).toBe(thai)
  })

  it('TC-C-112: a row click and the ticker link both open the stock, once', async () => {
    const api = stocksApi()
    api.on('GET /stocks/s-AAPL', aapl).on('GET /stocks/s-MSFT', msft)
    const { router } = renderApp('/stocks', api)
    const link = await screen.findByRole('link', { name: 'AAPL' })
    expect(link).toHaveAttribute('href', '/stocks/s-AAPL')

    await userEvent.click(link)
    await waitFor(() => expect(router.state.location.pathname).toBe('/stocks/s-AAPL'))
    expect(api.callsTo('GET /stocks/s-AAPL')).toHaveLength(1)

    await act(() => router.navigate('/stocks'))
    await userEvent.click((await screen.findByRole('link', { name: 'MSFT' })).closest('tr') as HTMLElement)
    await waitFor(() => expect(router.state.location.pathname).toBe('/stocks/s-MSFT'))
  })

  it('TC-C-112: tab order is Import, Add stock, sort buttons, then each ticker link', async () => {
    renderApp('/stocks', stocksApi())
    await screen.findByRole('table')
    const main = screen.getByRole('table').closest('section') as HTMLElement
    const stops = within(main)
      .getAllByRole('link')
      .map((l) => l.textContent)
    const buttons = within(main).getAllByRole('button')
    expect(stops).toEqual(['Import', 'Add stock', 'AAPL', 'MSFT', 'PTTEP'])
    expect(buttons).toHaveLength(4)
    const all = Array.from(main.querySelectorAll<HTMLElement>('a[href], button')).map((e) => e.getAttribute('aria-label') ?? e.textContent)
    expect(all).toEqual(['Import', 'Add stock', 'Sort by Ticker', 'Sort by Name', 'Sort by Market', 'Sort by Sector', 'AAPL', 'MSFT', 'PTTEP'])
  })

  it('TC-C-113: shows the count text with singular and plural, and links in the header', async () => {
    const { unmount } = renderApp('/stocks', stocksApi([aapl]))
    expect(await screen.findByText('1 stock')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Import' })).toHaveAttribute('href', '/import-export')
    expect(screen.getByRole('link', { name: 'Add stock' })).toHaveAttribute('href', '/stocks/new')
    unmount()
    renderApp('/stocks', stocksApi())
    expect(await screen.findByText('3 stocks')).toBeInTheDocument()
  })

  it('TC-C-113: shows five skeleton rows while the first load is pending', async () => {
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => (release = resolve))
    const api = stocksApi()
    api.on('GET /stocks', async () => {
      await gate
      return { items: [aapl] }
    })
    const { container } = renderApp('/stocks', api)
    await waitFor(() => expect(container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(5))
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    release()
    expect(await screen.findByRole('table')).toBeInTheDocument()
  })

  it('TC-C-113: a failing API shows the error page with a way out, not a blank page', async () => {
    const api = new StubApi({
      'GET /stocks': () => {
        throw new ApiError(500, { code: 'internal_error' })
      },
      'GET /lists': { items: [] },
    })
    renderApp('/stocks', api)
    expect(await screen.findByRole('heading', { name: 'Something went wrong' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Go to stocks' })).toHaveAttribute('href', '/stocks')
  })

  it('TC-C-181: Thai text renders unchanged in the table', async () => {
    const thai = makeStock({ ticker: 'PTTEP', name: 'บมจ. ปตท. สำรวจและผลิตปิโตรเลียม', market: 'TH', exchange: 'SET', listIds: ['t'] })
    renderApp('/stocks', stocksApi([thai], [makeList('t', 'หุ้นหลัก')]))
    const row = (await screen.findByRole('link', { name: 'PTTEP' })).closest('tr') as HTMLElement
    expect(within(row).getByText('บมจ. ปตท. สำรวจและผลิตปิโตรเลียม').textContent).toBe('บมจ. ปตท. สำรวจและผลิตปิโตรเลียม')
    expect(within(row).getByText('หุ้นหลัก').textContent).toBe('หุ้นหลัก')
  })
})

describe('stock table performance', () => {
  function generate(n: number) {
    return Array.from({ length: n }, (_, i) =>
      makeStock({
        ticker: `T${String(i).padStart(3, '0')}`,
        name: i % 3 === 0 ? `บริษัท ${i}` : `Company ${(i * 7919) % n}`,
        market: i % 2 ? 'TH' : 'US',
        gicsSector: i % 5 === 0 ? null : 'Energy',
        listIds: ['a', 'b', 'c', 'd'].slice(0, i % 5),
      }),
    )
  }
  const lists = ['a', 'b', 'c', 'd'].map((id) => makeList(id, `List ${id}`))
  const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] as number

  it('TC-C-114: renders and re-sorts 200 stocks in under 200 ms (median of 5)', () => {
    const stocks = generate(200)
    const renders: number[] = []
    const sorts: number[] = []
    for (let run = 0; run < 5; run++) {
      const router = createMemoryRouter([{ path: '/', element: <StockTable stocks={stocks} lists={lists} /> }])
      const t0 = performance.now()
      const view = render(<RouterProvider router={router} />)
      renders.push(performance.now() - t0)
      expect(view.container.querySelectorAll('tbody tr')).toHaveLength(200)
      const button = screen.getByRole('button', { name: 'Sort by Name' })
      for (let i = 0; i < 2; i++) {
        const t1 = performance.now()
        act(() => {
          fireEvent.click(button)
        })
        sorts.push(performance.now() - t1)
      }
      expect(view.container.querySelectorAll('tbody tr')).toHaveLength(200)
      view.unmount()
    }
    expect(median(renders)).toBeLessThan(200)
    expect(median(sorts)).toBeLessThan(200)
  })
})
