import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { toast } from 'sonner'
import { ApiError } from '@/lib/api-client'
import { renderApp } from '@/test/render-app'
import { makeThesis } from '@/test/stock-fixtures'
import { StubApi, deferred } from '@/test/stub-api'
import { routes, thb, usd } from './cases-helpers'
import { localToday } from './thesis-form-model'

vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }), Toaster: () => null }))

beforeEach(() => {
  vi.mocked(toast).mockClear()
  vi.mocked(toast.success).mockClear()
})
afterEach(() => vi.useRealTimers())

type User = ReturnType<typeof userEvent.setup>
const postRoute = (stock = usd) => `POST /stocks/${stock.id}/theses`
const patchRoute = (id: string, stock = usd) => `PATCH /stocks/${stock.id}/theses/${id}`
const dialog = () => screen.getByRole('dialog', { name: /thesis entry/ })
const inDialog = () => within(dialog())
const box = (name: RegExp) => inDialog().getByRole('textbox', { name })
const note = () => box(/^Thesis/)
const target = () => box(/^Target price/)
const invalidation = () => box(/^Invalidation/)
const dateInput = () => inDialog().getByLabelText('Date') as HTMLInputElement
const submitButton = (mode: 'Add entry' | 'Save' = 'Add entry') => inDialog().getByRole('button', { name: mode })
const type = (name: string) => inDialog().getByRole('radio', { name })

async function openAdd(stubs: StubApi, stock = usd) {
  const user = userEvent.setup()
  renderApp(`/stocks/${stock.id}`, stubs)
  await user.click(await screen.findByRole('button', { name: 'Add first entry' }))
  return user
}
const empty = (stock = usd, extra: Record<string, unknown> = {}) => new StubApi({ ...routes(stock, () => []), ...extra })
const validFill = async (user: User, text = 'valid note') => {
  await user.click(type('Buy'))
  fireEvent.change(note(), { target: { value: text } })
}
const serverFail = (statuses: (ApiError | undefined)[]) => {
  let n = 0
  return () => {
    const failure = statuses[n++]
    if (failure) throw failure
    return makeThesis({ id: 'saved', stockId: usd.id })
  }
}

describe('thesis dialog cases: opening', () => {
  it('TC-C-720: the add dialog opens empty with today, the limits, the stock currency and focus on the first type', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 10, 24, 12, 0, 0))
    for (const [stock, prefix] of [[thb, '฿'], [usd, '$']] as const) {
      const user = await openAdd(empty(stock), stock)
      expect(screen.getByRole('dialog', { name: `Add thesis entry · ${stock.ticker}` })).toBeInTheDocument()
      expect(inDialog().getAllByRole('radio').every((r) => r.getAttribute('aria-checked') === 'false')).toBe(true)
      expect(dateInput().value).toBe('2026-11-24')
      expect(dateInput()).toHaveAttribute('max', '2026-11-24')
      expect(inDialog().getByText('0 / 10,000')).toBeInTheDocument()
      expect(inDialog().getByText('0 / 2,000')).toBeInTheDocument()
      expect(inDialog().getByText(prefix)).toBeInTheDocument()
      expect(inDialog().getAllByRole('radio')[0]).toHaveFocus()
      expect(dialog()).toHaveAccessibleDescription('Fields marked optional can be left empty.')
      await user.keyboard('{Escape}')
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
      document.body.innerHTML = ''
    }
  })
})

describe('thesis dialog cases: validation', () => {
  type Scenario = { name: string; fill: (user: User) => Promise<void> | void; fields: string[]; focus: RegExp | 'type' }
  const scenarios: Scenario[] = [
    { name: 'nothing', fill: () => undefined, fields: ['type', 'note'], focus: 'type' },
    { name: 'only a type', fill: (u) => u.click(type('Sell')), fields: ['note'], focus: /^Thesis/ },
    {
      name: 'a blank note',
      fill: async (u) => {
        await u.click(type('Buy'))
        fireEvent.change(note(), { target: { value: '   ' } })
      },
      fields: ['note'],
      focus: /^Thesis/,
    },
    {
      name: 'a note of 10,001 emoji',
      fill: async (u) => {
        await u.click(type('Buy'))
        fireEvent.change(note(), { target: { value: '😀'.repeat(10001) } })
      },
      fields: ['note'],
      focus: /^Thesis/,
    },
    {
      name: 'a target of "abc"',
      fill: async (u) => {
        await validFill(u)
        fireEvent.change(target(), { target: { value: 'abc' } })
      },
      fields: ['targetPrice'],
      focus: /^Target price/,
    },
    {
      name: 'an invalidation of 2,001 characters',
      fill: async (u) => {
        await validFill(u)
        fireEvent.change(invalidation(), { target: { value: 'i'.repeat(2001) } })
      },
      fields: ['invalidation'],
      focus: /^Invalidation/,
    },
    {
      name: 'a cleared date',
      fill: async (u) => {
        await validFill(u)
        fireEvent.change(dateInput(), { target: { value: '' } })
      },
      fields: ['date'],
      focus: 'date' as unknown as RegExp,
    },
    {
      name: 'a date after today',
      fill: async (u) => {
        await validFill(u)
        fireEvent.change(dateInput(), { target: { value: '2026-11-25' } })
      },
      fields: ['date'],
      focus: 'date' as unknown as RegExp,
    },
  ]
  const errorId: Record<string, string> = {
    type: 'thesis-type-error',
    date: 'thesis-date-error',
    note: 'thesis-note-error',
    targetPrice: 'thesis-target-price-error',
    invalidation: 'thesis-invalidation-error',
  }

  it.each(scenarios)('TC-C-721: submitting with $name shows each message under its field, sends nothing and focuses the first field in error', async (scenario) => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 10, 24, 12, 0, 0))
    const stubs = empty()
    const user = await openAdd(stubs)
    await scenario.fill(user)
    await user.click(submitButton())

    expect(stubs.callsTo(postRoute())).toHaveLength(0)
    for (const field of scenario.fields) {
      const message = document.getElementById(errorId[field] as string)
      expect(message, field).not.toBeNull()
      const control =
        field === 'type' ? inDialog().getByRole('radiogroup', { name: 'Type' }) : field === 'date' ? dateInput() : field === 'note' ? note() : field === 'targetPrice' ? target() : invalidation()
      expect(control).toHaveAttribute('aria-invalid', 'true')
      expect(control.getAttribute('aria-describedby') ?? '').toContain(errorId[field] as string)
    }
    const focused = document.activeElement as HTMLElement
    if (scenario.focus === 'type') expect(focused).toBe(inDialog().getAllByRole('radio')[0])
    else if ((scenario.focus as unknown) === 'date') expect(focused).toBe(dateInput())
    else expect(focused).toBe(box(scenario.focus))
    expect(dialog()).toBeInTheDocument()
  })

  it('TC-C-721: an error clears as soon as its field is fixed', async () => {
    const user = await openAdd(empty())
    await user.click(submitButton())
    expect(document.getElementById('thesis-type-error')).not.toBeNull()
    expect(document.getElementById('thesis-note-error')).not.toBeNull()
    await user.click(type('Update'))
    expect(document.getElementById('thesis-type-error')).toBeNull()
    await user.type(note(), 'x')
    expect(document.getElementById('thesis-note-error')).toBeNull()
  })

  it('TC-C-722: the counter counts code points, turns heavy (not red) over the limit and the submit is refused', async () => {
    const stubs = empty()
    const user = await openAdd(stubs)
    await user.click(type('Buy'))
    const counter = () => inDialog().getByText(/ \/ 10,000$/)
    for (const [value, shown] of [
      ['a'.repeat(9999), '9,999 / 10,000'],
      ['a'.repeat(10000), '10,000 / 10,000'],
      ['กิ็', '3 / 10,000'],
      ['👨‍👩‍👧', '5 / 10,000'],
    ] as const) {
      fireEvent.change(note(), { target: { value } })
      expect(counter().textContent).toBe(shown)
      expect(counter().className).not.toMatch(/font-medium/)
    }
    fireEvent.change(note(), { target: { value: 'a'.repeat(10001) } })
    expect(counter().textContent).toBe('10,001 / 10,000')
    expect(counter().className).toContain('text-foreground')
    expect(counter().className).toContain('font-medium')
    expect(counter().className).not.toMatch(/red|destructive/)
    await user.click(submitButton())
    expect(inDialog().getByText(/^Thesis must be 1-10,000 characters/)).toBeInTheDocument()
    expect(stubs.callsTo(postRoute())).toHaveLength(0)
  })

  it('TC-C-724: the target price accepts exact positive decimals only and is always sent as a string', async () => {
    const stubs = empty(usd, { [postRoute()]: serverFail(Array.from({ length: 30 }, () => new ApiError(500, { code: 'internal' }))) })
    const user = await openAdd(stubs)
    await validFill(user)
    const valid: [string, string | undefined][] = [
      ['180', '180'],
      ['180.5', '180.5'],
      ['0.0001', '0.0001'],
      ['12345678901234.5678', '12345678901234.5678'],
      [' 180 ', '180'],
      ['', undefined],
    ]
    const invalid = ['0', '0.00', '180.', '.5', '1,5', '$180', '1e3', '-1', '123456789012345', '1.23456', '١٨٠']
    let sent = 0
    for (const [typed, expected] of valid) {
      fireEvent.change(target(), { target: { value: typed } })
      await user.click(submitButton())
      await waitFor(() => expect(stubs.callsTo(postRoute())).toHaveLength(++sent))
      const body = stubs.callsTo(postRoute()).at(-1)?.body as Record<string, unknown>
      if (expected === undefined) expect(body).not.toHaveProperty('targetPrice')
      else expect(body['targetPrice']).toBe(expected)
      await waitFor(() => expect(submitButton()).toHaveAttribute('aria-disabled', 'false'))
    }
    for (const typed of invalid) {
      fireEvent.change(target(), { target: { value: typed } })
      await user.click(submitButton())
      expect(stubs.callsTo(postRoute()), typed).toHaveLength(sent)
      expect(inDialog().getByText(/^Target price must be greater than 0/), typed).toBeInTheDocument()
    }
  })

  it('TC-C-723: the web sends the trimmed note and leaves a blank invalidation out', async () => {
    const stubs = empty(usd, { [postRoute()]: makeThesis({ id: 'n', stockId: usd.id }) })
    const user = await openAdd(stubs)
    await user.click(type('Buy'))
    fireEvent.change(note(), { target: { value: '  a\nb  ' } })
    fireEvent.change(invalidation(), { target: { value: '   ' } })
    await user.click(submitButton())

    await waitFor(() => expect(stubs.callsTo(postRoute())).toHaveLength(1))
    expect(stubs.callsTo(postRoute())[0]?.body).toEqual({ type: 'buy', date: localToday(), note: 'a\nb' })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })
})

describe('thesis dialog cases: keyboard and saving', () => {
  it('TC-C-725: Enter adds a line, Ctrl+Enter and Cmd+Enter submit once, an invalid form shows errors, Esc closes and returns focus', async () => {
    const stubs = empty(usd, { [postRoute()]: serverFail([new ApiError(500, { code: 'internal' }), new ApiError(500, { code: 'internal' })]) })
    const user = await openAdd(stubs)
    await user.keyboard('{Control>}{Enter}{/Control}')
    expect(stubs.callsTo(postRoute())).toHaveLength(0)
    expect(inDialog().getByText('Type is required')).toBeInTheDocument()

    await user.click(type('Buy'))
    await user.type(note(), 'one{Enter}two')
    expect((note() as HTMLTextAreaElement).value).toBe('one\ntwo')
    expect(stubs.callsTo(postRoute())).toHaveLength(0)

    await user.keyboard('{Control>}{Enter}{/Control}')
    await waitFor(() => expect(stubs.callsTo(postRoute())).toHaveLength(1))
    await waitFor(() => expect(submitButton()).toHaveAttribute('aria-disabled', 'false'))
    // The fields are disabled while a save runs, which drops focus to the page (see the report); put it back.
    note().focus()
    await user.keyboard('{Meta>}{Enter}{/Meta}')
    await waitFor(() => expect(stubs.callsTo(postRoute())).toHaveLength(2))
    expect(stubs.callsTo(postRoute())[1]?.body).toEqual(stubs.callsTo(postRoute())[0]?.body)

    await waitFor(() => expect(submitButton()).toHaveAttribute('aria-disabled', 'false'))
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(stubs.callsTo(postRoute())).toHaveLength(2)
    expect(screen.getByRole('button', { name: 'Add first entry' })).toHaveFocus()
  })

  it('TC-C-726: a second click while saving sends nothing more; the button stays focusable and Cancel stays usable', async () => {
    const held = deferred<unknown>()
    const created = makeThesis({ id: 'held', stockId: usd.id, note: 'held note' })
    const stubs = empty(usd, { [postRoute()]: () => held.promise })
    const user = await openAdd(stubs)
    await validFill(user, 'held note')
    await user.dblClick(submitButton())

    await waitFor(() => expect(stubs.callsTo(postRoute())).toHaveLength(1))
    await waitFor(() => expect(submitButton()).toHaveAttribute('aria-disabled', 'true'))
    expect(submitButton()).not.toBeDisabled()
    expect(submitButton().querySelector('svg')?.getAttribute('class')).toContain('motion-reduce:animate-none')
    await user.click(submitButton())
    expect(stubs.callsTo(postRoute())).toHaveLength(1)
    submitButton().focus()
    expect(submitButton()).toHaveFocus()
    expect(inDialog().getByRole('button', { name: 'Cancel' })).not.toBeDisabled()
    held.resolve(created)
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(stubs.callsTo(postRoute())).toHaveLength(1)
  })

  it('TC-C-727 (field errors): server messages for note, target price and date sit under their fields, with values kept and focus on the first', async () => {
    const stubs = empty(usd, {
      [postRoute()]: () => {
        throw new ApiError(400, {
          code: 'validation_failed',
          errors: [
            { path: 'targetPrice', message: 'must be greater than 0' },
            { path: 'note', message: 'must not contain a NUL character' },
            { path: 'date', message: "can't be in the future" },
          ],
        })
      },
    })
    const user = await openAdd(stubs)
    await validFill(user, 'my note')
    fireEvent.change(target(), { target: { value: '5' } })
    await user.click(submitButton())

    expect(await inDialog().findByText('Thesis must not contain a NUL character')).toBeInTheDocument()
    expect(inDialog().getByText('Target price must be greater than 0')).toBeInTheDocument()
    expect(inDialog().getByText("The date can't be in the future")).toBeInTheDocument()
    expect(note()).toHaveValue('my note')
    expect(target()).toHaveValue('5')
    await waitFor(() => expect(dateInput()).toHaveFocus())
  })

  it.each([
    ['a 400 without field errors', new ApiError(400, { code: 'validation_failed' })],
    ['a 403', new ApiError(403, { code: 'forbidden' })],
    ['a 409', new ApiError(409, { code: 'conflict' })],
    ['a 429', new ApiError(429, { code: 'rate_limited' })],
    ['a 500', new ApiError(500, { code: 'internal' })],
    ['a 503', new ApiError(503, { code: 'db_unavailable' })],
    ['a network failure or timeout', new ApiError(0, { code: 'network_error' })],
  ])('TC-C-728: %s keeps the dialog open with every value and a second Save sends the same body', async (_name, failure) => {
    const stubs = empty(usd, { [postRoute()]: serverFail([failure, failure]) })
    const user = await openAdd(stubs)
    await validFill(user, 'keep me')
    fireEvent.change(target(), { target: { value: '12.5' } })
    fireEvent.change(invalidation(), { target: { value: 'and me' } })
    for (const calls of [1, 2]) {
      await user.click(submitButton())
      await waitFor(() => expect(stubs.callsTo(postRoute())).toHaveLength(calls))
      expect(await inDialog().findByText("Couldn't save the entry. Try again.")).toBeInTheDocument()
      await waitFor(() => expect(submitButton()).toHaveAttribute('aria-disabled', 'false'))
      expect(note()).toHaveValue('keep me')
      expect(target()).toHaveValue('12.5')
      expect(invalidation()).toHaveValue('and me')
      expect(inDialog().getByRole('radio', { name: 'Buy' })).toBeChecked()
    }
    expect(stubs.callsTo(postRoute())[1]?.body).toEqual(stubs.callsTo(postRoute())[0]?.body)
    expect(toast.success).not.toHaveBeenCalled()
  })

  it('TC-C-729: a 404 on add says the stock is gone, links to /stocks and keeps the values; a 404 on edit names the entry or stock', async () => {
    const stubs = empty(usd, {
      [postRoute()]: () => {
        throw new ApiError(404, { code: 'not_found' })
      },
    })
    const user = await openAdd(stubs)
    await validFill(user, 'still here')
    await user.click(submitButton())

    expect(await inDialog().findByText('This stock no longer exists.')).toBeInTheDocument()
    expect(inDialog().getByRole('link', { name: 'Back to stocks' })).toHaveAttribute('href', '/stocks')
    expect(note()).toHaveValue('still here')
  })
})

describe('thesis dialog cases: editing', () => {
  const stored = makeThesis({
    id: 'e1',
    stockId: usd.id,
    type: 'update',
    date: '2026-10-03',
    note: 'stored note',
    targetPrice: '180.0000',
    invalidation: 'stored invalidation',
    createdAt: '2026-10-03T00:00:00.000Z',
    updatedAt: '2026-10-03T00:00:00.000Z',
  })
  const bare = makeThesis({ id: 'e2', stockId: usd.id, type: 'buy', date: '2026-09-01', note: 'bare', createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z' })
  const editName = (e: typeof stored) => `Edit ${e.type === 'update' ? 'Update' : 'Buy'} entry of ${e.date === '2026-10-03' ? '3 Oct 2026' : '1 Sep 2026'}`

  async function openEdit(entries: (typeof stored)[], target: typeof stored, patchAnswer?: unknown) {
    const user = userEvent.setup()
    let current = entries
    const stubs = new StubApi({
      ...routes(usd, () => current),
      [patchRoute(target.id)]: (patchAnswer ?? ((r: { body: unknown }) => {
        const next = { ...target, ...(r.body as object), updatedAt: '2026-11-25T00:00:00.000Z' }
        current = current.map((e) => (e.id === target.id ? (next as typeof stored) : e))
        return next
      })) as unknown,
    })
    renderApp(`/stocks/${usd.id}`, stubs)
    await user.click(await screen.findByRole('button', { name: editName(target) }))
    return { user, stubs }
  }

  it('TC-C-730: the edit dialog is titled for the stock, shows Save, prefills the stored values and focuses the checked type', async () => {
    await openEdit([stored], stored)

    expect(screen.getByRole('dialog', { name: 'Edit thesis entry · NVDA' })).toBeInTheDocument()
    expect(submitButton('Save')).toBeInTheDocument()
    expect(inDialog().queryByRole('button', { name: 'Add entry' })).not.toBeInTheDocument()
    expect(inDialog().getByRole('radio', { name: 'Update' })).toBeChecked()
    expect(inDialog().getByRole('radio', { name: 'Update' })).toHaveFocus()
    expect(dateInput().value).toBe('2026-10-03')
    expect(note()).toHaveValue('stored note')
    expect(target()).toHaveValue('180')
    expect(invalidation()).toHaveValue('stored invalidation')
  })

  const oneField: [string, (user: User) => Promise<void> | void, Record<string, unknown>, typeof stored][] = [
    ['the type', (u) => u.click(type('Review')), { type: 'review' }, stored],
    ['the date', () => void fireEvent.change(dateInput(), { target: { value: '2026-10-04' } }), { date: '2026-10-04' }, stored],
    ['the note', () => void fireEvent.change(note(), { target: { value: 'new note' } }), { note: 'new note' }, stored],
    ['a new target price', () => void fireEvent.change(target(), { target: { value: '5.5' } }), { targetPrice: '5.5' }, bare],
    ['a cleared target price', () => void fireEvent.change(target(), { target: { value: '' } }), { targetPrice: null }, stored],
    ['a new invalidation', () => void fireEvent.change(invalidation(), { target: { value: 'because' } }), { invalidation: 'because' }, bare],
    ['a cleared invalidation', () => void fireEvent.change(invalidation(), { target: { value: '' } }), { invalidation: null }, stored],
  ]
  it.each(oneField)('TC-C-731: changing only %s sends only that key and returns focus to the entry’s Edit button', async (_what, change, body, entry) => {
    const { user, stubs } = await openEdit([stored, bare], entry)
    await change(user)
    await user.click(submitButton('Save'))

    await waitFor(() => expect(stubs.callsTo(patchRoute(entry.id))).toHaveLength(1))
    expect(stubs.callsTo(patchRoute(entry.id))[0]?.body).toEqual(body)
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Entry updated'))
    // Its name carries the type and date, so after changing either it is found by its entry id.
    await waitFor(() => expect(document.querySelector(`[data-thesis-edit="${entry.id}"]`)).toHaveFocus())
  })

  it('TC-C-731: changing a field and changing it back sends nothing and says so', async () => {
    const { user, stubs } = await openEdit([stored], stored)
    fireEvent.change(note(), { target: { value: 'changed' } })
    fireEvent.change(note(), { target: { value: 'stored note' } })
    await user.click(submitButton('Save'))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(stubs.callsTo(patchRoute('e1'))).toHaveLength(0)
    expect(toast).toHaveBeenCalledWith('No changes to save')
  })

  it('TC-C-729 (edit): a 404 on save names the entry or the stock and keeps the values', async () => {
    const { user } = await openEdit(
      [stored],
      stored,
      () => {
        throw new ApiError(404, { code: 'not_found' })
      },
    )
    fireEvent.change(note(), { target: { value: 'edited text' } })
    await user.click(submitButton('Save'))

    expect(await inDialog().findByText('This entry or stock no longer exists.')).toBeInTheDocument()
    expect(inDialog().getByRole('link', { name: 'Back to stocks' })).toHaveAttribute('href', '/stocks')
    expect(note()).toHaveValue('edited text')
  })

  it('TC-C-732: every opening starts clean, and a failure of an earlier opening does not show', async () => {
    const failing = serverFail([new ApiError(500, { code: 'internal' })])
    const user = userEvent.setup()
    const stubs = new StubApi({
      ...routes(usd, () => [stored]),
      [postRoute()]: failing,
      [patchRoute('e1')]: stored,
    })
    renderApp(`/stocks/${usd.id}`, stubs)

    const add = await screen.findByRole('button', { name: 'Add entry' })
    await user.click(add)
    await validFill(user, 'draft that is cancelled')
    await user.click(submitButton())
    expect(await inDialog().findByText("Couldn't save the entry. Try again.")).toBeInTheDocument()
    await user.click(inDialog().getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: 'Add entry' }))
    expect(note()).toHaveValue('')
    expect(inDialog().getAllByRole('radio').every((r) => r.getAttribute('aria-checked') === 'false')).toBe(true)
    expect(inDialog().queryByText("Couldn't save the entry. Try again.")).not.toBeInTheDocument()
    await user.click(inDialog().getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: 'Edit Update entry of 3 Oct 2026' }))
    fireEvent.change(note(), { target: { value: 'edited but cancelled' } })
    await user.click(inDialog().getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'Edit Update entry of 3 Oct 2026' }))
    expect(note()).toHaveValue('stored note')
    expect(target()).toHaveValue('180')
  })
})
