import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/api-client'
import { renderApp } from '@/test/render-app'
import { makeList, makeStock } from '@/test/stock-fixtures'
import { StubApi } from '@/test/stub-api'
import { toast } from 'sonner'

vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }), Toaster: () => null }))

const lists = [makeList('core', 'Core holdings', 2), makeList('watch', 'Watching'), makeList('swing', 'Swing')]

const nvda = makeStock({
  ticker: 'NVDA',
  name: 'NVIDIA Corporation',
  indexMembership: ['S&P 500', 'Nasdaq-100'],
  gicsSector: 'Information Technology',
  economicCycle: 'Sensitive',
  style: 'Growth',
  size: 'Mega',
  themes: ['AI', 'Data center'],
  lensSources: { economicCycle: 'default', style: 'manual' },
  listIds: ['core', 'watch'],
})

function detailApi(stock = nvda, listItems = lists) {
  return new StubApi({
    [`GET /stocks/${stock.id}`]: stock,
    [`GET /stocks/${stock.id}/theses`]: { items: [] },
    'GET /lists': { items: listItems },
    'GET /stocks': { items: [stock] },
  })
}

const lensList = () => screen.getByRole('heading', { name: 'Classification' }).closest('[data-slot="card"]') as HTMLElement
const listsCard = () => screen.getByRole('heading', { name: 'Lists' }).closest('[data-slot="card"]') as HTMLElement

beforeEach(() => {
  vi.mocked(toast.success).mockClear()
  vi.mocked(toast.error).mockClear()
})

describe('stock detail: classification', () => {
  it('TC-U-083: marks only defaulted lenses with a Default badge', async () => {
    renderApp(`/stocks/${nvda.id}`, detailApi())
    await screen.findByRole('heading', { level: 1, name: /NVDA/ })
    const badges = screen.getAllByText('Default')
    expect(badges).toHaveLength(1)
    const dd = badges[0]?.closest('dd') as HTMLElement
    const term = dd.previousElementSibling as HTMLElement
    expect(term.tagName).toBe('DT')
    expect(term).toHaveTextContent('Economic cycle')
    expect(dd).toHaveTextContent('Sensitive')
  })

  it('TC-C-120: shows the identity line and every lens as dt/dd with unset values as a dash', async () => {
    renderApp(`/stocks/${nvda.id}`, detailApi())
    expect(await screen.findByText('US · NASDAQ · USD · S&P 500, Nasdaq-100')).toBeInTheDocument()
    const card = within(lensList())
    for (const label of [
      'Sector',
      'Value chain',
      'Economic cycle',
      'Size',
      'Style',
      'Lynch type',
      'Life cycle',
      'Customers',
      'Revenue types',
      'Moat',
      'Themes',
      'Volatility',
    ])
      expect(card.getByText(label).tagName).toBe('DT')
    expect(card.getByText('Information Technology').tagName).toBe('DD')
    expect(card.getByText('AI')).toBeInTheDocument()
    expect(card.getByText('Data center')).toBeInTheDocument()
    const moat = card.getByText('Moat').nextElementSibling as HTMLElement
    expect(moat).toHaveTextContent('—not set')
    expect(within(moat).getByText('not set')).toHaveClass('sr-only')
  })

  it('TC-C-120: a TH stock shows its SET group and the value chain with its position', async () => {
    const pttep = makeStock({
      ticker: 'PTTEP',
      market: 'TH',
      exchange: 'SET',
      currency: 'THB',
      indexMembership: ['SET50'],
      gicsSector: 'Energy',
      setIndustryGroup: 'Resources',
      valueChain: 'Oil & Gas',
      valueChainPosition: 'Upstream',
      customers: ['B2B'],
      revenueTypes: ['Product sale'],
    })
    renderApp(`/stocks/${pttep.id}`, detailApi(pttep))
    expect(await screen.findByText('TH · SET · THB · SET50')).toBeInTheDocument()
    const card = within(lensList())
    expect(card.getByText('Sector').nextElementSibling).toHaveTextContent('Energy')
    expect(card.getByText('Sector').nextElementSibling).toHaveTextContent('Resources')
    expect(card.getByText('Value chain').nextElementSibling).toHaveTextContent('Oil & Gas · Upstream')
    expect(card.getByText('Customers').nextElementSibling).toHaveTextContent('B2B')
    expect(card.getByText('Revenue types').nextElementSibling).toHaveTextContent('Product sale')
  })

  it('TC-C-120: a stock with no lenses shows a dash everywhere and no badge', async () => {
    const msft = makeStock({ ticker: 'MSFT' })
    renderApp(`/stocks/${msft.id}`, detailApi(msft))
    await screen.findByText('US · NASDAQ · USD')
    expect(screen.queryByText('Default')).not.toBeInTheDocument()
    expect(within(lensList()).getAllByText('not set')).toHaveLength(12)
  })

  it('TC-C-101: the breadcrumb and title show the ticker from the loader', async () => {
    renderApp(`/stocks/${nvda.id}`, detailApi())
    const trail = within(await screen.findByRole('navigation', { name: 'breadcrumb' }))
    expect(trail.getByRole('link', { name: 'Stocks' })).toHaveAttribute('href', '/stocks')
    expect(trail.getByText('NVDA')).toHaveAttribute('aria-current', 'page')
    expect(document.title).toBe('NVDA · Investhesis')
    expect(screen.getByRole('heading', { level: 1 })).toHaveFocus()
    expect(screen.getByRole('link', { name: 'Edit' })).toHaveAttribute('href', `/stocks/${nvda.id}/edit`)
  })

  it('TC-C-124: the Default badge explains itself on keyboard focus', async () => {
    renderApp(`/stocks/${nvda.id}`, detailApi())
    const badge = await screen.findByText('Default')
    await userEvent.tab()
    badge.focus()
    expect(await screen.findAllByText('Set from the sector. Pick a value to override.')).not.toHaveLength(0)
  })

  it('TC-C-181: Thai text renders unchanged on the detail page', async () => {
    const thai = makeStock({ ticker: 'PTTEP', name: 'บมจ. ปตท. สำรวจและผลิตปิโตรเลียม', themes: ['พลังงาน'], listIds: ['th'] })
    renderApp(`/stocks/${thai.id}`, detailApi(thai, [makeList('th', 'หุ้นหลัก')]))
    await screen.findByRole('heading', { level: 1 })
    expect(screen.getByText('บมจ. ปตท. สำรวจและผลิตปิโตรเลียม').textContent).toBe('บมจ. ปตท. สำรวจและผลิตปิโตรเลียม')
    expect(within(lensList()).getByText('พลังงาน').textContent).toBe('พลังงาน')
    expect(within(listsCard()).getByText('หุ้นหลัก').textContent).toBe('หุ้นหลัก')
  })
})

describe('stock detail: lists', () => {
  it('TC-U-084: offers only the lists the stock is not in and adds to the chosen one', async () => {
    const api = detailApi(makeStock({ ticker: 'NVDA', listIds: ['core'] }))
    api.on('POST /lists/watch/stocks', { listId: 'watch', stockId: 's-NVDA', addedAt: 'x' })
    renderApp('/stocks/s-NVDA', api)
    await userEvent.click(await screen.findByRole('button', { name: /Add to list/ }))
    const options = screen.getAllByRole('option').map((o) => o.textContent)
    expect(options).toEqual(['Swing', 'Watching'])

    await userEvent.click(screen.getByRole('option', { name: 'Watching' }))

    await waitFor(() => expect(api.callsTo('POST /lists/watch/stocks')).toHaveLength(1))
    expect(api.callsTo('POST /lists/watch/stocks')[0]?.body).toEqual({ stockId: 's-NVDA' })
  })

  it('TC-C-122: says so when the stock is in every list and when no lists exist', async () => {
    const all = makeStock({ ticker: 'NVDA', listIds: ['core', 'watch', 'swing'] })
    const { unmount } = renderApp('/stocks/s-NVDA', detailApi(all))
    await userEvent.click(await screen.findByRole('button', { name: /Add to list/ }))
    expect(screen.getByText('In every list')).toBeInTheDocument()
    unmount()

    renderApp('/stocks/s-NVDA', detailApi(makeStock({ ticker: 'NVDA' }), []))
    await userEvent.click(await screen.findByRole('button', { name: /Add to list/ }))
    expect(screen.getByRole('link', { name: /Create a list/ })).toHaveAttribute('href', '/lists')
  })

  it('TC-C-122: filters by text, shows an empty message and picks with the keyboard', async () => {
    const api = detailApi(makeStock({ ticker: 'NVDA' }))
    api.on('POST /lists/swing/stocks', { listId: 'swing', stockId: 's-NVDA', addedAt: 'x' })
    renderApp('/stocks/s-NVDA', api)
    await userEvent.click(await screen.findByRole('button', { name: /Add to list/ }))
    await userEvent.keyboard('zzz')
    expect(screen.getByText('No lists match.')).toBeInTheDocument()
    await userEvent.clear(screen.getByRole('combobox'))
    await userEvent.keyboard('swi{Enter}')
    await waitFor(() => expect(api.callsTo('POST /lists/swing/stocks')).toHaveLength(1))
  })

  it('TC-C-122: Esc closes the popover and returns focus to its trigger', async () => {
    renderApp('/stocks/s-NVDA', detailApi(makeStock({ ticker: 'NVDA' })))
    const trigger = await screen.findByRole('button', { name: /Add to list/ })
    await userEvent.click(trigger)
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('option')).not.toBeInTheDocument())
    expect(trigger).toHaveFocus()
  })

  it('TC-C-122: a 409 on add refreshes and tells the user; a 404 shows an error', async () => {
    const api = detailApi(makeStock({ ticker: 'NVDA' }))
    api.on('POST /lists/watch/stocks', () => {
      throw new ApiError(409, { code: 'already_in_list' })
    })
    api.on('POST /lists/swing/stocks', () => {
      throw new ApiError(404, { code: 'not_found' })
    })
    renderApp('/stocks/s-NVDA', api)
    await userEvent.click(await screen.findByRole('button', { name: /Add to list/ }))
    await userEvent.click(screen.getByRole('option', { name: 'Watching' }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Already in Watching. The page was refreshed.'))
    await waitFor(() => expect(api.callsTo('GET /stocks/s-NVDA').length).toBeGreaterThan(1))

    await userEvent.click(screen.getByRole('button', { name: /Add to list/ }))
    await userEvent.click(screen.getByRole('option', { name: 'Swing' }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Swing no longer exists.'))
  })

  it('TC-U-085: removing from a list asks the API, then Undo puts it back', async () => {
    const api = detailApi(makeStock({ ticker: 'NVDA', listIds: ['core'] }))
    api.on('DELETE /lists/core/stocks/s-NVDA', undefined)
    api.on('POST /lists/core/stocks', { listId: 'core', stockId: 's-NVDA', addedAt: 'x' })
    renderApp('/stocks/s-NVDA', api)

    await userEvent.click(await screen.findByRole('button', { name: 'Remove from Core holdings' }))

    await waitFor(() => expect(api.callsTo('DELETE /lists/core/stocks/s-NVDA')).toHaveLength(1))
    await waitFor(() => expect(toast).toHaveBeenCalled())
    const [message, options] = vi.mocked(toast).mock.calls.at(-1) as unknown as [string, { action: { label: string; onClick: () => void } }]
    expect(message).toBe('Removed from Core holdings')
    expect(options.action.label).toBe('Undo')

    options.action.onClick()

    await waitFor(() => expect(api.callsTo('POST /lists/core/stocks')).toHaveLength(1))
    expect(api.callsTo('POST /lists/core/stocks')[0]?.body).toEqual({ stockId: 's-NVDA' })
  })

  it('TC-C-123: Undo that meets a 409 counts as done; a 500 shows an error', async () => {
    const api = detailApi(makeStock({ ticker: 'NVDA', listIds: ['core'] }))
    api.on('DELETE /lists/core/stocks/s-NVDA', undefined)
    let status = 409
    api.on('POST /lists/core/stocks', () => {
      throw new ApiError(status, { code: 'x' })
    })
    renderApp('/stocks/s-NVDA', api)
    await userEvent.click(await screen.findByRole('button', { name: 'Remove from Core holdings' }))
    await waitFor(() => expect(toast).toHaveBeenCalled())
    const undo = () =>
      (vi.mocked(toast).mock.calls.at(-1) as unknown as [string, { action: { onClick: () => void } }])[1].action.onClick()

    undo()
    await waitFor(() => expect(api.callsTo('POST /lists/core/stocks')).toHaveLength(1))
    expect(toast.error).not.toHaveBeenCalled()

    status = 500
    undo()
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Couldn't undo. Add the stock to the list again."))
  })

  it('TC-C-123: a DELETE 404 (already removed) refreshes without a crash', async () => {
    const api = detailApi(makeStock({ ticker: 'NVDA', listIds: ['core'] }))
    api.on('DELETE /lists/core/stocks/s-NVDA', () => {
      throw new ApiError(404, { code: 'not_found' })
    })
    renderApp('/stocks/s-NVDA', api)
    await userEvent.click(await screen.findByRole('button', { name: 'Remove from Core holdings' }))
    await waitFor(() => expect(api.callsTo('GET /stocks/s-NVDA').length).toBeGreaterThan(1))
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
  })
})

describe('stock detail: delete', () => {
  async function openDelete() {
    const more = await screen.findByRole('button', { name: 'More actions' })
    await userEvent.click(more)
    await userEvent.click(await screen.findByRole('menuitem', { name: /Delete/ }))
    return { more, dialog: await screen.findByRole('alertdialog') }
  }

  it.each([
    [2, "It will be removed from 2 lists. This can't be undone."],
    [1, "It will be removed from 1 list. This can't be undone."],
    [0, "This can't be undone."],
  ])('TC-C-121: with %i lists the dialog asks "Delete NVDA?" then says %s, focus on Cancel', async (count, text) => {
    const ids = ['core', 'watch'].slice(0, count)
    renderApp('/stocks/s-NVDA', detailApi(makeStock({ ticker: 'NVDA', listIds: ids })))
    const { dialog } = await openDelete()
    expect(within(dialog).getByRole('heading', { name: 'Delete NVDA?' })).toBeInTheDocument()
    expect(within(dialog).getByText(text)).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus()
    const confirm = within(dialog).getByRole('button', { name: 'Delete' })
    expect(confirm).toHaveAttribute('data-variant', 'destructive')
    // Light theme: white on the destructive colour (5.2:1); the tinted variant measures 4.3:1 and fails AA.
    expect(confirm).toHaveClass('bg-destructive', 'text-white')
  })

  it('TC-C-121: Esc and Cancel close with no request and return focus to More', async () => {
    const api = detailApi()
    renderApp(`/stocks/${nvda.id}`, api)
    let { more } = await openDelete()
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    await waitFor(() => expect(more).toHaveFocus())

    ;({ more } = await openDelete())
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    await waitFor(() => expect(more).toHaveFocus())
    expect(api.callsTo(`DELETE /stocks/${nvda.id}`)).toHaveLength(0)
  })

  it('TC-C-121: confirm deletes once even on double click, goes to /stocks and toasts', async () => {
    const api = detailApi()
    api.on(`DELETE /stocks/${nvda.id}`, undefined)
    const { router } = renderApp(`/stocks/${nvda.id}`, api)
    const { dialog } = await openDelete()

    await userEvent.dblClick(within(dialog).getByRole('button', { name: 'Delete' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/stocks'))
    expect(api.callsTo(`DELETE /stocks/${nvda.id}`)).toHaveLength(1)
    expect(toast.success).toHaveBeenCalledWith('NVDA deleted')
  })

  it('TC-C-121: a 500 keeps the stock and the dialog, shows an alert and allows a retry', async () => {
    const api = detailApi()
    let fail = true
    api.on(`DELETE /stocks/${nvda.id}`, () => {
      if (fail) throw new ApiError(500, { code: 'internal_error' })
    })
    const { router } = renderApp(`/stocks/${nvda.id}`, api)
    const { dialog } = await openDelete()

    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete' }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent("Couldn't delete NVDA")
    expect(router.state.location.pathname).toBe(`/stocks/${nvda.id}`)
    expect(within(dialog).getByRole('button', { name: 'Delete' })).toBeEnabled()

    fail = false
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/stocks'))
  })
})

describe('stock detail: not found', () => {
  it('TC-U-086: an unknown id shows the not-found page with a link to /stocks', async () => {
    renderApp('/stocks/x', new StubApi({ 'GET /lists': { items: [] } }))
    expect(await screen.findByRole('heading', { name: 'Not found' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Go to stocks' })).toHaveAttribute('href', '/stocks')
  })
})
