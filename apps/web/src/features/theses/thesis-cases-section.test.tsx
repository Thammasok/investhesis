import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { toast } from 'sonner'
import { ApiError } from '@/lib/api-client'
import { renderApp } from '@/test/render-app'
import { makeThesis } from '@/test/stock-fixtures'
import { StubApi, deferred } from '@/test/stub-api'
import { apiFor, routes, section, thb, usd } from './cases-helpers'

vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }), Toaster: () => null }))

beforeEach(() => {
  vi.mocked(toast).mockClear()
  vi.mocked(toast.success).mockClear()
})
afterEach(() => vi.useRealTimers())

const open = (stubs: StubApi, stock = usd) => renderApp(`/stocks/${stock.id}`, stubs)
const entry = (over: Parameters<typeof makeThesis>[0] = {}) => makeThesis({ stockId: usd.id, ...over })
const articles = () => screen.findAllByRole('article')

describe('thesis section cases', () => {
  it('TC-C-700: each type shows as text in the same secondary badge, with no colour-only meaning', async () => {
    const items = (['buy', 'sell', 'update', 'review'] as const).map((type, i) => entry({ id: `t${i}`, type }))
    open(apiFor(usd, items))

    const cards = await articles()
    const labels = ['Buy', 'Sell', 'Update', 'Review']
    const badges = cards.map((card, i) => within(card).getByText(labels[i] as string).closest('[data-slot="badge"]') as HTMLElement)
    expect(badges.map((b) => b.textContent)).toEqual(labels)
    for (const badge of badges) {
      expect(badge.className).toBe(badges[0]?.className)
      expect(badge).toHaveAttribute('data-variant', 'secondary')
      expect(badge.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
    }
    // Not the buttons: their base classes carry `aria-invalid:…destructive` variants.
    expect(badges[1]?.className).not.toMatch(/(^|\s)(text|bg|border)-(red|destructive)/)
    expect(cards[1]?.querySelector('time')?.className ?? '').not.toMatch(/red|destructive/)
  })

  it('TC-C-701: the heading is described by the count; the list is an ol named by it; entries keep the API order', async () => {
    const items = ['first', 'second', 'third'].map((note, i) => entry({ id: `n${i}`, note }))
    open(apiFor(usd, items))

    await articles()
    // The section remounts when the entries arrive: read the heading after them.
    expect(screen.getByRole('heading', { level: 2, name: 'Thesis' })).toHaveAccessibleDescription('3 entries')
    const list = screen.getByRole('list', { name: 'Thesis' })
    expect(list.tagName).toBe('OL')
    expect((await articles()).map((a) => a.textContent?.match(/first|second|third/)?.[0])).toEqual(['first', 'second', 'third'])
  })

  it('TC-C-701: one entry reads "1 entry"; loading, failed and empty carry no count', async () => {
    open(apiFor(usd, [entry()]))
    expect(await screen.findByRole('heading', { name: 'Thesis' })).toBeDefined()
    await articles()
    expect(screen.getByRole('heading', { name: 'Thesis' })).toHaveAccessibleDescription('1 entry')
    cleanup()

    const pending = deferred<unknown>()
    open(new StubApi(routes(usd, () => pending.promise)))
    expect(await screen.findByText('Loading thesis entries')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Thesis' })).not.toHaveAccessibleDescription(/entr/)
    expect(within(section()).queryByText(/^\d+ entr(y|ies)$/)).not.toBeInTheDocument()
    cleanup()

    open(
      new StubApi({
        ...routes(usd, () => []),
        [`GET /stocks/${usd.id}/theses`]: () => {
          throw new ApiError(500, { code: 'internal' })
        },
      }),
    )
    expect(await screen.findByRole('alert', {}, { timeout: 4000 })).toBeInTheDocument()
    expect(within(section()).queryByText(/^\d+ entr(y|ies)$/)).not.toBeInTheDocument()
    cleanup()

    open(apiFor(usd, []))
    expect(await screen.findByText('No thesis yet')).toBeInTheDocument()
    expect(within(section()).queryByText(/^\d+ entr(y|ies)$/)).not.toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Thesis' })).not.toBeInTheDocument()
  })

  it('TC-C-702: the advice line is shown once in the empty and in the filled state', async () => {
    open(apiFor(usd, []))
    await screen.findByText('No thesis yet')
    expect(screen.getAllByText('Your own reasoning, not advice.')).toHaveLength(1)
    cleanup()

    open(apiFor(usd, [entry({ id: 'a' }), entry({ id: 'b' })]))
    await articles()
    expect(screen.getAllByText('Your own reasoning, not advice.')).toHaveLength(1)
    expect(within(section()).getByText('Your own reasoning, not advice.')).toBeInTheDocument()
  })

  it('TC-C-703: a target price shows in the stock currency with its decimals, and follows a currency change without conversion', async () => {
    const cases: [typeof usd, string, string][] = [
      // formatUnitMoney keeps at least two decimals, so a whole 180 reads $180.00 (test-cases.md says $180).
      [usd, '180.0000', '$180.00'],
      [thb, '42.2500', '฿42.25'],
      [usd, '0.1234', '$0.1234'],
      [usd, '1000.5000', '$1,000.50'],
      [thb, '180.0000', '฿180.00'],
    ]
    for (const [stock, targetPrice, shown] of cases) {
      open(apiFor(stock, [entry({ stockId: stock.id, targetPrice })]), stock)
      const card = within(await screen.findByRole('article'))
      expect(card.getByText('Target price').nextElementSibling?.textContent).toBe(shown)
      cleanup()
    }
  })

  it('TC-C-704: the target and invalidation rows appear only for values that are set', async () => {
    const items = [
      entry({ id: 'none', note: 'neither' }),
      entry({ id: 'target', note: 'target only', targetPrice: '5.0000' }),
      entry({ id: 'inval', note: 'invalidation only', invalidation: 'Margins fall' }),
    ]
    open(apiFor(usd, items))

    const [none, target, inval] = (await articles()) as [HTMLElement, HTMLElement, HTMLElement]
    expect(none.querySelector('dl')).toBeNull()
    expect(within(target).getByText('Target price')).toBeInTheDocument()
    expect(within(target).queryByText('Invalidation')).not.toBeInTheDocument()
    expect(within(inval).getByText('Invalidation')).toBeInTheDocument()
    expect(within(inval).queryByText('Target price')).not.toBeInTheDocument()
    for (const dt of document.querySelectorAll('dt')) expect(dt.textContent?.trim()).not.toBe('')
  })

  it('TC-C-705: Edited shows once updatedAt is later than createdAt, in the browser zone, and never moves the entry date', async () => {
    const created = '2026-11-20T10:00:00.000Z'
    const items = [
      entry({ id: 'same', date: '2026-11-20', createdAt: created, updatedAt: created }),
      entry({ id: 'ms', date: '2026-11-20', createdAt: created, updatedAt: '2026-11-20T10:00:00.001Z' }),
      entry({ id: 'later', date: '2026-11-20', createdAt: created, updatedAt: '2026-11-25T10:00:00.000Z' }),
    ]
    open(apiFor(usd, items))

    const [same, ms, later] = (await articles()) as [HTMLElement, HTMLElement, HTMLElement]
    expect(within(same).queryByText(/Edited/)).not.toBeInTheDocument()
    expect(within(ms).getByText('Edited 20 Nov 2026')).toBeInTheDocument()
    expect(within(later).getByText('Edited 25 Nov 2026')).toBeInTheDocument()
    for (const card of [same, ms, later]) expect(within(card).getByText('20 Nov 2026').closest('time')).toHaveAttribute('datetime', '2026-11-20')
  })

  it('TC-C-706: Edit and Delete are named by type and date and sit in tab order after Add entry', async () => {
    const long = Array.from({ length: 9 }, (_, i) => `line ${i}`).join('\n')
    open(apiFor(usd, [entry({ id: 'a', type: 'buy', date: '2026-11-20', note: long })]))

    await articles()
    const names = [...section().querySelectorAll('button')].map((b) => b.getAttribute('aria-label') ?? b.textContent?.trim())
    expect(names).toEqual(['Add entry', 'Edit Buy entry of 20 Nov 2026', 'Delete Buy entry of 20 Nov 2026', 'Show more'])
    expect(section().querySelector('[tabindex]:not([tabindex="-1"])')).toBeNull()
  })

  it('TC-C-707: the empty button opens the dialog; after a save the list shows with one entry and the header button', async () => {
    const user = userEvent.setup()
    let items: unknown[] = []
    const created = entry({ id: 'new', note: 'first thesis', type: 'buy' })
    const stubs = new StubApi({
      ...routes(usd, () => items),
      [`POST /stocks/${usd.id}/theses`]: () => {
        items = [created]
        return created
      },
    })
    open(stubs)

    await user.click(await screen.findByRole('button', { name: 'Add first entry' }))
    const dialog = screen.getByRole('dialog', { name: /Add thesis entry/ })
    await user.click(within(dialog).getByRole('radio', { name: 'Buy' }))
    await user.type(within(dialog).getByRole('textbox', { name: /^Thesis/ }), 'first thesis')
    await user.click(within(dialog).getByRole('button', { name: 'Add entry' }))

    expect(await screen.findByText('1 entry')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Add entry' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add first entry' })).not.toBeInTheDocument()
    expect(screen.getByText('first thesis')).toBeInTheDocument()
  })

  it('TC-C-708: a failed read keeps the stock page working; Retry is disabled while it runs and then shows the entries', async () => {
    const user = userEvent.setup()
    const heldLists = deferred<unknown>()
    let listCalls = 0
    let thesisCalls = 0
    const stubs = new StubApi({
      ...routes(usd, () => []),
      'GET /lists': () => (++listCalls === 2 ? heldLists.promise : { items: [] }),
      [`GET /stocks/${usd.id}/theses`]: () => {
        if (++thesisCalls === 1) throw new ApiError(500, { code: 'internal' })
        return { items: [entry({ id: 'back', note: 'it came back' })] }
      },
    })
    open(stubs)

    const alert = await screen.findByRole('alert', {}, { timeout: 4000 })
    expect(alert).toHaveTextContent("Couldn't load the thesis entries.")
    for (const name of ['Classification', 'Holding']) expect(screen.getByRole('heading', { name })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Lists' })).toBeInTheDocument()
    expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Edit' })).toHaveAttribute('href', `/stocks/${usd.id}/edit`)

    const retry = within(alert).getByRole('button', { name: 'Retry' })
    await user.click(retry)
    await waitFor(() => expect(retry).toHaveAttribute('aria-disabled', 'true'))
    expect(retry.querySelector('svg')?.getAttribute('class')).toContain('motion-reduce:animate-none')
    await user.click(retry)
    expect(listCalls).toBe(2)

    heldLists.resolve({ items: [] })
    expect(await screen.findByText('it came back', {}, { timeout: 4000 })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('TC-C-709: the previous entries stay on screen while the list is re-read after a save', async () => {
    const user = userEvent.setup()
    const reread = deferred<unknown>()
    const first = entry({ id: 'old', note: 'old entry', date: '2026-01-01' })
    const added = entry({ id: 'new', note: 'new entry', date: '2026-02-02' })
    let reads = 0
    const stubs = new StubApi({
      ...routes(usd, () => []),
      [`GET /stocks/${usd.id}/theses`]: () => (++reads === 1 ? { items: [first] } : reread.promise),
      [`POST /stocks/${usd.id}/theses`]: added,
    })
    open(stubs)

    await user.click(await screen.findByRole('button', { name: 'Add entry' }))
    const dialog = screen.getByRole('dialog', { name: /Add thesis entry/ })
    await user.click(within(dialog).getByRole('radio', { name: 'Buy' }))
    await user.type(within(dialog).getByRole('textbox', { name: /^Thesis/ }), 'new entry')
    await user.click(within(dialog).getByRole('button', { name: 'Add entry' }))

    await waitFor(() => expect(stubs.callsTo(`GET /stocks/${usd.id}/theses`)).toHaveLength(2))
    // The router holds the old tree while the re-read is pending (a transition), so the dialog is still up too:
    // see the report (finding on the dialog waiting for the re-read). Text queries ignore the modal's aria-hidden.
    expect(screen.getByText('old entry')).toBeInTheDocument()
    expect(document.querySelector('[aria-busy="true"]')).toBeNull()
    expect(screen.queryByText('Loading thesis entries')).not.toBeInTheDocument()

    reread.resolve({ items: [added, first] })
    await waitFor(() => expect(screen.getAllByText('new entry').length).toBeGreaterThan(0))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.getByText('old entry')).toBeInTheDocument()
    expect(section().querySelector('[aria-busy="true"]')).toBeNull()
  })

  it('TC-C-710: the loading state is a busy region with an sr-only label and three motion-safe skeleton lines', async () => {
    open(new StubApi(routes(usd, () => deferred<unknown>().promise)))

    const label = await screen.findByText('Loading thesis entries')
    expect(label).toHaveClass('sr-only')
    const busy = label.closest('[aria-busy="true"]') as HTMLElement
    expect(busy).not.toBeNull()
    const lines = busy.querySelectorAll('[data-slot="skeleton"]')
    expect(lines).toHaveLength(3)
    for (const line of lines) expect(line.className).toContain('motion-reduce:animate-none')
  })

  it('TC-C-711: Show more appears for 9 lines and 601 characters only, toggles, and never clamps the invalidation', async () => {
    const user = userEvent.setup()
    const eight = Array.from({ length: 8 }, () => '0123456789').join('\n')
    const nine = Array.from({ length: 9 }, () => '0123456789').join('\n')
    const items = [
      entry({ id: 'l8', note: eight }),
      entry({ id: 'l9', note: nine }),
      entry({ id: 'c600', note: 'a'.repeat(600) }),
      entry({ id: 'c601', note: 'a'.repeat(601) }),
      entry({ id: 'crlf', note: Array.from({ length: 8 }, () => 'crlf').join('\r\n') }),
      entry({ id: 'inv', note: 'short', invalidation: 'i'.repeat(2000) }),
    ]
    open(apiFor(usd, items))

    const cards = await articles()
    expect(cards.map((c) => within(c).queryByRole('button', { name: 'Show more' }) !== null)).toEqual([false, true, false, true, false, false])
    expect(cards[3]?.textContent).toContain('a'.repeat(601))
    expect(cards[5]?.textContent).toContain('i'.repeat(2000))

    const button = within(cards[1] as HTMLElement).getByRole('button', { name: 'Show more' })
    const note = document.getElementById(button.getAttribute('aria-controls') ?? '') as HTMLElement
    expect(button).toHaveAttribute('aria-expanded', 'false')
    expect(note.textContent).toBe(nine)
    await user.click(button)
    expect(button).toHaveAttribute('aria-expanded', 'true')
    expect(button).toHaveTextContent('Show less')
    await user.click(button)
    expect(button).toHaveTextContent('Show more')
  })

  it('TC-C-712: markup, links, entities and Markdown in a note or invalidation stay literal text', async () => {
    const payloads = [
      '<script>alert(1)</script>',
      '<a href="javascript:alert(1)">x</a>',
      'https://example.com/a?b=1&c=2',
      '&amp; &lt;b&gt;',
      '**bold** _it_ # h1',
      'text ‮ reversed',
    ]
    open(apiFor(usd, payloads.map((p, i) => entry({ id: `p${i}`, note: p, invalidation: p }))))

    const cards = await articles()
    cards.forEach((card, i) => {
      const payload = payloads[i] as string
      expect(card.textContent?.split(payload).length).toBe(3)
    })
    expect(section().querySelectorAll('script, a, img, b, h1, strong, em, iframe')).toHaveLength(0)
    expect(screen.queryByRole('link', { name: /example\.com/ })).not.toBeInTheDocument()
  })

  it('TC-C-715: one long word and a long URL wrap in the note without fixed widths', async () => {
    open(apiFor(usd, [entry({ note: `${'w'.repeat(5000)}\nhttps://example.com/${'p'.repeat(280)}`, invalidation: 'u'.repeat(300) })]))

    const card = await screen.findByRole('article')
    const paragraph = card.querySelector('p') as HTMLElement
    expect(paragraph.className).toContain('whitespace-pre-wrap')
    expect(paragraph.className).toContain('wrap-anywhere')
    expect(card.querySelector('dd')?.className).toContain('wrap-anywhere')
    for (const el of [card, ...card.querySelectorAll('*')]) {
      expect(el.getAttribute('class') ?? '').not.toMatch(/(^|\s)(min-|max-)?w-(\[|\d)/)
    }
  })

  it('TC-C-716: the entry date reads the same in every time zone and keeps the stored string', async () => {
    const original = process.env['TZ']
    try {
      for (const [zone, offset] of [['Pacific/Kiritimati', -840], ['Etc/GMT+12', 720], ['UTC', 0]] as const) {
        process.env['TZ'] = zone
        expect(new Date(2026, 0, 1).getTimezoneOffset()).toBe(offset)
        const dates = ['2026-01-01', '2026-12-31', '2024-02-29']
        open(apiFor(usd, dates.map((date, i) => entry({ id: `d${i}`, date }))))
        await articles()
        for (const [date, shown] of [['2026-01-01', '1 Jan 2026'], ['2026-12-31', '31 Dec 2026'], ['2024-02-29', '29 Feb 2024']] as const) {
          expect(screen.getByText(shown).closest('time'), `${zone} ${date}`).toHaveAttribute('datetime', date)
        }
        cleanup()
      }
    } finally {
      if (original === undefined) delete process.env['TZ']
      else process.env['TZ'] = original
    }
  })

  it('TC-C-718: a stock that does not exist shows the not-found page and no Thesis section', async () => {
    const stubs = new StubApi({
      'GET /lists': { items: [] },
      [`GET /stocks/${usd.id}/theses`]: { items: [entry()] },
    })
    open(stubs)

    expect(await screen.findByRole('heading', { name: 'Not found' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Thesis' })).not.toBeInTheDocument()
    expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument()
  })
})
