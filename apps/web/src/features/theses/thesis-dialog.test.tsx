import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { toast } from 'sonner'
import { ApiError } from '@/lib/api-client'
import { renderApp } from '@/test/render-app'
import { makeList, makeStock, makeThesis } from '@/test/stock-fixtures'
import { StubApi } from '@/test/stub-api'
import { localToday } from './thesis-form-model'

vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }), Toaster: () => null }))

beforeEach(() => {
  vi.mocked(toast.success).mockClear()
  vi.mocked(toast).mockClear()
})
afterEach(() => vi.useRealTimers())

const thb = makeStock({ ticker: 'PTT', name: 'PTT PCL', market: 'TH', exchange: 'SET', currency: 'THB', gicsSector: 'Energy', setIndustryGroup: 'Resources' })
const usd = makeStock({ ticker: 'NVDA', name: 'NVIDIA Corporation', gicsSector: 'Information Technology' })
const entryRoutes = (stock: typeof usd, theses: () => unknown) => ({
  'GET /lists': { items: [makeList('core', 'Core')] },
  'GET /stocks': { items: [stock] },
  [`GET /stocks/${stock.id}`]: stock,
  [`GET /stocks/${stock.id}/theses`]: () => ({ items: theses() }),
})
const dialog = (name: RegExp = /thesis entry/) => screen.getByRole('dialog', { name })
const field = (name: RegExp) => within(dialog()).getByRole('textbox', { name })
const lastBody = (api: StubApi, route: string) => api.callsTo(route).at(-1)?.body

describe('thesis dialog: add', () => {
  it('TC-U-800: add an entry', async () => {
    const user = userEvent.setup()
    let list: unknown[] = []
    const created = makeThesis({ id: 'new-1', stockId: thb.id, type: 'sell', date: localToday(), note: 'Valuation stretched', targetPrice: '42.2500' })
    const api = new StubApi({
      ...entryRoutes(thb, () => list),
      [`POST /stocks/${thb.id}/theses`]: () => {
        list = [created]
        return created
      },
    })
    renderApp(`/stocks/${thb.id}`, api)

    await user.click(await screen.findByRole('button', { name: 'Add first entry' }))
    expect(dialog(/Add thesis entry · PTT/)).toBeInTheDocument()
    expect(within(dialog()).getByText('฿')).toBeInTheDocument()
    await user.click(within(dialog()).getByRole('radio', { name: 'Sell' }))
    await user.type(field(/^Thesis/), 'Valuation stretched')
    await user.type(field(/^Target price/), '42.25')
    await user.click(within(dialog()).getByRole('button', { name: 'Add entry' }))

    await waitFor(() => expect(api.callsTo(`POST /stocks/${thb.id}/theses`)).toHaveLength(1))
    expect(lastBody(api, `POST /stocks/${thb.id}/theses`)).toEqual({ type: 'sell', date: localToday(), note: 'Valuation stretched', targetPrice: '42.25' })
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Entry added'))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await waitFor(() => expect(screen.getByRole('button', { name: 'Add entry' })).toHaveFocus())
    expect(screen.getByText('Valuation stretched')).toBeInTheDocument()
  })

  it('TC-U-801: client validation runs before any request', async () => {
    const user = userEvent.setup()
    const api = new StubApi(entryRoutes(usd, () => []))
    renderApp(`/stocks/${usd.id}`, api)

    await user.click(await screen.findByRole('button', { name: 'Add first entry' }))
    await user.type(field(/^Target price/), '1.23456')
    await user.click(within(dialog()).getByRole('button', { name: 'Add entry' }))

    expect(api.callsTo(`POST /stocks/${usd.id}/theses`)).toHaveLength(0)
    expect(within(dialog()).getByText('Type is required')).toBeInTheDocument()
    expect(within(dialog()).getByText(/^Thesis must be 1-10,000 characters/)).toBeInTheDocument()
    expect(within(dialog()).getByText(/^Target price must be greater than 0/)).toBeInTheDocument()
    expect(within(dialog()).getAllByRole('radio')[0]).toHaveFocus()
    expect(field(/^Thesis/)).toHaveAttribute('aria-invalid', 'true')
  })

  it('TC-U-802: the date picker stops future dates', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 10, 24, 12, 0, 0))
    const user = userEvent.setup()
    renderApp(`/stocks/${usd.id}`, new StubApi(entryRoutes(usd, () => [])))

    await user.click(await screen.findByRole('button', { name: 'Add first entry' }))
    const date = within(dialog()).getByLabelText('Date') as HTMLInputElement
    expect(date.value).toBe('2026-11-24')
    expect(date).toHaveAttribute('max', '2026-11-24')
    await user.click(within(dialog()).getByRole('radio', { name: 'Buy' }))
    await user.type(field(/^Thesis/), 'x')
    fireEvent.change(date, { target: { value: '2026-11-25' } })
    await user.click(within(dialog()).getByRole('button', { name: 'Add entry' }))

    expect(await within(dialog()).findByText("The date can't be in the future.")).toBeInTheDocument()
    expect(date).toHaveFocus()
  })

  it('TC-U-806: the counter counts code points', async () => {
    const user = userEvent.setup()
    renderApp(`/stocks/${usd.id}`, new StubApi(entryRoutes(usd, () => [])))

    await user.click(await screen.findByRole('button', { name: 'Add first entry' }))
    expect(within(dialog()).getByText('0 / 10,000')).toBeInTheDocument()
    await user.type(field(/^Thesis/), '😀😀😀')
    expect(within(dialog()).getByText('3 / 10,000')).toBeInTheDocument()
    expect(within(dialog()).getByText('0 / 2,000')).toBeInTheDocument()
  })

  it('Ctrl+Enter submits and Enter in the thesis box adds a line', async () => {
    const user = userEvent.setup()
    const created = makeThesis({ id: 'n', stockId: usd.id, note: 'a\nb' })
    const api = new StubApi({ ...entryRoutes(usd, () => []), [`POST /stocks/${usd.id}/theses`]: created })
    renderApp(`/stocks/${usd.id}`, api)

    await user.click(await screen.findByRole('button', { name: 'Add first entry' }))
    await user.click(within(dialog()).getByRole('radio', { name: 'Buy' }))
    await user.type(field(/^Thesis/), 'a{Enter}b')
    expect(api.callsTo(`POST /stocks/${usd.id}/theses`)).toHaveLength(0)
    await user.keyboard('{Control>}{Enter}{/Control}')

    await waitFor(() => expect(api.callsTo(`POST /stocks/${usd.id}/theses`)).toHaveLength(1))
    expect((lastBody(api, `POST /stocks/${usd.id}/theses`) as { note: string }).note).toBe('a\nb')
  })
})

describe('thesis dialog: edit', () => {
  const entry = makeThesis({ id: 'e1', stockId: usd.id, type: 'buy', note: 'x', targetPrice: '180.0000', createdAt: '2026-11-20T00:00:00.000Z', updatedAt: '2026-11-20T00:00:00.000Z' })
  const edit = () => screen.findByRole('button', { name: 'Edit Buy entry of 20 Nov 2026' })

  it('TC-U-803: edit sends only the changed fields', async () => {
    const user = userEvent.setup()
    let stored = entry
    const api = new StubApi({
      ...entryRoutes(usd, () => [stored]),
      [`PATCH /stocks/${usd.id}/theses/e1`]: () => (stored = { ...entry, targetPrice: null, updatedAt: '2026-11-24T00:00:00.000Z' }),
    })
    renderApp(`/stocks/${usd.id}`, api)

    await user.click(await edit())
    expect(dialog(/Edit thesis entry · NVDA/)).toBeInTheDocument()
    expect(field(/^Target price/)).toHaveValue('180')
    await user.clear(field(/^Target price/))
    await user.click(within(dialog()).getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(api.callsTo(`PATCH /stocks/${usd.id}/theses/e1`)).toHaveLength(1))
    expect(lastBody(api, `PATCH /stocks/${usd.id}/theses/e1`)).toEqual({ targetPrice: null })
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Entry updated'))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Edit Buy entry of 20 Nov 2026' })).toHaveFocus())
  })

  it('TC-U-804: an edit with no change sends nothing', async () => {
    const user = userEvent.setup()
    const api = new StubApi({ ...entryRoutes(usd, () => [entry]), [`PATCH /stocks/${usd.id}/theses/e1`]: entry })
    renderApp(`/stocks/${usd.id}`, api)

    const opener = await edit()
    await user.click(opener)
    await user.click(within(dialog()).getByRole('button', { name: 'Save' }))

    expect(api.callsTo(`PATCH /stocks/${usd.id}/theses/e1`)).toHaveLength(0)
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(toast).toHaveBeenCalledWith('No changes to save')
    await waitFor(() => expect(opener).toHaveFocus())
  })

  it('TC-U-807: a changed type, date and thesis go in one patch; a 404 names the entry or stock', async () => {
    const user = userEvent.setup()
    const api = new StubApi({
      ...entryRoutes(usd, () => [entry]),
      [`PATCH /stocks/${usd.id}/theses/e1`]: () => {
        throw new ApiError(404, { code: 'not_found' })
      },
    })
    renderApp(`/stocks/${usd.id}`, api)

    await user.click(await edit())
    await user.click(within(dialog()).getByRole('radio', { name: 'Review' }))
    fireEvent.change(within(dialog()).getByLabelText('Date'), { target: { value: '2026-11-01' } })
    await user.clear(field(/^Thesis/))
    await user.type(field(/^Thesis/), 'rewritten')
    await user.click(within(dialog()).getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(api.callsTo(`PATCH /stocks/${usd.id}/theses/e1`)).toHaveLength(1))
    expect(lastBody(api, `PATCH /stocks/${usd.id}/theses/e1`)).toEqual({ type: 'review', date: '2026-11-01', note: 'rewritten' })
    expect(await within(dialog()).findByText('This entry or stock no longer exists.')).toBeInTheDocument()
    expect(within(dialog()).getByRole('link', { name: 'Back to stocks' })).toHaveAttribute('href', '/stocks')
  })
})

describe('thesis dialog: failures keep the input', () => {
  it('TC-U-805: 500, network error and 404 leave the dialog open with every value', async () => {
    const user = userEvent.setup()
    const failures = [new ApiError(500, { code: 'internal' }), new ApiError(0, { code: 'network_error' }), new ApiError(404, { code: 'not_found' })]
    let n = 0
    const api = new StubApi({
      ...entryRoutes(usd, () => []),
      [`POST /stocks/${usd.id}/theses`]: () => {
        throw failures[n++]
      },
    })
    renderApp(`/stocks/${usd.id}`, api)

    await user.click(await screen.findByRole('button', { name: 'Add first entry' }))
    await user.click(within(dialog()).getByRole('radio', { name: 'Update' }))
    await user.type(field(/^Thesis/), 'Keep me')
    await user.type(field(/^Invalidation/), 'And me')
    const submit = () => user.click(within(dialog()).getByRole('button', { name: 'Add entry' }))

    for (const calls of [1, 2]) {
      await submit()
      await waitFor(() => expect(api.callsTo(`POST /stocks/${usd.id}/theses`)).toHaveLength(calls))
      expect(await within(dialog()).findByText("Couldn't save the entry. Try again.")).toBeInTheDocument()
    }
    await submit()
    expect(await within(dialog()).findByText('This stock no longer exists.')).toBeInTheDocument()
    expect(field(/^Thesis/)).toHaveValue('Keep me')
    expect(field(/^Invalidation/)).toHaveValue('And me')
    expect(within(dialog()).getByRole('radio', { name: 'Update' })).toBeChecked()
    expect(toast.success).not.toHaveBeenCalled()
  })

  it('TC-U-808: server field errors show under their fields', async () => {
    const user = userEvent.setup()
    const api = new StubApi({
      ...entryRoutes(usd, () => []),
      [`POST /stocks/${usd.id}/theses`]: () => {
        throw new ApiError(400, { code: 'validation_failed', errors: [{ path: 'note', message: 'must not contain a NUL character' }] })
      },
    })
    renderApp(`/stocks/${usd.id}`, api)

    await user.click(await screen.findByRole('button', { name: 'Add first entry' }))
    await user.click(within(dialog()).getByRole('radio', { name: 'Buy' }))
    await user.type(field(/^Thesis/), 'text')
    await user.click(within(dialog()).getByRole('button', { name: 'Add entry' }))

    expect(await within(dialog()).findByText('Thesis must not contain a NUL character')).toBeInTheDocument()
    await waitFor(() => expect(field(/^Thesis/)).toHaveFocus())
  })
})
