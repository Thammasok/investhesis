import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { toast } from 'sonner'
import { ApiError } from '@/lib/api-client'
import { renderApp } from '@/test/render-app'
import { makeList, makeStock, makeThesis } from '@/test/stock-fixtures'
import { StubApi, deferred } from '@/test/stub-api'

vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }), Toaster: () => null }))

beforeEach(() => {
  vi.mocked(toast).mockClear()
  vi.mocked(toast.success).mockClear()
  vi.mocked(toast.error).mockClear()
})

const stock = makeStock({ ticker: 'NVDA', name: 'NVIDIA Corporation', gicsSector: 'Information Technology', listIds: [] })
const e1 = makeThesis({ id: 'e1', stockId: stock.id, type: 'buy', date: '2026-11-20', note: 'First reason', updatedAt: '2026-11-22T00:00:00.000Z' })
const e2 = makeThesis({ id: 'e2', stockId: stock.id, type: 'review', date: '2026-10-01', note: 'Second reason' })
const base = (theses: () => unknown) => ({
  'GET /lists': { items: [makeList('core', 'Core')] },
  'GET /stocks': { items: [stock] },
  [`GET /stocks/${stock.id}`]: stock,
  [`GET /stocks/${stock.id}/theses`]: () => ({ items: theses() }),
})
const entryPath = `/stocks/${stock.id}/theses/e1`
const deletedToast = () => vi.mocked(toast).mock.calls.find((c) => c[0] === 'Entry deleted') as [string, { duration: number; action: { label: string; onClick: () => void } }] | undefined

describe('thesis delete and undo', () => {
  it('TC-U-820: delete then undo puts the entry back', async () => {
    const user = userEvent.setup()
    let list = [e1, e2]
    const api = new StubApi({
      ...base(() => list),
      [`DELETE ${entryPath}`]: () => {
        list = [e2]
        return e1
      },
      [`POST /stocks/${stock.id}/theses/restore`]: () => {
        list = [e1, e2]
        return e1
      },
    })
    renderApp(`/stocks/${stock.id}`, api)

    await user.click(await screen.findByRole('button', { name: 'Delete Buy entry of 20 Nov 2026' }))
    const confirm = screen.getByRole('alertdialog', { name: 'Delete this entry?' })
    expect(within(confirm).getByText('The Buy entry of 20 Nov 2026 will be deleted.')).toBeInTheDocument()
    expect(within(confirm).getByRole('button', { name: 'Cancel' })).toHaveFocus()
    await user.click(within(confirm).getByRole('button', { name: 'Delete' }))

    await waitFor(() => expect(api.callsTo(`DELETE ${entryPath}`)).toHaveLength(1))
    await waitFor(() => expect(screen.queryByText('First reason')).not.toBeInTheDocument())
    await waitFor(() => expect(screen.getByRole('heading', { level: 2, name: 'Thesis' })).toHaveFocus())

    deletedToast()?.[1].action.onClick()
    await waitFor(() => expect(api.callsTo(`POST /stocks/${stock.id}/theses/restore`)).toHaveLength(1))
    expect(api.callsTo(`POST /stocks/${stock.id}/theses/restore`)[0]?.body).toEqual({ entry: e1 })
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Entry restored'))
    expect(await screen.findByText('First reason')).toBeInTheDocument()
  })

  it('TC-U-821: undo is offered for 5 seconds', async () => {
    const user = userEvent.setup()
    const api = new StubApi({ ...base(() => [e1]), [`DELETE ${entryPath}`]: e1 })
    renderApp(`/stocks/${stock.id}`, api)

    await user.click(await screen.findByRole('button', { name: 'Delete Buy entry of 20 Nov 2026' }))
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Delete' }))

    await waitFor(() => expect(deletedToast()).toBeDefined())
    expect(deletedToast()?.[1].duration).toBe(5000)
    expect(deletedToast()?.[1].action.label).toBe('Undo')
  })

  it('TC-U-822: a failed restore says so', async () => {
    const user = userEvent.setup()
    const api = new StubApi({
      ...base(() => [e1]),
      [`DELETE ${entryPath}`]: e1,
      [`POST /stocks/${stock.id}/theses/restore`]: () => {
        throw new ApiError(409, { code: 'thesis_exists' })
      },
    })
    renderApp(`/stocks/${stock.id}`, api)

    await user.click(await screen.findByRole('button', { name: 'Delete Buy entry of 20 Nov 2026' }))
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(deletedToast()).toBeDefined())
    deletedToast()?.[1].action.onClick()

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Couldn't restore the entry."))
    expect(toast.success).not.toHaveBeenCalledWith('Entry restored')
  })

  it('TC-U-824: a failed delete keeps the dialog and the entry; Cancel changes nothing', async () => {
    const user = userEvent.setup()
    const api = new StubApi({
      ...base(() => [e1]),
      [`DELETE ${entryPath}`]: () => {
        throw new ApiError(500, { code: 'internal' })
      },
    })
    renderApp(`/stocks/${stock.id}`, api)

    await user.click(await screen.findByRole('button', { name: 'Delete Buy entry of 20 Nov 2026' }))
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Delete' }))
    expect(await within(screen.getByRole('alertdialog')).findByText("Couldn't delete the entry.")).toBeInTheDocument()
    expect(screen.getByText('First reason')).toBeInTheDocument()
    expect(deletedToast()).toBeUndefined()

    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Cancel' }))
    // The failed action re-read the list, so the button is a new node: look it up again.
    await waitFor(() => expect(screen.getByRole('button', { name: 'Delete Buy entry of 20 Nov 2026' })).toHaveFocus())
    expect(api.callsTo(`DELETE ${entryPath}`)).toHaveLength(1)
  })
})

describe('stock delete names the thesis entries', () => {
  const sentence = async (entries: unknown) => {
    const user = userEvent.setup()
    renderApp(`/stocks/${stock.id}`, new StubApi(base(() => entries)))
    await screen.findByText('1 entry').catch(() => undefined)
    await user.click(await screen.findByRole('button', { name: 'More actions' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Delete' }))
    return (await screen.findByRole('alertdialog', { name: 'Delete NVDA?' })).textContent ?? ''
  }

  it.each([
    [0, [], "This can't be undone."],
    [1, [e1], "This also deletes its 1 thesis entry. This can't be undone."],
    [3, [e1, e2, makeThesis({ id: 'e3', stockId: stock.id })], "This also deletes its 3 thesis entries. This can't be undone."],
  ])('TC-U-823: %i entries', async (_count, entries, expected) => {
    const text = await sentence(entries)
    expect(text).toContain(expected)
    if (entries.length === 0) expect(text).not.toMatch(/thesis entr/)
  })

  it('TC-U-823: entries not loaded yet use the generic sentence', async () => {
    const user = userEvent.setup()
    const pending = deferred<unknown>()
    renderApp(`/stocks/${stock.id}`, new StubApi(base(() => pending.promise)))
    await user.click(await screen.findByRole('button', { name: 'More actions' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Delete' }))
    expect((await screen.findByRole('alertdialog', { name: 'Delete NVDA?' })).textContent).toContain(
      "Any thesis entries for this stock are deleted too. This can't be undone.",
    )
  })
})
