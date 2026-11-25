import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/api-client'
import { renderApp } from '@/test/render-app'
import { makeList, makeStock, makeThesis } from '@/test/stock-fixtures'
import { StubApi, deferred } from '@/test/stub-api'

vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }), Toaster: () => null }))

const stock = makeStock({ ticker: 'NVDA', name: 'NVIDIA Corporation', gicsSector: 'Information Technology' })
const base = { 'GET /lists': { items: [makeList('core', 'Core')] }, 'GET /stocks': { items: [stock] } }
const stockRoute = `GET /stocks/${stock.id}`
const thesesRoute = `GET /stocks/${stock.id}/theses`
const api = (theses: unknown) => new StubApi({ ...base, [stockRoute]: stock, [thesesRoute]: theses })
const section = () => screen.getByRole('heading', { level: 2, name: 'Thesis' }).closest('[data-slot="card"]') as HTMLElement
const open = (stubs: StubApi) => renderApp(`/stocks/${stock.id}`, stubs)

describe('thesis section: loading', () => {
  it('TC-U-780: the page does not wait for the entries', async () => {
    const pending = deferred<unknown>()
    open(api(() => pending.promise))

    expect(await screen.findByRole('heading', { name: 'Classification' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Holding' })).toBeInTheDocument()
    const card = within(section())
    expect(card.getByText('Loading thesis entries')).toBeInTheDocument()
    expect(section().querySelector('[aria-busy="true"]')).not.toBeNull()
    expect(card.queryByText(/^\d+ entr(y|ies)$/)).not.toBeInTheDocument()
    expect(card.queryByRole('button')).not.toBeInTheDocument()
  })

  it('TC-U-781: a load error keeps the page and Retry reads again', async () => {
    let calls = 0
    const stubs = api(() => {
      calls += 1
      if (calls === 1) throw new ApiError(500, { code: 'internal' })
      return { items: [makeThesis({ id: 'e1', stockId: stock.id })] }
    })
    open(stubs)

    const alert = await screen.findByRole('alert', {}, { timeout: 4000 })
    expect(alert).toHaveTextContent("Couldn't load the thesis entries.")
    expect(screen.getByRole('heading', { name: 'Classification' })).toBeInTheDocument()
    expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument()

    await userEvent.click(within(alert).getByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(stubs.callsTo(thesesRoute).length).toBe(2), { timeout: 4000 })
    // Query the page, not a card captured earlier: the section remounts for each read.
    expect(await screen.findByText('1 entry', {}, { timeout: 4000 })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(stubs.callsTo(thesesRoute)).toHaveLength(2)
  })

  it('keeps the previous entries on screen while a re-read is pending (no skeleton flash)', async () => {
    const second = deferred<unknown>()
    let calls = 0
    const stubs = api(() => (++calls === 1 ? { items: [makeThesis({ id: 'e1', note: 'first read' })] } : second.promise))
    const { router } = open(stubs)
    expect(await screen.findByText('first read')).toBeInTheDocument()

    void router.revalidate()
    await waitFor(() => expect(stubs.callsTo(thesesRoute)).toHaveLength(2))
    expect(screen.getByText('first read')).toBeInTheDocument()
    expect(section().querySelector('[aria-busy="true"]')).toBeNull()

    second.resolve({ items: [makeThesis({ id: 'e2', note: 'second read' })] })
    expect(await screen.findByText('second read')).toBeInTheDocument()
    expect(screen.queryByText('first read')).not.toBeInTheDocument()
  })
})

describe('thesis section: entries', () => {
  it('TC-U-782: the empty state has one Add first entry button and no header button', async () => {
    open(api({ items: [] }))

    expect(await screen.findByText('No thesis yet')).toBeInTheDocument()
    const buttons = within(section()).getAllByRole('button')
    expect(buttons.map((b) => b.textContent)).toEqual(['Add first entry'])
    expect(screen.queryByRole('button', { name: 'Add entry' })).not.toBeInTheDocument()
    expect(within(section()).queryByText(/^\d+ entr(y|ies)$/)).not.toBeInTheDocument()
    expect(screen.getByText('Your own reasoning, not advice.')).toBeInTheDocument()
  })

  it('TC-U-783: an entry shows its fields and the heading names the count', async () => {
    const entry = makeThesis({
      id: 'e1',
      type: 'buy',
      date: '2026-11-20',
      note: 'A\nB',
      targetPrice: '180.5000',
      invalidation: 'x',
    })
    open(api({ items: [entry] }))

    const card = within(await screen.findByRole('article'))
    expect(card.getByText('Buy')).toBeInTheDocument()
    expect(card.getByText('20 Nov 2026').closest('time')).toHaveAttribute('datetime', '2026-11-20')
    expect(card.getByText(/A\s*B/).textContent).toBe('A\nB')
    expect(card.getByText('Target price').nextElementSibling).toHaveTextContent('$180.50')
    expect(card.getByText('Invalidation').nextElementSibling).toHaveTextContent('x')
    expect(card.queryByText(/Edited/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add entry' })).toBeInTheDocument()
    expect(screen.getByRole('list', { name: 'Thesis' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Thesis' })).toHaveAccessibleDescription('1 entry')
  })

  it('shows entries in the order the API sends and leaves out an unset target and invalidation', async () => {
    const items = [
      makeThesis({ id: 'a', type: 'update', date: '2026-10-03', note: 'second' }),
      makeThesis({ id: 'b', type: 'sell', date: '2025-03-14', note: 'third' }),
    ]
    open(api({ items: [makeThesis({ id: 'z', type: 'review', note: 'first' }), ...items] }))

    const articles = await screen.findAllByRole('article')
    expect(articles.map((a) => within(a).getByText(/first|second|third/).textContent)).toEqual(['first', 'second', 'third'])
    expect(within(articles[0] as HTMLElement).queryByText('Target price')).not.toBeInTheDocument()
    expect(within(articles[0] as HTMLElement).queryByText('Invalidation')).not.toBeInTheDocument()
    expect(within(section()).getByText('3 entries')).toBeInTheDocument()
  })

  it('shows a Thai baht target price with its symbol', async () => {
    const thai = makeStock({ ticker: 'PTT', market: 'TH', exchange: 'SET', currency: 'THB' })
    const stubs = new StubApi({
      ...base,
      [`GET /stocks/${thai.id}`]: thai,
      [`GET /stocks/${thai.id}/theses`]: { items: [makeThesis({ targetPrice: '42.2500' })] },
    })
    renderApp(`/stocks/${thai.id}`, stubs)
    expect(await screen.findByText('฿42.25')).toBeInTheDocument()
  })

  it('TC-U-785: markup in a note is shown as text', async () => {
    const note = '<img src=x onerror=alert(1)><b>bold</b>'
    open(api({ items: [makeThesis({ note, invalidation: note })] }))

    const card = await screen.findByRole('article')
    expect(card.querySelectorAll('img, b')).toHaveLength(0)
    expect(within(card).getAllByText(note)).toHaveLength(2)
  })

  it('TC-U-786: Show more follows the text rule', async () => {
    const user = userEvent.setup()
    const notes = ['a'.repeat(600), 'a'.repeat(601), Array.from({ length: 9 }, (_, i) => `line ${i}`).join('\n')]
    open(api({ items: notes.map((note, i) => makeThesis({ id: `e${i}`, note })) }))

    const articles = await screen.findAllByRole('article')
    const more = articles.map((a) => within(a).queryByRole('button', { name: 'Show more' }))
    expect(more.map((b) => b !== null)).toEqual([false, true, true])

    const button = more[1] as HTMLElement
    const note = document.getElementById(button.getAttribute('aria-controls') ?? '') as HTMLElement
    expect(button).toHaveAttribute('aria-expanded', 'false')
    expect(note).toHaveClass('line-clamp-8')
    await user.click(button)
    expect(button).toHaveAttribute('aria-expanded', 'true')
    expect(button).toHaveTextContent('Show less')
    expect(note).not.toHaveClass('line-clamp-8')
  })
})

describe('thesis section: size', () => {
  it('TC-U-787: 200 entries render within 1 s after they arrive', async () => {
    const arrive = deferred<unknown>()
    open(api(() => arrive.promise))
    expect(await screen.findByRole('heading', { name: 'Classification' })).toBeInTheDocument()

    const items = Array.from({ length: 200 }, (_, i) =>
      makeThesis({ id: `e${i}`, note: `Entry ${i}\n${'x'.repeat(300)}`, targetPrice: '180.0000', invalidation: 'Margins fall' }),
    )
    const start = performance.now()
    arrive.resolve({ items })
    await waitFor(() => expect(document.querySelectorAll('article').length).toBe(200), { timeout: 4000 })
    const elapsed = performance.now() - start
    console.log(`NFR-001 thesis section: 200 entries rendered ${elapsed.toFixed(0)} ms after they arrived`)
    expect(elapsed).toBeLessThan(1000)
  })
})

