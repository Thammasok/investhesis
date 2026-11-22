import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { toast } from 'sonner'
import { ApiError } from '@/lib/api-client'
import { renderApp } from '@/test/render-app'
import { makeList, makeStock } from '@/test/stock-fixtures'
import { StubApi } from '@/test/stub-api'

vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }), Toaster: () => null }))

const lists = [makeList('core', 'Core holdings'), makeList('watch', 'Watching'), makeList('swing', 'Swing study')]
const created = makeStock({ ticker: 'NVDA', name: 'NVIDIA Corporation' })

beforeEach(() => {
  vi.mocked(toast.success).mockClear()
  vi.mocked(toast).mockClear()
})

function newApi(listItems = lists, post: unknown = created) {
  return new StubApi({
    'GET /lists': { items: listItems },
    'GET /stocks': { items: [] },
    [`GET /stocks/${created.id}`]: created,
    'POST /stocks': post,
  })
}

async function openNew(api = newApi()) {
  const user = userEvent.setup()
  const view = renderApp('/stocks/new', api)
  await screen.findByRole('heading', { level: 1, name: 'Add stock' })
  return { user, api, ...view }
}

type User = ReturnType<typeof userEvent.setup>
const combo = (name: RegExp | string) => screen.getByRole('combobox', { name })
async function pick(user: User, name: RegExp | string, option: string) {
  await user.click(combo(name))
  await user.click(await screen.findByRole('option', { name: option }))
}
async function fillIdentity(user: User, v: { market?: string; ticker?: string; exchange?: string; name?: string } = {}) {
  await user.click(screen.getByRole('radio', { name: v.market ?? 'US' }))
  await user.type(screen.getByRole('textbox', { name: /^Ticker/ }), v.ticker ?? 'NVDA')
  await pick(user, /^Exchange/, v.exchange ?? 'NASDAQ')
  await user.type(screen.getByRole('textbox', { name: /^Company name/ }), v.name ?? 'NVIDIA Corporation')
}
const save = (user: User) => user.click(screen.getByRole('button', { name: 'Save stock' }))
const body = (api: StubApi, route = 'POST /stocks') => api.callsTo(route).at(-1)?.body as Record<string, unknown>

describe('stock form: market and cycle', () => {
  it('TC-U-090: switching market resets exchange, indexes, currency and the SET group', async () => {
    const { user } = await openNew()
    expect(screen.queryByRole('combobox', { name: /SET industry group/ })).not.toBeInTheDocument()
    await user.click(screen.getByRole('radio', { name: 'US' }))
    await pick(user, /^Exchange/, 'NASDAQ')
    await user.click(screen.getByRole('checkbox', { name: 'S&P 500' }))
    expect(screen.getByText('USD')).toBeInTheDocument()

    await user.click(screen.getByRole('radio', { name: 'TH' }))
    expect(combo(/^Exchange/)).not.toHaveTextContent('NASDAQ')
    await user.click(combo(/^Exchange/))
    expect((await screen.findAllByRole('option')).map((o) => o.textContent)).toEqual(['SET', 'mai'])
    await user.keyboard('{Escape}')
    expect(screen.getByRole('checkbox', { name: 'SET50' })).not.toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'SET100' })).not.toBeChecked()
    expect(screen.queryByRole('checkbox', { name: 'S&P 500' })).not.toBeInTheDocument()
    expect(screen.getByText('THB')).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: /SET industry group/ })).toBeInTheDocument()
  })

  it('TC-U-091: the economic cycle shows the sector default until the user picks one', async () => {
    const { user, api } = await openNew()
    await fillIdentity(user)
    await pick(user, /^Sector/, 'Utilities')
    expect(combo(/^Economic cycle/)).toHaveTextContent('Defensive')
    expect(screen.getByText('Default')).toBeInTheDocument()
    await pick(user, /^Economic cycle/, 'Cyclical')
    expect(combo(/^Economic cycle/)).toHaveTextContent('Cyclical')
    expect(screen.queryByText('Default')).not.toBeInTheDocument()
    await save(user)
    await waitFor(() => expect(api.callsTo('POST /stocks')).toHaveLength(1))
    expect(body(api).economicCycle).toBe('Cyclical')
    expect(body(api).gicsSector).toBe('Utilities')
  })

  it('TC-C-135: Not set brings the default back, a sector change moves it, and a default is not sent', async () => {
    const { user, api } = await openNew()
    await fillIdentity(user)
    expect(combo(/^Economic cycle/)).toHaveTextContent('Not set')
    expect(screen.queryByText('Default')).not.toBeInTheDocument()
    await pick(user, /^Sector/, 'Energy')
    expect(combo(/^Economic cycle/)).toHaveTextContent('Sensitive')
    await pick(user, /^Economic cycle/, 'Cyclical')
    expect(screen.queryByText('Default')).not.toBeInTheDocument()
    await pick(user, /^Economic cycle/, 'Not set')
    expect(combo(/^Economic cycle/)).toHaveTextContent('Sensitive')
    expect(screen.getByText('Default')).toBeInTheDocument()
    await pick(user, /^Sector/, 'Utilities')
    expect(combo(/^Economic cycle/)).toHaveTextContent('Defensive')
    await save(user)
    await waitFor(() => expect(api.callsTo('POST /stocks')).toHaveLength(1))
    expect(body(api)).not.toHaveProperty('economicCycle')
  })
})

describe('stock form: validation and submit', () => {
  it('TC-U-092: an empty form is blocked on the client and focus goes to Market', async () => {
    const { user, api } = await openNew()
    await save(user)
    for (const message of ['Market is required', 'Ticker is required', 'Exchange is required', 'Company name is required'])
      expect(await screen.findByText(message)).toBeInTheDocument()
    expect(api.callsTo('POST /stocks')).toHaveLength(0)
    expect(screen.getByRole('radio', { name: 'US' })).toHaveFocus()
  })

  it('TC-C-139: errors are linked to their fields, focus follows the first invalid one and errors clear on edit', async () => {
    const { user } = await openNew()
    await user.click(screen.getByRole('radio', { name: 'US' }))
    await save(user)
    const ticker = screen.getByRole('textbox', { name: /^Ticker/ })
    expect(ticker).toHaveFocus()
    expect(ticker).toHaveAttribute('aria-invalid', 'true')
    const message = screen.getByText('Ticker is required')
    expect(message).toHaveAttribute('role', 'alert')
    expect(ticker.getAttribute('aria-describedby')).toContain(message.id)
    await user.type(ticker, 'N')
    expect(ticker).not.toHaveAttribute('aria-invalid')
    expect(screen.queryByText('Ticker is required')).not.toBeInTheDocument()
  })

  it('TC-U-093: a duplicate shows an alert with a link to the saved stock and focuses it', async () => {
    const api = newApi()
    api.on('POST /stocks', () => {
      throw new ApiError(409, { code: 'stock_exists', detail: 'You already saved this stock', existingStockId: 'A' })
    })
    const { user } = await openNew(api)
    await fillIdentity(user, { ticker: 'AAPL', name: 'Apple Inc.' })
    await save(user)
    const alert = await screen.findByText('AAPL (US) is already saved.')
    const box = alert.closest('[role="alert"]') as HTMLElement
    expect(within(box).getByRole('link', { name: /Open AAPL/ })).toHaveAttribute('href', '/stocks/A')
    expect(box).toHaveFocus()
  })

  it('TC-U-096: server field errors appear next to the field named by their path', async () => {
    const api = newApi()
    api.on('POST /stocks', () => {
      throw new ApiError(400, { code: 'validation_failed', errors: [{ path: 'valueChain', message: 'is required' }] })
    })
    const { user } = await openNew(api)
    await fillIdentity(user)
    await save(user)
    const field = await screen.findByRole('textbox', { name: /^Value chain/ })
    await waitFor(() => expect(field).toHaveAttribute('aria-invalid', 'true'))
    expect(screen.getByText(/Value chain is required/)).toBeInTheDocument()
    expect(field.getAttribute('aria-describedby')).toContain(screen.getByText(/Value chain is required/).id)
    expect(field).toHaveFocus()
  })

  it('TC-C-138: a valid save sends one POST, shows Saving, toasts and opens the new stock', async () => {
    let release: (stock: unknown) => void = () => {}
    const api = newApi()
    api.on('POST /stocks', () => new Promise((resolve) => (release = resolve)))
    const { user, router } = await openNew(api)
    await fillIdentity(user)
    await user.dblClick(screen.getByRole('button', { name: 'Save stock' }))
    const pending = await screen.findByRole('button', { name: 'Saving…' })
    expect(pending).toBeDisabled()
    release(created)
    await waitFor(() => expect(router.state.location.pathname).toBe(`/stocks/${created.id}`))
    expect(api.callsTo('POST /stocks')).toHaveLength(1)
    expect(toast.success).toHaveBeenCalledWith('NVDA added')
    expect(body(api)).toMatchObject({ market: 'US', ticker: 'NVDA', exchange: 'NASDAQ', name: 'NVIDIA Corporation' })
    expect(body(api)).not.toHaveProperty('currency')
  })

  it.each([
    ['500', () => new ApiError(500, { code: 'internal' })],
    ['a network failure', () => new ApiError(0, undefined, 'network_error')],
  ])('TC-C-138: %s shows a form alert, keeps the values and re-enables Save', async (_name, makeError) => {
    const api = newApi()
    api.on('POST /stocks', () => {
      throw makeError()
    })
    const { user } = await openNew(api)
    await fillIdentity(user)
    await save(user)
    const alert = await screen.findByText(/Couldn't (save the stock|reach the server)/)
    expect(alert.closest('[role="alert"]')).toHaveFocus()
    expect(screen.getByRole('textbox', { name: /^Ticker/ })).toHaveValue('NVDA')
    expect(screen.getByRole('button', { name: 'Save stock' })).toBeEnabled()
  })

  it('TC-C-138: a 400 with two paths shows each message at its field', async () => {
    const api = newApi()
    api.on('POST /stocks', () => {
      throw new ApiError(400, {
        code: 'validation_failed',
        errors: [
          { path: 'name', message: 'must be 1-200 characters' },
          { path: 'themes.1', message: 'each theme must be 1-40 characters' },
        ],
      })
    })
    const { user } = await openNew(api)
    await fillIdentity(user)
    await save(user)
    expect(await screen.findByText('Company name must be 1-200 characters')).toBeInTheDocument()
    expect(screen.getByText('Themes each theme must be 1-40 characters')).toBeInTheDocument()
  })

  it('TC-C-131: the ticker upper-cases as typed, stops at 12, is normalised on submit and rejects bad characters', async () => {
    const { user, api } = await openNew()
    await user.click(screen.getByRole('radio', { name: 'US' }))
    const ticker = screen.getByRole('textbox', { name: /^Ticker/ })
    await user.type(ticker, 'brk.b')
    expect(ticker).toHaveValue('BRK.B')
    await user.clear(ticker)
    await user.type(ticker, 'abcdefghijklm')
    expect(ticker).toHaveValue('ABCDEFGHIJKL')
    await user.clear(ticker)
    await user.click(ticker)
    await user.paste('aapl\n')
    expect(ticker).toHaveValue('AAPL')
    expect(api.callsTo('POST /stocks')).toHaveLength(0)

    await user.clear(ticker)
    await user.type(ticker, ' pttep ')
    await pick(user, /^Exchange/, 'NYSE')
    await user.type(screen.getByRole('textbox', { name: /^Company name/ }), 'PTT E&P')
    await save(user)
    await waitFor(() => expect(api.callsTo('POST /stocks')).toHaveLength(1))
    expect(body(api).ticker).toBe('PTTEP')

    await screen.findByRole('heading', { name: 'NVDA' }).catch(() => undefined)
  })

  it('TC-C-131: a space inside the ticker or a full-width letter is a field error', async () => {
    const { user, api } = await openNew()
    await fillIdentity(user, { ticker: 'pt tep' })
    await save(user)
    expect(await screen.findByText(/^Ticker must be 1-12 characters/)).toBeInTheDocument()
    const ticker = screen.getByRole('textbox', { name: /^Ticker/ })
    await user.clear(ticker)
    await user.type(ticker, 'ＡＡＰＬ')
    await save(user)
    expect(await screen.findByText(/^Ticker must be 1-12 characters/)).toBeInTheDocument()
    expect(api.callsTo('POST /stocks')).toHaveLength(0)
  })

  it('TC-C-132: TH needs the sector and the SET group together, and a US switch drops the group', async () => {
    const { user, api } = await openNew()
    await fillIdentity(user, { market: 'TH', ticker: 'ptt', exchange: 'SET', name: 'PTT' })
    await pick(user, /SET industry group/, 'Resources')
    await save(user)
    expect(await screen.findByText(/^Sector is required when the SET industry group is set/)).toBeInTheDocument()
    expect(api.callsTo('POST /stocks')).toHaveLength(0)
    await pick(user, /^Sector/, 'Energy')
    // (d) US drops the group, (c) back to TH keeps the sector with an empty group
    await user.click(screen.getByRole('radio', { name: 'US' }))
    expect(screen.queryByRole('combobox', { name: /SET industry group/ })).not.toBeInTheDocument()
    expect(combo(/^Sector/)).toHaveTextContent('Energy')
    await user.click(screen.getByRole('radio', { name: 'TH' }))
    expect(combo(/SET industry group/)).toHaveTextContent('Not set')
    await pick(user, /^Exchange/, 'SET')
    await pick(user, /SET industry group/, 'Resources')
    await save(user)
    await waitFor(() => expect(api.callsTo('POST /stocks')).toHaveLength(1))
    expect(body(api)).toMatchObject({ market: 'TH', gicsSector: 'Energy', setIndustryGroup: 'Resources' })
  })

  it('TC-C-133: Position waits for a chain name and resets when the name is cleared', async () => {
    const { user } = await openNew()
    await user.click(combo(/^Position/))
    const options = await screen.findAllByRole('option')
    for (const o of options) {
      const enabled = ['None', 'Not set'].includes(o.textContent ?? '')
      if (enabled) expect(o).not.toHaveAttribute('data-disabled')
      else expect(o).toHaveAttribute('data-disabled')
    }
    await user.keyboard('{Escape}')
    const chain = screen.getByRole('textbox', { name: /^Value chain/ })
    expect(chain).toHaveAttribute('maxlength', '60')
    await user.type(chain, 'AI & Semis')
    await pick(user, /^Position/, 'Upstream')
    expect(combo(/^Position/)).toHaveTextContent('Upstream')
    await user.clear(chain)
    expect(combo(/^Position/)).toHaveTextContent('Not set')
  })

  it('TC-C-134: Not set is sent as nothing on create and never as __none__ or an empty string', async () => {
    const { user, api } = await openNew()
    await fillIdentity(user)
    await pick(user, /^Size/, 'Mega')
    await pick(user, /^Size/, 'Not set')
    await pick(user, /^Moat/, 'Brand')
    await pick(user, /^Moat/, 'Not set')
    await save(user)
    await waitFor(() => expect(api.callsTo('POST /stocks')).toHaveLength(1))
    const sent = JSON.stringify(body(api))
    expect(sent).not.toContain('__none__')
    expect(sent).not.toContain('""')
    expect(body(api).size ?? null).toBeNull()
    expect(body(api).moat ?? null).toBeNull()
  })
})

describe('stock form: controls', () => {
  it('TC-C-130: every control has a label, and the required ones are marked', async () => {
    await openNew()
    await userEvent.click(screen.getByRole('radio', { name: 'TH' }))
    const form = screen.getByRole('button', { name: 'Save stock' }).closest('form') as HTMLFormElement
    expect(within(form).getByRole('radiogroup', { name: /^Market/ })).toBeInTheDocument()
    for (const name of [
      /^Ticker/,
      /^Company name/,
      /^Value chain/,
    ])
      expect(within(form).getByRole('textbox', { name })).toBeInTheDocument()
    for (const name of [
      /^Exchange/,
      /^Sector/,
      /SET industry group/,
      /^Economic cycle/,
      /^Size/,
      /^Style/,
      /^Volatility/,
      /^Peter Lynch type/,
      /^Life cycle/,
      /^Moat/,
      /^Position/,
    ])
      expect(within(form).getByRole('combobox', { name })).toBeInTheDocument()
    for (const name of ['SET50', 'SET100', 'B2B', 'B2C', 'Government', 'Subscription', 'Transaction fee', 'Product sale', 'Ads', 'Rent', 'Interest', 'Core holdings', 'Watching', 'Swing study'])
      expect(within(form).getByRole('checkbox', { name })).toBeInTheDocument()
    expect(within(form).getByRole('textbox', { name: 'Add theme' })).toBeInTheDocument()
    for (const name of [/^Ticker/, /^Company name/]) expect(within(form).getByRole('textbox', { name })).toHaveAttribute('aria-required', 'true')
    expect(within(form).getByRole('combobox', { name: /^Exchange/ })).toHaveAttribute('aria-required', 'true')
    expect(within(form).getByRole('radiogroup', { name: /^Market/ })).toHaveAttribute('aria-required', 'true')
    expect(within(form).getAllByText('required', { selector: '.sr-only' })).toHaveLength(4)
    // axe-lite: nothing a user can operate is unnamed
    for (const el of form.querySelectorAll('input:not([type=hidden]), select, button, [role=combobox], [role=checkbox], [role=radio]')) {
      if (el.closest('[aria-hidden="true"]')) continue // Radix's hidden native twin of a Select
      const named = el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || el.textContent?.trim() || (el as HTMLInputElement).labels?.length
      expect(named, el.outerHTML).toBeTruthy()
    }
  })

  it('TC-U-094: the theme input adds on Enter or comma, ignores duplicates and removes on Backspace', async () => {
    const { user } = await openNew()
    const input = screen.getByRole('textbox', { name: 'Add theme' })
    const tags = () => within(screen.queryByRole('list', { name: 'Themes' }) ?? document.createElement('ul')).queryAllByRole('listitem').map((li) => li.textContent?.replace(/\s*×$/, '').trim())
    await user.type(input, 'AI{Enter}')
    expect(tags()).toEqual(['AI'])
    await user.type(input, 'ai{Enter}')
    expect(tags()).toEqual(['AI'])
    await user.type(input, 'EV,')
    expect(tags()).toEqual(['AI', 'EV'])
    await user.keyboard('{Backspace}')
    expect(tags()).toEqual(['AI'])
    expect(screen.getByRole('button', { name: 'Remove theme AI' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Remove theme AI' }))
    expect(tags()).toEqual([])
  })

  it('TC-C-136: the theme input never submits on Enter, caps at 20, stops at 40 characters and respects IME', async () => {
    const { user, api } = await openNew()
    await fillIdentity(user)
    const input = screen.getByRole('textbox', { name: 'Add theme' })
    await user.type(input, '{Enter}')
    expect(screen.queryByRole('list', { name: 'Themes' })).not.toBeInTheDocument()
    await user.type(input, 'Energy security{Enter}')
    expect(screen.getByText('Energy security')).toBeInTheDocument()
    expect(api.callsTo('POST /stocks')).toHaveLength(0)

    // IME: Enter while composing does not add the half-composed text
    const { fireEvent } = await import('@testing-library/react')
    await user.type(input, 'ไท')
    fireEvent.keyDown(input, { key: 'Enter', isComposing: true, keyCode: 229 })
    expect(screen.queryByText('ไท')).not.toBeInTheDocument()
    await user.keyboard('{Enter}')
    expect(screen.getByText('ไท')).toBeInTheDocument()

    // pinned: the 40-character limit is held by maxLength, so a 41st character is never typed
    await user.type(input, 'x'.repeat(41))
    expect(input).toHaveValue('x'.repeat(40))
    await user.clear(input)
    for (let i = 0; i < 18; i += 1) await user.type(input, `t${i}{Enter}`)
    expect(input).toBeDisabled()
    expect(screen.getByText('20 themes max')).toBeInTheDocument()
  })

  it('TC-C-137: the Lists card offers the lists, sends the ticked ones and handles none', async () => {
    const { user, api } = await openNew()
    await fillIdentity(user)
    await user.click(screen.getByRole('checkbox', { name: 'Core holdings' }))
    await user.click(screen.getByRole('checkbox', { name: 'Swing study' }))
    await save(user)
    await waitFor(() => expect(api.callsTo('POST /stocks')).toHaveLength(1))
    expect([...(body(api).listIds as string[])].sort()).toEqual(['core', 'swing'])
  })

  it('TC-C-137: with no lists the card says so and links to the Lists page; Thai names show as is', async () => {
    const view = await openNew(newApi([]))
    expect(screen.getByText(/No lists yet/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Lists page' })).toHaveAttribute('href', '/lists')
    view.unmount()
    await openNew(newApi([makeList('th', 'หุ้นหลัก')]))
    expect(screen.getByRole('checkbox', { name: 'หุ้นหลัก' })).toBeInTheDocument()
  })

  it('TC-C-141: Cancel goes back to the stocks page', async () => {
    const { user, router } = await openNew()
    await user.click(screen.getByRole('link', { name: 'Cancel' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/stocks'))
  })
})

describe('stock form: edit', () => {
  const nvda = makeStock({
    ticker: 'NVDA',
    name: 'NVIDIA Corporation',
    indexMembership: ['S&P 500'],
    gicsSector: 'Information Technology',
    economicCycle: 'Sensitive',
    moat: 'Brand',
    style: 'Value',
    customers: ['B2B'],
    themes: ['AI', 'Data center'],
    lensSources: { economicCycle: 'default', moat: 'manual', style: 'manual' },
    listIds: ['core'],
  })
  function editApi(stock = nvda, patch: unknown = { ...stock, name: 'Renamed' }) {
    return new StubApi({
      [`GET /stocks/${stock.id}`]: stock,
      [`PATCH /stocks/${stock.id}`]: patch,
      'GET /stocks': { items: [stock] },
      'GET /lists': { items: lists },
    })
  }
  async function openEdit(api = editApi(), stock = nvda) {
    const user = userEvent.setup()
    const view = renderApp(`/stocks/${stock.id}/edit`, api)
    await screen.findByRole('heading', { level: 1, name: `Edit ${stock.ticker}` })
    return { user, api, ...view }
  }

  it('TC-C-140: edit shows market and ticker as text, hides Lists and prefills every field', async () => {
    await openEdit()
    expect(screen.queryByRole('radio')).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: /^Ticker/ })).not.toBeInTheDocument()
    expect(screen.getByText('To change market or ticker, delete this stock and add it again.')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Lists' })).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: 'Core holdings' })).not.toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: /^Company name/ })).toHaveValue('NVIDIA Corporation')
    expect(combo(/^Exchange/)).toHaveTextContent('NASDAQ')
    expect(screen.getByRole('checkbox', { name: 'S&P 500' })).toBeChecked()
    expect(combo(/^Sector/)).toHaveTextContent('Information Technology')
    expect(combo(/^Economic cycle/)).toHaveTextContent('Sensitive')
    expect(screen.getByText('Default')).toBeInTheDocument()
    expect(combo(/^Moat/)).toHaveTextContent('Brand')
    expect(screen.getByRole('checkbox', { name: 'B2B' })).toBeChecked()
    expect(screen.getByText('Data center')).toBeInTheDocument()
    const trail = within(screen.getByRole('navigation', { name: 'breadcrumb' }))
    expect(trail.getByRole('link', { name: 'NVDA' })).toBeInTheDocument()
  })

  it('TC-U-095: only changed fields are sent, and a cleared one is null', async () => {
    const { user, api } = await openEdit()
    await pick(user, /^Moat/, 'Not set')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(api.callsTo(`PATCH /stocks/${nvda.id}`)).toHaveLength(1))
    expect(body(api, `PATCH /stocks/${nvda.id}`)).toEqual({ moat: null })
  })

  it('TC-C-140: a changed name, list field and cycle are sent; success toasts and returns to the stock', async () => {
    const { user, api, router } = await openEdit()
    const name = screen.getByRole('textbox', { name: /^Company name/ })
    await user.clear(name)
    await user.type(name, ' Renamed ')
    await user.click(screen.getByRole('button', { name: 'Remove theme AI' }))
    await pick(user, /^Economic cycle/, 'Cyclical')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(router.state.location.pathname).toBe(`/stocks/${nvda.id}`))
    expect(body(api, `PATCH /stocks/${nvda.id}`)).toEqual({ name: 'Renamed', themes: ['Data center'], economicCycle: 'Cyclical' })
    expect(toast.success).toHaveBeenCalledWith('NVDA updated')
  })

  it('TC-C-140: saving with no change sends nothing and leaves the page usable', async () => {
    const { user, api } = await openEdit()
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(api.callsTo(`PATCH /stocks/${nvda.id}`)).toHaveLength(0)
    expect(toast).toHaveBeenCalledWith('No changes to save')
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeEnabled()
  })

  it('TC-C-141: a missing stock is the not-found page with a way back', async () => {
    renderApp('/stocks/x/edit', new StubApi())
    expect(await screen.findByRole('heading', { name: 'Not found' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Go to stocks' })).toHaveAttribute('href', '/stocks')
  })

  it('TC-C-141: PATCH 404 shows an alert linking to /stocks', async () => {
    const api = editApi()
    api.on(`PATCH /stocks/${nvda.id}`, () => {
      throw new ApiError(404, { code: 'not_found' })
    })
    const { user } = await openEdit(api)
    await pick(user, /^Moat/, 'Not set')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    const alert = (await screen.findByText(/no longer exists/)).closest('[role="alert"]') as HTMLElement
    expect(within(alert).getByRole('link', { name: 'Go to stocks' })).toHaveAttribute('href', '/stocks')
    expect(alert).toHaveFocus()
  })

  it('TC-C-141: PATCH 400 shows the message at the exchange field and 500 an alert, keeping values', async () => {
    const api = editApi()
    api.on(`PATCH /stocks/${nvda.id}`, () => {
      throw new ApiError(400, { code: 'validation_failed', errors: [{ path: 'exchange', message: 'must be NYSE or NASDAQ for market US' }] })
    })
    const { user } = await openEdit(api)
    const name = screen.getByRole('textbox', { name: /^Company name/ })
    await user.type(name, ' Corp')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByText(/Exchange must be NYSE or NASDAQ/)).toBeInTheDocument()
    expect(combo(/^Exchange/)).toHaveAttribute('aria-invalid', 'true')
    expect(name).toHaveValue('NVIDIA Corporation Corp')

    api.on(`PATCH /stocks/${nvda.id}`, () => {
      throw new ApiError(500, { code: 'internal' })
    })
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByText("Couldn't save the stock. Try again.")).toBeInTheDocument()
    expect(name).toHaveValue('NVIDIA Corporation Corp')
  })

  it('TC-C-132: a TH stock shows its SET group, editable', async () => {
    const ptt = makeStock({
      ticker: 'PTT',
      market: 'TH',
      exchange: 'SET',
      currency: 'THB',
      gicsSector: 'Energy',
      setIndustryGroup: 'Resources',
      economicCycle: 'Sensitive',
      lensSources: { economicCycle: 'default' },
    })
    const { user, api } = await openEdit(editApi(ptt), ptt)
    expect(combo(/SET industry group/)).toHaveTextContent('Resources')
    await pick(user, /SET industry group/, 'Services')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(api.callsTo(`PATCH /stocks/${ptt.id}`)).toHaveLength(1))
    expect(body(api, `PATCH /stocks/${ptt.id}`)).toEqual({ setIndustryGroup: 'Services' })
  })
})
