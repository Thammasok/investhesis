import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/api-client'
import { renderApp } from '@/test/render-app'
import { makeList, makeStock } from '@/test/stock-fixtures'
import { StubApi } from '@/test/stub-api'
import type { Stock } from '@/features/stocks/types'
import { toast } from 'sonner'

vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }), Toaster: () => null }))

beforeEach(() => {
  vi.mocked(toast).mockClear()
  vi.mocked(toast.success).mockClear()
  vi.mocked(toast.error).mockClear()
})

/** The page header holds the total count; the result line under the toolbar repeats it, so scope to the header. */
const pageHeader = () => screen.getByRole('heading', { level: 1 }).closest('header') as HTMLElement

const aapl = makeStock({ ticker: 'AAPL', name: 'Apple Inc.', listIds: ['core'], gicsSector: 'Information Technology' })
const msft = makeStock({ ticker: 'MSFT', name: 'Microsoft Corporation' })
const pttep = makeStock({ ticker: 'PTTEP', name: 'บมจ. ปตท. สำรวจและผลิตปิโตรเลียม', market: 'TH', exchange: 'SET' })

/** `GET /lists/core` and `GET /stocks` answer from live arrays so revalidation shows changes. */
function detailApi(stocks: Stock[] = [aapl, msft, pttep], listName = 'Core holdings') {
  const count = () => stocks.filter((s) => s.listIds.includes('core')).length
  return new StubApi({
    'GET /lists/core': () => makeList('core', listName, count()),
    'GET /lists': () => ({ items: [makeList('core', listName, count())] }),
    'GET /stocks': () => ({ items: stocks }),
  })
}

describe('list detail: page', () => {
  it('TC-C-154: shows the name, the count and the shared table without a Lists column, with remove buttons', async () => {
    renderApp('/lists/core', detailApi())
    expect(await screen.findByRole('heading', { level: 1, name: 'Core holdings' })).toBeInTheDocument()
    expect(within(pageHeader()).getByText('1 stock')).toBeInTheDocument()
    const table = screen.getByRole('table')
    expect(within(table).queryByRole('columnheader', { name: 'Lists' })).not.toBeInTheDocument()
    expect(within(table).getByRole('link', { name: 'AAPL' })).toHaveAttribute('href', `/stocks/${aapl.id}`)
    expect(within(table).queryByText('MSFT')).not.toBeInTheDocument()
    expect(within(table).getByRole('button', { name: 'Remove AAPL from Core holdings' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Add stock/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Rename' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'More actions' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Import into it/ })).toHaveAttribute('href', '/import-export/import?listId=core')
  })

  it('TC-C-154: the breadcrumb shows the list name and the tab title follows', async () => {
    renderApp('/lists/core', detailApi())
    await screen.findByRole('heading', { level: 1, name: 'Core holdings' })
    const nav = screen.getByRole('navigation', { name: 'breadcrumb' })
    expect(within(nav).getByRole('link', { name: 'Lists' })).toHaveAttribute('href', '/lists')
    expect(within(nav).getByText('Core holdings')).toHaveAttribute('aria-current', 'page')
    expect(document.title).toBe('Core holdings · Investhesis')
  })

  it('TC-C-154: 22 stocks are counted in the plural', async () => {
    const many = Array.from({ length: 22 }, (_, i) => makeStock({ ticker: `T${i}`, listIds: ['core'] }))
    renderApp('/lists/core', detailApi(many))
    await screen.findByRole('table')
    expect(within(pageHeader()).getByText('22 stocks')).toBeInTheDocument()
  })

  it('TC-C-154: an unknown id shows the not-found page with a link to /lists', async () => {
    renderApp('/lists/nope', new StubApi({ 'GET /stocks': { items: [] }, 'GET /lists': { items: [] } }))
    expect(await screen.findByRole('heading', { name: 'Not found' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Go to lists' })).toHaveAttribute('href', '/lists')
  })

  it('TC-C-181: Thai stock names render unchanged', async () => {
    renderApp('/lists/core', detailApi([{ ...pttep, listIds: ['core'] }]))
    expect(await screen.findByText(pttep.name)).toBeInTheDocument()
  })
})

describe('list detail: empty', () => {
  it('TC-U-104: says the list is empty with Add stock and a link to import into it', async () => {
    renderApp('/lists/core', detailApi([msft]))
    expect(await screen.findByText('This list is empty.')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /Add stock/ })).toHaveLength(1)
    expect(screen.getAllByRole('link', { name: /Import into it/ })).toHaveLength(1)
    expect(screen.getByRole('link', { name: /Import into it/ })).toHaveAttribute('href', '/import-export/import?listId=core')
    expect(screen.getByText('0 stocks')).toBeInTheDocument()
  })
})

describe('list detail: add stock', () => {
  async function openPicker() {
    const trigger = await screen.findByRole('button', { name: /Add stock/ })
    await userEvent.click(trigger)
    return trigger
  }

  it('TC-U-103: excludes members, filters by text and adds the chosen stock', async () => {
    const stocks = [aapl, msft, pttep]
    const api = detailApi(stocks)
    api.on('POST /lists/core/stocks', ({ body }: { body: unknown }) => {
      const id = (body as { stockId: string }).stockId
      const i = stocks.findIndex((s) => s.id === id)
      stocks[i] = { ...(stocks[i] as Stock), listIds: ['core'] }
      return { listId: 'core', stockId: id, addedAt: 'x' }
    })
    renderApp('/lists/core', api)
    await openPicker()
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([
      expect.stringContaining('MSFT'),
      expect.stringContaining('PTTEP'),
    ])
    await userEvent.keyboard('pt')
    expect(screen.getAllByRole('option')).toHaveLength(1)

    await userEvent.click(screen.getByRole('option', { name: /PTTEP/ }))

    await waitFor(() => expect(api.callsTo('POST /lists/core/stocks')).toHaveLength(1))
    expect(api.callsTo('POST /lists/core/stocks')[0]?.body).toEqual({ stockId: pttep.id })
    // The toast is raised after the POST resolves, so it can land a tick after the request is logged.
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Added PTTEP to Core holdings'))
    await screen.findByRole('table')
    expect(within(pageHeader()).getByText('2 stocks')).toBeInTheDocument()
    expect(within(screen.getByRole('table')).getByRole('link', { name: 'PTTEP' })).toBeInTheDocument()
  })

  it('TC-C-155: matches ticker and name case-insensitively, Thai substrings, and shows ticker, name and market', async () => {
    renderApp('/lists/core', detailApi())
    await openPicker()
    const options = screen.getAllByRole('option')
    expect(options[0]).toHaveTextContent('MSFT')
    expect(options[0]).toHaveTextContent('Microsoft Corporation')
    expect(options[0]).toHaveTextContent('US')
    expect(options[1]).toHaveTextContent('TH')

    const input = screen.getByRole('combobox')
    await userEvent.type(input, 'MICRO')
    expect(screen.getAllByRole('option')).toHaveLength(1)
    await userEvent.clear(input)
    await userEvent.type(input, 'ปตท')
    expect(screen.getAllByRole('option')).toHaveLength(1)
    expect(screen.getByRole('option')).toHaveTextContent('PTTEP')
    await userEvent.clear(input)
    await userEvent.type(input, 'zzz')
    expect(screen.getByText('No stocks match.')).toBeInTheDocument()
  })

  it('TC-C-155: says so when every saved stock is in the list, and links to /stocks/new with no stocks at all', async () => {
    const { unmount } = renderApp('/lists/core', detailApi([{ ...aapl }]))
    await openPicker()
    expect(screen.getByText('All saved stocks are in this list')).toBeInTheDocument()
    unmount()

    renderApp('/lists/core', detailApi([]))
    await openPicker()
    expect(screen.getByRole('link', { name: /Add a stock/ })).toHaveAttribute('href', '/stocks/new')
  })

  it('TC-C-155: picks with the keyboard and Esc closes the popover returning focus to the trigger', async () => {
    const api = detailApi()
    api.on('POST /lists/core/stocks', { listId: 'core', stockId: msft.id, addedAt: 'x' })
    renderApp('/lists/core', api)
    const trigger = await openPicker()
    await userEvent.keyboard('{ArrowDown}{Enter}')
    await waitFor(() => expect(api.callsTo('POST /lists/core/stocks')).toHaveLength(1))
    expect(api.callsTo('POST /lists/core/stocks')[0]?.body).toEqual({ stockId: pttep.id })

    await userEvent.click(trigger)
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('option')).not.toBeInTheDocument())
    expect(trigger).toHaveFocus()
  })

  it('TC-C-155: a 409 refreshes the table without a crash and tells the user', async () => {
    const api = detailApi()
    api.on('POST /lists/core/stocks', () => {
      throw new ApiError(409, { code: 'already_in_list' })
    })
    renderApp('/lists/core', api)
    await openPicker()
    await userEvent.click(screen.getByRole('option', { name: /MSFT/ }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('MSFT is already in Core holdings. The page was refreshed.'))
    await waitFor(() => expect(api.callsTo('GET /lists/core').length).toBeGreaterThan(1))
    expect(screen.getByRole('heading', { level: 1, name: 'Core holdings' })).toBeInTheDocument()
  })
})

describe('list detail: remove with Undo', () => {
  it('TC-C-156: removes, then Undo posts the same stock id and the count returns', async () => {
    const stocks = [{ ...aapl }, msft]
    const api = detailApi(stocks)
    api.on(`DELETE /lists/core/stocks/${aapl.id}`, () => {
      stocks[0] = { ...aapl, listIds: [] }
    })
    api.on('POST /lists/core/stocks', () => {
      stocks[0] = { ...aapl, listIds: ['core'] }
      return { listId: 'core', stockId: aapl.id, addedAt: 'x' }
    })
    renderApp('/lists/core', api)
    await userEvent.click(await screen.findByRole('button', { name: 'Remove AAPL from Core holdings' }))

    await waitFor(() => expect(api.callsTo(`DELETE /lists/core/stocks/${aapl.id}`)).toHaveLength(1))
    expect(await screen.findByText('0 stocks')).toBeInTheDocument()
    await waitFor(() => expect(toast).toHaveBeenCalled())
    const [message, options] = vi.mocked(toast).mock.calls.at(-1) as unknown as [string, { action: { label: string; onClick: () => void } }]
    expect(message).toBe('Removed AAPL from Core holdings')
    expect(options.action.label).toBe('Undo')

    options.action.onClick()

    await waitFor(() => expect(api.callsTo('POST /lists/core/stocks')).toHaveLength(1))
    expect(api.callsTo('POST /lists/core/stocks')[0]?.body).toEqual({ stockId: aapl.id })
    await screen.findByRole('table')
    expect(within(pageHeader()).getByText('1 stock')).toBeInTheDocument()
  })

  it('TC-C-156: ignoring the toast leaves the stock removed; a failed Undo shows an error; a 404 remove refreshes', async () => {
    const api = detailApi()
    api.on(`DELETE /lists/core/stocks/${aapl.id}`, () => undefined)
    api.on('POST /lists/core/stocks', () => {
      throw new ApiError(500, { code: 'x' })
    })
    renderApp('/lists/core', api)
    await userEvent.click(await screen.findByRole('button', { name: 'Remove AAPL from Core holdings' }))
    await waitFor(() => expect(toast).toHaveBeenCalled())
    ;(vi.mocked(toast).mock.calls.at(-1) as unknown as [string, { action: { onClick: () => void } }])[1].action.onClick()
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Couldn't undo. Add AAPL to the list again."))
  })

  it('TC-C-156: removing a stock that is already gone refreshes with a message', async () => {
    const api = detailApi()
    api.on(`DELETE /lists/core/stocks/${aapl.id}`, () => {
      throw new ApiError(404, { code: 'not_found' })
    })
    renderApp('/lists/core', api)
    await userEvent.click(await screen.findByRole('button', { name: 'Remove AAPL from Core holdings' }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('AAPL is already removed from Core holdings. The page was refreshed.'))
    await waitFor(() => expect(api.callsTo('GET /lists/core').length).toBeGreaterThan(1))
  })
})

describe('list detail: rename and delete', () => {
  it('TC-C-152: Rename from the page sends PATCH and the heading and breadcrumb follow', async () => {
    let name = 'Core holdings'
    const api = detailApi()
    api.on('GET /lists/core', () => makeList('core', name, 1))
    api.on('PATCH /lists/core', ({ body }: { body: unknown }) => {
      name = (body as { name: string }).name
      return makeList('core', name, 1)
    })
    renderApp('/lists/core', api)
    const trigger = await screen.findByRole('button', { name: 'Rename' })
    await userEvent.click(trigger)
    const dialog = await screen.findByRole('dialog', { name: 'Rename list' })
    const input = within(dialog).getByRole('textbox', { name: /Name/ })
    await userEvent.clear(input)
    await userEvent.type(input, 'Long term{Enter}')
    expect(await screen.findByRole('heading', { level: 1, name: 'Long term' })).toBeInTheDocument()
    expect(within(screen.getByRole('navigation', { name: 'breadcrumb' })).getByText('Long term')).toBeInTheDocument()
    expect(toast.success).toHaveBeenCalledWith('List renamed')
  })

  it('TC-C-152: Esc on Rename returns focus to the Rename button', async () => {
    renderApp('/lists/core', detailApi())
    const trigger = await screen.findByRole('button', { name: 'Rename' })
    await userEvent.click(trigger)
    await screen.findByRole('dialog')
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await waitFor(() => expect(trigger).toHaveFocus())
  })

  it('TC-C-153: Delete from the ⋯ menu confirms, deletes, toasts and goes to /lists', async () => {
    const api = detailApi()
    api.on('DELETE /lists/core', () => undefined)
    const { router } = renderApp('/lists/core', api)
    const more = await screen.findByRole('button', { name: 'More actions' })
    await userEvent.click(more)
    await userEvent.click(await screen.findByRole('menuitem', { name: /Delete/ }))
    const dialog = await screen.findByRole('alertdialog')
    expect(within(dialog).getByText('Its 1 stock stays saved.')).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus()

    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/lists'))
    expect(api.callsTo('DELETE /lists/core')).toHaveLength(1)
    expect(toast.success).toHaveBeenCalledWith('Core holdings deleted')
  })

  it('TC-C-153: Esc on the delete dialog returns focus to the ⋯ button', async () => {
    renderApp('/lists/core', detailApi())
    const more = await screen.findByRole('button', { name: 'More actions' })
    await userEvent.click(more)
    await userEvent.click(await screen.findByRole('menuitem', { name: /Delete/ }))
    await screen.findByRole('alertdialog')
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    await waitFor(() => expect(more).toHaveFocus())
  })
})
