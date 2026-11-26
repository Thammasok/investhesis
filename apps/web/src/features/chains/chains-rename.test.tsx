import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { toast } from 'sonner'
import { ApiError } from '@/lib/api-client'
import type { Stock } from '@/features/stocks/types'
import { renderApp } from '@/test/render-app'
import { makeList, makeStock } from '@/test/stock-fixtures'
import { DEFAULT_SETTINGS, StubApi, deferred } from '@/test/stub-api'

vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }), Toaster: () => null }))

const inChain = (name: string, tickers: string[], extra: Partial<Stock> = {}) =>
  tickers.map((t) => makeStock({ ticker: t, valueChain: name, valueChainPosition: 'Upstream', ...extra }))

function api(stocks: Stock[]) {
  return new StubApi({
    'GET /stocks': { items: stocks },
    'GET /lists': { items: [makeList('L1', 'Core', 2)] },
    'GET /settings': DEFAULT_SETTINGS,
  })
}

async function open(stub: StubApi, path = '/chains') {
  const view = renderApp(path, stub)
  await screen.findByRole('heading', { level: 1, name: 'Value chains' }, { timeout: 8000 })
  return view
}
const section = (name: string) => screen.getByRole('region', { name })
const renameButton = (chainName: string) => within(section(chainName)).getByRole('button', { name: /Rename/ })
const openRename = async (chainName: string) => {
  await userEvent.click(renameButton(chainName))
  return screen.findByRole('dialog')
}
const typeName = async (dialog: HTMLElement, text: string) => {
  const input = within(dialog).getByRole('textbox', { name: 'Chain name' })
  await userEvent.clear(input)
  if (text) await userEvent.type(input, text)
  return input
}
const renames = (stub: StubApi) => stub.callsTo('POST /chains/rename')

beforeEach(() => vi.clearAllMocks())

describe('rename chain dialog', () => {
  it('TC-U-938: a plain rename posts, toasts, re-reads and returns focus', async () => {
    // Two of the three stocks pass the Market filter, so the third is outside the view.
    const stocks = [
      ...inChain('AI semis', ['A', 'B'], { market: 'TH', exchange: 'SET', currency: 'THB' }),
      ...inChain('AI semis', ['C']),
    ]
    const stub = api(stocks)
    let renamed = false
    stub.on('POST /chains/rename', () => {
      renamed = true
      return { name: 'AI & Semis', changed: 3, merged: false }
    })
    stub.on('GET /stocks', () => ({ items: renamed ? stocks.map((s) => ({ ...s, valueChain: 'AI & Semis' })) : stocks }))
    await open(stub, '/chains?market=TH')
    const dialog = await openRename('AI semis')
    expect(within(dialog).getByText('Changes the name on 3 stocks, including any outside this view.')).toBeInTheDocument()
    const reads = stub.callsTo('GET /stocks').length
    await typeName(dialog, 'AI & Semis')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Rename' }))
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Renamed to AI & Semis · 3 stocks changed'))
    expect(renames(stub)[0]?.body).toEqual({ from: 'AI semis', to: 'AI & Semis', merge: false })
    await waitFor(() => expect(stub.callsTo('GET /stocks').length).toBe(reads + 1))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await waitFor(() => expect(renameButton('AI & Semis')).toHaveFocus())
  })

  it('TC-U-939: a known merge asks first, Back keeps the text, Merge sends merge true', async () => {
    const stocks = [...inChain('AI semis', ['A', 'B', 'C']), ...inChain('AI & Semis', ['D', 'E', 'F', 'G', 'H', 'I', 'J', 'K'])]
    const stub = api(stocks).on('POST /chains/rename', { name: 'ai & semis', changed: 3, merged: true })
    await open(stub)
    const dialog = await openRename('AI semis')
    const input = await typeName(dialog, 'ai & semis')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Rename' }))
    const title = await within(dialog).findByRole('heading', { name: 'Merge into "AI & Semis"?' })
    expect(title).toHaveFocus()
    expect(within(dialog).getByText(/"AI semis" \(3 stocks\) and "AI & Semis" \(8 stocks\) will become one chain named "ai & semis"/)).toBeInTheDocument()
    expect(renames(stub)).toHaveLength(0)

    await userEvent.click(within(dialog).getByRole('button', { name: 'Back' }))
    expect(within(dialog).getByRole('textbox', { name: 'Chain name' })).toHaveValue('ai & semis')
    expect(within(dialog).getByRole('textbox', { name: 'Chain name' })).toHaveFocus()
    expect(input).toBeDefined()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Rename' }))
    expect(renames(stub)).toHaveLength(0)
    await userEvent.click(await within(dialog).findByRole('button', { name: 'Merge 11 stocks' }))
    await waitFor(() => expect(renames(stub)).toHaveLength(1))
    expect(renames(stub)[0]?.body).toEqual({ from: 'AI semis', to: 'ai & semis', merge: true })
    // The toast counts the stocks the merge covers, not only those it had to write (`changed` is 3 here).
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Merged into ai & semis · 11 stocks'))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('TC-U-939: after a merge focus lands on the merged chain heading', async () => {
    const stocks = [...inChain('Banks', ['A']), ...inChain('Finance', ['B', 'C'])]
    const stub = api(stocks).on('POST /chains/rename', { name: 'Finance', changed: 1, merged: true })
    await open(stub)
    const dialog = await openRename('Banks')
    await typeName(dialog, 'Finance')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Rename' }))
    await userEvent.click(await within(dialog).findByRole('button', { name: 'Merge 3 stocks' }))
    await waitFor(() => expect(screen.getByRole('heading', { level: 2, name: 'Finance' })).toHaveFocus())
  })

  it('TC-U-940: a 409 from a stale page moves to the merge step with the server figures', async () => {
    const stub = api(inChain('Banks', ['A', 'B']))
    stub.on('POST /chains/rename', (request: { body: unknown }) => {
      if ((request.body as { merge: boolean }).merge) return { name: 'Finance', changed: 2, merged: true }
      throw new ApiError(409, { code: 'chain_exists', existingName: 'Finance', existingCount: 2 })
    })
    await open(stub)
    const dialog = await openRename('Banks')
    await typeName(dialog, 'Finance')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Rename' }))
    await within(dialog).findByRole('heading', { name: 'Merge into "Finance"?' })
    expect(within(dialog).getByText(/"Finance" \(2 stocks\)/)).toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Merge 4 stocks' }))
    await waitFor(() => expect(renames(stub)).toHaveLength(2))
    expect(renames(stub)[0]?.body).toMatchObject({ merge: false })
    expect(renames(stub)[1]?.body).toMatchObject({ merge: true })
  })

  it('TC-U-941: a case-only rename is a plain rename', async () => {
    const stub = api(inChain('ai & semis', ['A', 'B'])).on('POST /chains/rename', { name: 'AI & Semis', changed: 2, merged: false })
    await open(stub)
    const dialog = await openRename('ai & semis')
    await typeName(dialog, 'AI & Semis')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Rename' }))
    await waitFor(() => expect(renames(stub)).toHaveLength(1))
    expect(screen.queryByRole('heading', { name: /^Merge into/ })).toBeNull()
    expect(renames(stub)[0]?.body).toEqual({ from: 'ai & semis', to: 'AI & Semis', merge: false })
  })

  it('TC-U-942: errors keep the dialog and the typed name', async () => {
    const stub = api(inChain('Banks', ['A']))
    const answers: (() => unknown)[] = [
      () => {
        throw new ApiError(400, { code: 'validation_failed', errors: [{ path: 'to', message: 'Server says no.' }] })
      },
      () => {
        throw new ApiError(404, { code: 'chain_not_found' })
      },
    ]
    stub.on('POST /chains/rename', () => answers.shift()?.())
    await open(stub)
    let dialog = await openRename('Banks')
    const input = await typeName(dialog, 'Lenders')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Rename' }))
    await waitFor(() => expect(input).toHaveAttribute('aria-invalid', 'true'))
    expect(within(dialog).getByText('Server says no.')).toBeInTheDocument()
    expect(input).toHaveValue('Lenders')

    await userEvent.click(within(dialog).getByRole('button', { name: 'Rename' }))
    expect(await within(dialog).findByText('This chain no longer exists.')).toBeInTheDocument()
    expect(within(dialog).getByText('It may have been renamed elsewhere.')).toBeInTheDocument()
    expect(within(dialog).queryByRole('button', { name: 'Rename' })).toBeNull()
    const closers = within(dialog).getAllByRole('button', { name: 'Close' })
    await userEvent.click(closers[closers.length - 1] as HTMLElement)
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

    stub.on('POST /chains/rename', () => {
      throw new ApiError(0, {}, 'network_error')
    })
    dialog = await openRename('Banks')
    const again = await typeName(dialog, 'Lenders')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Rename' }))
    expect(await within(dialog).findByText("Couldn't rename the chain. Try again.")).toBeInTheDocument()
    expect(again).toHaveValue('Lenders')
    expect(within(dialog).getByRole('button', { name: 'Rename' })).toBeEnabled()
  })

  it('TC-U-943: an unchanged or empty name sends nothing', async () => {
    const stub = api(inChain('AI & Semis', ['A']))
    await open(stub)
    let dialog = await openRename('AI & Semis')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Rename' }))
    expect(toast).toHaveBeenCalledWith('No changes to save')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

    dialog = await openRename('AI & Semis')
    const input = await typeName(dialog, '')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Rename' }))
    expect(await within(dialog).findByText('Enter a name of 1 to 60 characters.')).toBeInTheDocument()
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveFocus()
    expect(renames(stub)).toHaveLength(0)
  })

  it('TC-U-944: cancel returns focus to the opener', async () => {
    const stub = api([...inChain('Banks', ['A']), ...inChain('Oil', ['B'])])
    await open(stub)
    const dialog = await openRename('Banks')
    const input = within(dialog).getByRole('textbox', { name: 'Chain name' })
    expect(input).toHaveValue('Banks')
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(renameButton('Banks')).toHaveFocus()
    expect(renames(stub)).toHaveLength(0)
  })

  it('a second Enter while saving sends one request and the dialog stays until the answer', async () => {
    const stub = api(inChain('Banks', ['A']))
    const gate = deferred<unknown>()
    stub.on('POST /chains/rename', () => gate.promise)
    await open(stub)
    const dialog = await openRename('Banks')
    await typeName(dialog, 'Lenders')
    await userEvent.keyboard('{Enter}{Enter}')
    await waitFor(() => expect(renames(stub)).toHaveLength(1))
    await userEvent.keyboard('{Escape}')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    gate.resolve({ name: 'Lenders', changed: 1, merged: false })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(renames(stub)).toHaveLength(1)
  })

  it('TC-U-945: the name limit counts code points, so 60 emoji fit and a 61st is cut', async () => {
    const stub = api(inChain('AI semis', ['A']))
    await open(stub)
    const dialog = await openRename('AI semis')
    const input = within(dialog).getByRole('textbox', { name: 'Chain name' }) as HTMLInputElement
    await userEvent.clear(input)
    await userEvent.click(input)
    await userEvent.paste('\u{1F600}'.repeat(61))
    expect(Array.from(input.value)).toHaveLength(60)
  })

  it('TC-U-946: when the renamed chain is filtered out of view, focus goes to the page heading', async () => {
    const stocks = inChain('AI semis', ['A', 'B'])
    const stub = api(stocks)
    let renamed = false
    stub.on('POST /chains/rename', () => {
      renamed = true
      return { name: 'AI & Semis', changed: 2, merged: false }
    })
    stub.on('GET /stocks', () => ({ items: renamed ? stocks.map((s) => ({ ...s, valueChain: 'AI & Semis' })) : stocks }))
    await open(stub, '/chains?valueChain=AI%20semis')
    const dialog = await openRename('AI semis')
    await typeName(dialog, 'AI & Semis')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Rename' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Value chains' })).toHaveFocus())
  })
})
