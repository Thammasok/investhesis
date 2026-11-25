import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { toast } from 'sonner'
import { ApiError } from '@/lib/api-client'
import { renderApp } from '@/test/render-app'
import { makeThesis } from '@/test/stock-fixtures'
import { StubApi, deferred } from '@/test/stub-api'
import { SOLID_DESTRUCTIVE_LIGHT } from '@/lib/solid-destructive'
import { routes, usd } from './cases-helpers'

vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }), Toaster: () => null }))

beforeEach(() => {
  vi.mocked(toast).mockClear()
  vi.mocked(toast.success).mockClear()
  vi.mocked(toast.error).mockClear()
})

const e1 = makeThesis({ id: 'e1', stockId: usd.id, type: 'buy', date: '2026-11-20', note: 'First reason', createdAt: '2026-11-20T00:00:00.000Z', updatedAt: '2026-11-22T00:00:00.000Z' })
const e2 = makeThesis({ id: 'e2', stockId: usd.id, type: 'review', date: '2026-10-01', note: 'Second reason' })
const del = (id: string) => `DELETE /stocks/${usd.id}/theses/${id}`
const restore = `POST /stocks/${usd.id}/theses/restore`
const deleteName = (type: string, date: string) => `Delete ${type} entry of ${date}`
type Action = { label: string; onClick: () => void }
const toasts = (): [string, { duration: number; action: Action }][] =>
  vi.mocked(toast).mock.calls.filter((c) => c[0] === 'Entry deleted') as never

/** A stub whose list follows deletes and restores, like the real API. */
function stateful(initial: (typeof e1)[], extra: Record<string, unknown> = {}) {
  let list = [...initial]
  const byDate = (a: typeof e1, b: typeof e1) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)
  const stubs = new StubApi({
    ...routes(usd, () => list),
    ...Object.fromEntries(
      initial.map((e) => [
        del(e.id),
        () => {
          list = list.filter((x) => x.id !== e.id)
          return e
        },
      ]),
    ),
    [restore]: (r: { body: unknown }) => {
      const entry = (r.body as { entry: typeof e1 }).entry
      list = [...list, entry].sort(byDate)
      return entry
    },
    ...extra,
  })
  return { stubs, list: () => list }
}
const confirm = () => screen.getByRole('alertdialog', { name: 'Delete this entry?' })

describe('thesis delete cases', () => {
  it('TC-C-740: the confirm names the entry, starts on Cancel, Esc changes nothing and the button is the solid destructive one', async () => {
    const user = userEvent.setup()
    const { stubs } = stateful([e1])
    renderApp(`/stocks/${usd.id}`, stubs)

    await user.click(await screen.findByRole('button', { name: deleteName('Buy', '20 Nov 2026') }))
    expect(within(confirm()).getByText('The Buy entry of 20 Nov 2026 will be deleted.')).toBeInTheDocument()
    expect(within(confirm()).getByRole('button', { name: 'Cancel' })).toHaveFocus()
    for (const token of SOLID_DESTRUCTIVE_LIGHT.split(' ')) expect(within(confirm()).getByRole('button', { name: 'Delete' }).className).toContain(token)

    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    expect(stubs.callsTo(del('e1'))).toHaveLength(0)
    await waitFor(() => expect(screen.getByRole('button', { name: deleteName('Buy', '20 Nov 2026') })).toHaveFocus())
  })

  it('TC-C-741 (delete and undo): deleting the only entry shows the empty state with focus on the heading, and Undo puts it back as it was', async () => {
    const user = userEvent.setup()
    const { stubs } = stateful([e1])
    renderApp(`/stocks/${usd.id}`, stubs)

    await user.click(await screen.findByRole('button', { name: deleteName('Buy', '20 Nov 2026') }))
    await user.click(within(confirm()).getByRole('button', { name: 'Delete' }))
    expect(await screen.findByText('No thesis yet')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('heading', { level: 2, name: 'Thesis' })).toHaveFocus())

    toasts()[0]?.[1].action.onClick()
    expect(await screen.findByText('First reason')).toBeInTheDocument()
    expect(screen.getByText('Edited 22 Nov 2026')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Thesis' })).toHaveAccessibleDescription('1 entry')
    expect(toast.success).toHaveBeenCalledWith('Entry restored')
    expect(stubs.callsTo(restore)).toHaveLength(1)
  })

  it('TC-C-742 (duration): the Undo toast is created with a 5,000 ms duration and an Undo action', async () => {
    const user = userEvent.setup()
    const { stubs } = stateful([e1])
    renderApp(`/stocks/${usd.id}`, stubs)

    await user.click(await screen.findByRole('button', { name: deleteName('Buy', '20 Nov 2026') }))
    await user.click(within(confirm()).getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(toasts()).toHaveLength(1))
    expect(toasts()[0]?.[1].duration).toBe(5000)
    expect(toasts()[0]?.[1].action.label).toBe('Undo')
  })

  it.each([
    ['a 500', new ApiError(500, { code: 'internal' }), "Couldn't delete the entry."],
    ['a network failure', new ApiError(0, { code: 'network_error' }), "Couldn't delete the entry."],
    ['a 404', new ApiError(404, { code: 'not_found' }), 'This entry or stock no longer exists.'],
  ])('TC-C-743: %s keeps the entry, names the failure and returns focus to its Delete button', async (_name, failure, message) => {
    const user = userEvent.setup()
    const { stubs } = stateful([e1], {
      [del('e1')]: () => {
        throw failure
      },
    })
    renderApp(`/stocks/${usd.id}`, stubs)

    await user.click(await screen.findByRole('button', { name: deleteName('Buy', '20 Nov 2026') }))
    await user.click(within(confirm()).getByRole('button', { name: 'Delete' }))
    expect(await within(confirm()).findByText(message)).toBeInTheDocument()
    expect(screen.getByText('First reason')).toBeInTheDocument()
    expect(toasts()).toHaveLength(0)

    await user.click(within(confirm()).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.getByRole('button', { name: deleteName('Buy', '20 Nov 2026') })).toHaveFocus())
    expect(screen.getByText('First reason')).toBeInTheDocument()
  })

  it.each([
    ['a 409', new ApiError(409, { code: 'thesis_exists' })],
    ['a 404', new ApiError(404, { code: 'not_found' })],
    ['a 400', new ApiError(400, { code: 'validation_failed' })],
    ['a 500', new ApiError(500, { code: 'internal' })],
    ['a network failure', new ApiError(0, { code: 'network_error' })],
  ])('TC-C-744: a restore that answers %s says so once and leaves the list as it was', async (_name, failure) => {
    const user = userEvent.setup()
    const { stubs } = stateful([e1, e2], {
      [restore]: () => {
        throw failure
      },
    })
    renderApp(`/stocks/${usd.id}`, stubs)

    await user.click(await screen.findByRole('button', { name: deleteName('Buy', '20 Nov 2026') }))
    await user.click(within(confirm()).getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(toasts()).toHaveLength(1))
    toasts()[0]?.[1].action.onClick()

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Couldn't restore the entry."))
    expect(toast.error).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(screen.queryByText('First reason')).not.toBeInTheDocument())
    expect(screen.getByText('Second reason')).toBeInTheDocument()
    expect(stubs.callsTo(restore)).toHaveLength(1)
  })

  it('TC-C-745: each Undo restores its own entry, and the list is ordered by date', async () => {
    const user = userEvent.setup()
    const { stubs } = stateful([e1, e2])
    renderApp(`/stocks/${usd.id}`, stubs)

    await user.click(await screen.findByRole('button', { name: deleteName('Buy', '20 Nov 2026') }))
    await user.click(within(confirm()).getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(screen.queryByText('First reason')).not.toBeInTheDocument())
    await user.click(await screen.findByRole('button', { name: deleteName('Review', '1 Oct 2026') }))
    await user.click(within(confirm()).getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(toasts()).toHaveLength(2))

    toasts()[0]?.[1].action.onClick()
    await screen.findByText('First reason')
    toasts()[1]?.[1].action.onClick()
    await screen.findByText('Second reason')
    const bodies = stubs.callsTo(restore).map((c) => (c.body as { entry: { id: string } }).entry.id)
    expect(bodies).toEqual(['e1', 'e2'])
    const articles = await screen.findAllByRole('article')
    expect(articles.map((a) => a.textContent?.match(/First|Second/)?.[0])).toEqual(['First', 'Second'])
  })
})

describe('stock delete wording cases', () => {
  const dialogText = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(await screen.findByRole('button', { name: 'More actions' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Delete' }))
    return screen.findByRole('alertdialog', { name: 'Delete NVDA?' })
  }

  it.each([
    ['0 entries', [], null],
    ['1 entry', [e1], 'This also deletes its 1 thesis entry.'],
    ['3 entries', [e1, e2, makeThesis({ id: 'e3', stockId: usd.id })], 'This also deletes its 3 thesis entries.'],
  ])('TC-C-750: with %s the dialog says the right thing', async (_name, entries, sentence) => {
    const user = userEvent.setup()
    renderApp(`/stocks/${usd.id}`, new StubApi(routes(usd, () => entries)))
    if (entries.length > 0) await screen.findAllByRole('article')
    else await screen.findByText('No thesis yet')
    const dialog = await dialogText(user)
    if (sentence) expect(dialog.textContent).toContain(sentence)
    else expect(dialog.textContent).not.toMatch(/thesis entr/)
    expect(dialog.textContent).toContain("This can't be undone.")
  })

  it('TC-C-750: a failed read uses the generic sentence', async () => {
    const user = userEvent.setup()
    const stubs = new StubApi({
      ...routes(usd, () => []),
      [`GET /stocks/${usd.id}/theses`]: () => {
        throw new ApiError(500, { code: 'internal' })
      },
    })
    renderApp(`/stocks/${usd.id}`, stubs)
    await screen.findByRole('alert', {}, { timeout: 4000 })
    expect((await dialogText(user)).textContent).toContain('Any thesis entries for this stock are deleted too.')
  })

  it('TC-C-750: the sentence updates when the entries arrive while the dialog is open', async () => {
    const user = userEvent.setup()
    const arrive = deferred<unknown>()
    renderApp(`/stocks/${usd.id}`, new StubApi(routes(usd, () => arrive.promise)))
    const dialog = await dialogText(user)
    expect(dialog.textContent).toContain('Any thesis entries for this stock are deleted too.')

    arrive.resolve([e1, e2])
    await waitFor(() => expect(screen.getByRole('alertdialog', { name: 'Delete NVDA?' }).textContent).toContain('its 2 thesis entries'))
  })

  it('TC-C-750: an entry added a moment ago counts', async () => {
    const user = userEvent.setup()
    let list = [e1]
    const added = makeThesis({ id: 'e9', stockId: usd.id, note: 'just added', date: '2026-11-21' })
    const stubs = new StubApi({
      ...routes(usd, () => list),
      [`POST /stocks/${usd.id}/theses`]: () => {
        list = [added, e1]
        return added
      },
    })
    renderApp(`/stocks/${usd.id}`, stubs)

    await user.click(await screen.findByRole('button', { name: 'Add entry' }))
    const dialog = screen.getByRole('dialog', { name: /Add thesis entry/ })
    await user.click(within(dialog).getByRole('radio', { name: 'Buy' }))
    fireEvent.change(within(dialog).getByRole('textbox', { name: /^Thesis/ }), { target: { value: 'just added' } })
    await user.click(within(dialog).getByRole('button', { name: 'Add entry' }))
    await screen.findByText('just added')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    expect((await dialogText(user)).textContent).toContain('its 2 thesis entries')
  })
})
