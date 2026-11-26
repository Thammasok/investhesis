import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/api-client'
import { renderApp } from '@/test/render-app'
import { makeList } from '@/test/stock-fixtures'
import { DEFAULT_SETTINGS, deferred, emptyApi } from '@/test/stub-api'
import { apiOf, chainTitles, openChains, stockOf, vcA } from './cases-helpers'

vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }), Toaster: () => null }))

const ADVICE = 'These chains and costs are your own classifications, not advice.'
const plain = (n: number) => Array.from({ length: n }, (_, i) => stockOf(`P${i}`, { name: `Plain ${i}` }))

describe('empty, error and loading states', () => {
  it('TC-C-923 each empty state says what is missing and offers the way forward', async () => {
    // (a) no saved stocks
    const a = await openChains('/chains', emptyApi())
    const none = screen.getByRole('heading', { name: 'No value chains yet' }).closest('[data-slot="card"]') as HTMLElement
    expect(within(none).getByRole('link', { name: /Add stock/ })).toHaveAttribute('href', '/stocks/new')
    expect(within(none).getByRole('link', { name: /Import/ })).toHaveAttribute('href', '/import-export')
    expect(screen.queryByRole('searchbox')).toBeNull()
    a.unmount()

    // (b) 14 stocks, none with a chain
    const b = await openChains('/chains', apiOf(plain(14)))
    expect(screen.getByRole('heading', { name: 'No value chains in this view' })).toBeInTheDocument()
    expect(screen.getByText(/Give a stock a value chain name and a position/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Show the 14 stocks with no chain' })).toHaveAttribute('href', '/stocks?valueChain=')
    b.unmount()

    // (c) singular
    const c = await openChains('/chains', apiOf(plain(1)))
    expect(screen.getByRole('link', { name: 'Show the 1 stock with no chain' })).toBeInTheDocument()
    c.unmount()

    // (d) a list with no stocks: the card has no button that would read "0 stocks"
    const d = await openChains('/chains?scope=L-empty', apiOf(plain(3), undefined, [makeList('L-empty', 'Empty', 0)]))
    expect(screen.getByRole('heading', { name: 'No value chains in this view' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /with no chain/ })).toBeNull()
    d.unmount()

    // (e) a search that matches nothing: the result line and Clear all, no card, no chains
    const e = await openChains('/chains?q=zzzz', apiOf(plain(14)))
    expect(screen.getAllByText('0 of 14 stocks').length).toBeGreaterThan(0)
    expect(screen.getAllByRole('button', { name: 'Clear all' }).length).toBeGreaterThan(0)
    expect(screen.queryByRole('heading', { level: 2 })).toBeNull()
    e.unmount()

    // (f) a scope list that is gone
    await openChains('/chains?scope=deleted', apiOf(vcA()))
    expect(screen.getByText('That list no longer exists. Showing all stocks.')).toBeInTheDocument()
    expect(chainTitles()).toEqual(['AI & Semis', 'Oil & Gas'])
    expect(screen.getByRole('combobox', { name: 'Scope' })).toHaveTextContent('All stocks (12)')
  })

  it('TC-C-924 a failed read is the route error page with no stock data in it', async () => {
    for (const failing of ['GET /stocks', 'GET /settings', 'GET /lists']) {
      const stub = apiOf(vcA())
      stub.on(failing, () => {
        throw new ApiError(500, { code: 'internal', detail: 'ASML AI & Semis 98765' })
      })
      const view = renderApp('/chains', stub)
      const alert = await screen.findByRole('alert', undefined, { timeout: 8000 })
      expect(within(alert).getByRole('heading', { name: 'Something went wrong' })).toBeInTheDocument()
      expect(alert.textContent).not.toMatch(/ASML|AI & Semis|98765/)
      expect(screen.queryByRole('region')).toBeNull()
      // The page offers a way out; it is a full reload, not a retry of the three reads (reported against the case).
      expect(within(alert).getByRole('button', { name: 'Reload' })).toBeInTheDocument()
      expect(within(alert).getByRole('link', { name: 'Go to stocks' })).toBeInTheDocument()
      view.unmount()
    }
    const network = apiOf(vcA())
    network.on('GET /stocks', () => {
      throw new ApiError(0, {}, 'network_error')
    })
    renderApp('/chains', network)
    expect(await screen.findByRole('alert', undefined, { timeout: 8000 })).toHaveTextContent('Something went wrong')
  })

  it('TC-C-925 the skeleton shows until the three reads are in, then the page replaces it in one step', async () => {
    const gate = deferred<unknown>()
    const stub = apiOf(vcA())
    stub.on('GET /stocks', () => gate.promise.then(() => ({ items: vcA() })))
    renderApp('/chains', stub)

    await waitFor(() => expect(document.querySelector('[data-slot="skeleton"]')).not.toBeNull())
    expect(screen.queryByRole('heading', { level: 2 })).toBeNull()
    expect(screen.queryByText('No value chains yet')).toBeNull()
    expect(screen.queryByText(/in view (has|have) no value chain/)).toBeNull()

    gate.resolve(null)
    await screen.findByRole('heading', { level: 1, name: 'Value chains' })
    await waitFor(() => expect(document.querySelector('[data-slot="skeleton"]')).toBeNull())
    expect(chainTitles()).toEqual(['AI & Semis', 'Oil & Gas'])
  })

  it('TC-C-926 the advice line shows with chains, an empty view and no chain in view, and not with no saved stocks', async () => {
    const withChains = await openChains('/chains', apiOf(vcA()))
    expect(screen.getByText(ADVICE)).toBeVisible()
    expect(screen.getByText(ADVICE).closest('[aria-hidden="true"]')).toBeNull()
    withChains.unmount()

    const filtered = await openChains('/chains?q=zzzz', apiOf(vcA()))
    expect(screen.getByText(ADVICE)).toBeInTheDocument()
    filtered.unmount()

    const noChain = await openChains('/chains', apiOf(plain(2)))
    expect(screen.getByText(ADVICE)).toBeInTheDocument()
    noChain.unmount()

    await openChains('/chains', emptyApi())
    expect(screen.queryByText(ADVICE)).toBeNull()
    void DEFAULT_SETTINGS
  })

  it('TC-C-926 (reported) the concentration page shows its advice line even with no saved stocks', async () => {
    renderApp('/concentration', emptyApi())
    await screen.findByRole('heading', { level: 1, name: 'Concentration' })
    expect(screen.getByText(/not advice/)).toBeInTheDocument()
  })
})
