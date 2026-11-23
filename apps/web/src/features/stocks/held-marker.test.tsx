import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { toast } from 'sonner'
import { renderApp } from '@/test/render-app'
import { makeList, makeStock } from '@/test/stock-fixtures'
import { StubApi } from '@/test/stub-api'
import type { Stock } from './types'

vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }), Toaster: () => null }))

beforeEach(() => vi.mocked(toast).mockClear())

const nvda = makeStock({ ticker: 'NVDA', gicsSector: 'Information Technology', listIds: ['core'], holding: { shares: '120.5000', averageCost: '412.3300', costCurrency: 'USD' } })
const pttep = makeStock({ ticker: 'PTTEP', market: 'TH', exchange: 'SET', currency: 'THB', listIds: ['core'], holding: { shares: null, averageCost: null, costCurrency: 'THB' } })
const aapl = makeStock({ ticker: 'AAPL', listIds: ['core'] })

function listApi(stocks: Stock[]) {
  const members = () => stocks.filter((s) => s.listIds.includes('core'))
  const api = new StubApi({
    'GET /lists/core': () => makeList('core', 'Core holdings', members().length),
    'GET /lists': () => ({ items: [makeList('core', 'Core holdings', members().length)] }),
    'GET /stocks': () => ({ items: stocks }),
  })
  return api
}

describe('Held marker on the list page and the stock page', () => {
  it('TC-C-412: the list page has the Held column after Sector, with the badge and the shares', async () => {
    renderApp('/lists/core', listApi([nvda, pttep, aapl]))

    const table = await screen.findByRole('table')
    const headers = within(table).getAllByRole('columnheader').map((h) => h.textContent?.trim())
    expect(headers.indexOf('Held')).toBe(headers.indexOf('Sector') + 1)
    expect(headers).not.toContain('Lists')
    const row = (t: string) => within(table).getByRole('link', { name: t }).closest('tr') as HTMLElement
    expect(within(row('NVDA')).getByText('Held')).toBeInTheDocument()
    expect(within(row('NVDA')).getByText('120.5')).toBeInTheDocument()
    expect(within(row('PTTEP')).getByText('Held')).toBeInTheDocument()
    expect(within(row('AAPL')).getByText('Not held')).toHaveClass('sr-only')
  })

  it('TC-C-412: the stock page shows Held with the shares when known, and Held alone when not', async () => {
    const { unmount } = renderApp(`/stocks/${nvda.id}`, new StubApi({ 'GET /stocks': { items: [nvda] }, 'GET /lists': { items: [] }, [`GET /stocks/${nvda.id}`]: nvda }))
    const card = (await screen.findByRole('heading', { level: 2, name: 'Holding' })).closest('[data-slot="card"]') as HTMLElement
    expect(within(card).getByText('Held')).toBeInTheDocument()
    expect(within(card).getByText('120.5')).toBeInTheDocument()
    unmount()

    renderApp(`/stocks/${pttep.id}`, new StubApi({ 'GET /stocks': { items: [pttep] }, 'GET /lists': { items: [] }, [`GET /stocks/${pttep.id}`]: pttep }))
    const card2 = (await screen.findByRole('heading', { level: 2, name: 'Holding' })).closest('[data-slot="card"]') as HTMLElement
    expect(within(card2).getByText('Held')).toBeInTheDocument()
    expect(within(card2).getByText('Amount not entered.')).toBeInTheDocument()
  })

  it('TC-C-412: Remove from list and its Undo still work with the Held column', async () => {
    const stocks = [{ ...nvda }, aapl]
    const api = listApi(stocks)
    api.on(`DELETE /lists/core/stocks/${nvda.id}`, () => {
      stocks[0] = { ...nvda, listIds: [] }
    })
    api.on('POST /lists/core/stocks', () => {
      stocks[0] = { ...nvda, listIds: ['core'] }
      return { listId: 'core', stockId: nvda.id, addedAt: 'x' }
    })
    renderApp('/lists/core', api)

    await userEvent.click(await screen.findByRole('button', { name: 'Remove NVDA from Core holdings' }))
    await waitFor(() => expect(api.callsTo(`DELETE /lists/core/stocks/${nvda.id}`)).toHaveLength(1))
    await waitFor(() => expect(screen.queryByRole('link', { name: 'NVDA' })).not.toBeInTheDocument())
    const [, options] = vi.mocked(toast).mock.calls.at(-1) as unknown as [string, { action: { onClick: () => void } }]
    options.action.onClick()

    await waitFor(() => expect(api.callsTo('POST /lists/core/stocks')[0]?.body).toEqual({ stockId: nvda.id }))
    const row = (await screen.findByRole('link', { name: 'NVDA' })).closest('tr') as HTMLElement
    expect(within(row).getByText('Held')).toBeInTheDocument()
  })
})
