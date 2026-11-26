import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { toast } from 'sonner'
import { sessionEndedHandler } from '@/features/auth/guards'
import { createApiClient } from '@/lib/api-client'
import { createRoutes } from '@/routers/router'
import { FakeAuthClient, fakeSession } from '@/test/fake-auth-client'
import { chainRegion, held, inChain, openChains, openRenameOf, renameButtonOf, serverApi, stockOf, typeName, vcA } from './cases-helpers'

vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }), Toaster: () => null }))
beforeEach(() => vi.clearAllMocks())

const submit = (dialog: HTMLElement) => userEvent.click(within(dialog).getByRole('button', { name: 'Rename' }))
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

describe('rename through the real API client', () => {
  function appWith(auth: FakeAuthClient, postAnswers: Response[]) {
    const stocks = inChain('Banks', 'A', 2)
    const calls: { url: string; method: string; auth: string | undefined; body: string | undefined }[] = []
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const headers = (init?.headers ?? {}) as Record<string, string>
      calls.push({ url, method: init?.method ?? 'GET', auth: headers.authorization, body: init?.body as string | undefined })
      if (url === '/api/chains/rename') return postAnswers.shift() ?? json(500, {})
      if (url === '/api/stocks') return json(200, { items: stocks })
      if (url === '/api/lists') return json(200, { items: [] })
      if (url === '/api/settings') return json(200, { concentrationThreshold: 40, usdThbRate: null, usdThbRateUpdatedAt: null })
      return json(200, { id: 'user-1', email: 'investor@example.com', displayName: null })
    })
    // The router needs the client and the client needs the router (to end the session), so the router is read lazily.
    const holder: { router?: ReturnType<typeof createMemoryRouter> } = {}
    const apiClient = createApiClient({
      authClient: auth,
      fetch: fetchMock as unknown as typeof fetch,
      onSessionEnded: (path) => sessionEndedHandler(holder.router!)(path),
      getCurrentPath: () => holder.router!.state.location.pathname + holder.router!.state.location.search,
    })
    holder.router = createMemoryRouter(createRoutes(auth, { apiClient }), { initialEntries: ['/chains'] })
    render(<RouterProvider router={holder.router} />)
    return { router: holder.router, calls, fetchMock }
  }

  it('TC-C-938 an expired token is refreshed once and the same rename body is sent again with the new token', async () => {
    const auth = new FakeAuthClient({ session: fakeSession('T1'), refreshResult: fakeSession('T2') })
    const { calls } = appWith(auth, [json(401, { code: 'unauthenticated' }), json(200, { name: 'Lenders', changed: 2, merged: false })])
    await screen.findByRole('heading', { level: 1, name: 'Value chains' }, { timeout: 8000 })
    const dialog = await openRenameOf('Banks')
    await typeName(dialog, 'Lenders')

    await submit(dialog)

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    const posts = calls.filter((c) => c.method === 'POST')
    expect(posts).toHaveLength(2)
    expect(posts.map((p) => p.auth)).toEqual(['Bearer T1', 'Bearer T2'])
    expect(posts[1]?.body).toBe(posts[0]?.body)
    expect(JSON.parse(posts[0]?.body as string)).toEqual({ from: 'Banks', to: 'Lenders', merge: false })
    expect(auth.calls.refresh).toBe(1)
  })

  it('TC-C-938 when the refresh fails the session ends at sign-in and the typed name is not in the address', async () => {
    const auth = new FakeAuthClient({ session: fakeSession('T1'), refreshResult: null })
    const { router, calls } = appWith(auth, [json(401, { code: 'unauthenticated' })])
    await screen.findByRole('heading', { level: 1, name: 'Value chains' }, { timeout: 8000 })
    const dialog = await openRenameOf('Banks')
    await typeName(dialog, 'SecretChainName')

    await submit(dialog)

    await waitFor(() => expect(router.state.location.pathname).toBe('/auth/sign-in'), { timeout: 5000 })
    expect(router.state.location.search).toBe('?next=%2Fchains')
    expect(router.state.location.search + JSON.stringify(router.state.location.state)).not.toContain('SecretChainName')
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(1)
  })
})

describe('focus after a rename', () => {
  const base = () => [...inChain('Banks', 'A', 1), ...inChain('oil', 'O', 1), ...inChain('Finance', 'F', 1)]
  const rename = async (chain: string, typed: string) => {
    const dialog = await openRenameOf(chain)
    await typeName(dialog, typed)
    await submit(dialog)
    return dialog
  }

  it('TC-C-939 (a) a plain rename puts focus on the Rename button of the renamed, re-sorted chain', async () => {
    await openChains('/chains', serverApi(base()))
    await rename('Banks', 'Zeta & Co')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await waitFor(() => expect(renameButtonOf('Zeta & Co')).toHaveFocus())
    expect(document.activeElement).not.toBe(document.body)
  })

  it('TC-C-939 (b) a case-only rename keeps the key and returns focus to that Rename button', async () => {
    await openChains('/chains', serverApi(base()))
    await rename('oil', 'Oil')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await waitFor(() => expect(renameButtonOf('Oil')).toHaveFocus())
    expect(renameButtonOf('Oil')).toHaveAttribute('data-chain-rename', 'oil')
  })

  it('TC-C-939 (c) a merge puts focus on the merged chain heading', async () => {
    await openChains('/chains', serverApi(base()))
    const dialog = await rename('Banks', 'Finance')
    await userEvent.click(await within(dialog).findByRole('button', { name: 'Merge 2 stocks' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await waitFor(() => expect(screen.getByRole('heading', { level: 2, name: 'Finance' })).toHaveFocus())
  })

  it('TC-C-939 (d) a rename that leaves the view keeps the address and puts focus on the page heading', async () => {
    const { router } = await openChains('/chains?valueChain=Banks', serverApi(base()))
    await rename('Banks', 'Banks & Co')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Value chains' })).toHaveFocus())
    expect(router.state.location.search).toBe('?valueChain=Banks')
    expect(screen.queryByRole('region', { name: 'Banks & Co' })).toBeNull()
  })

  it('TC-C-939 (e) Escape returns focus to the Rename button of the chain', async () => {
    await openChains('/chains', serverApi(base()))
    await openRenameOf('Finance')
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(renameButtonOf('Finance')).toHaveFocus()
  })
})

describe('buttons, tab order and privacy', () => {
  it('TC-C-940 every chain has a Rename and a Stocks control inside its own named region (the names themselves repeat)', async () => {
    await openChains('/chains', serverApi(vcA()))

    const renames = screen.getAllByRole('button', { name: 'Rename' })
    expect(renames).toHaveLength(2)
    // The proposed aria-labels ("Rename chain AI & Semis") are not in the product: the accessible names are plain.
    expect(screen.queryByRole('button', { name: /Rename chain/ })).toBeNull()
    for (const title of ['AI & Semis', 'Oil & Gas']) {
      const region = chainRegion(title)
      const button = within(region).getByRole('button', { name: 'Rename' })
      expect(button).toHaveAttribute('data-chain-rename', title.toLocaleLowerCase('en'))
      expect(within(region).getByRole('link', { name: 'Stocks' })).toBeInTheDocument()
    }
  })

  it('TC-C-941 Tab visits the controls in page order and Enter and Escape drive the dialog', async () => {
    const stocks = vcA()
    await openChains('/chains?market=US', serverApi(stocks))
    const order: string[] = []
    const label = (el: Element) => el.getAttribute('aria-label') ?? el.getAttribute('href') ?? (el.textContent ?? '').trim().slice(0, 30)
    for (let i = 0; i < 40; i++) {
      await userEvent.tab()
      order.push(label(document.activeElement as Element))
      if (order[order.length - 1] === '/stocks/s-INTC') break
    }
    const at = (needle: string) => order.findIndex((o) => o === needle || o.startsWith(needle))
    const sequence = ['/concentration?scope=all&lens=valueChain&measure=count&market=US', 'All stocks', 'Search stocks', 'Filters', 'Remove filter Market: US', 'Clear all', '/stocks?market=US&valueChain=AI+%26+Semis', 'Rename', '/stocks/s-ASML', '/stocks/s-AMAT', '/stocks/s-TSM', '/stocks/s-NVDA', '/stocks/s-MSFT', '/stocks/s-INTC']
    const positions = sequence.map((s) => at(s))
    expect(positions.every((p) => p >= 0), JSON.stringify(order)).toBe(true)
    expect([...positions].sort((a, b) => a - b)).toEqual(positions)
    expect(document.querySelectorAll('[tabindex]:not([tabindex="-1"]):not([tabindex="0"])')).toHaveLength(0)

    // Enter on Rename opens the dialog, Esc closes it.
    const rename = renameButtonOfFirst()
    rename.focus()
    await userEvent.keyboard('{Enter}')
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(rename).toHaveFocus()
  })

  it('TC-C-941 Set position links follow their entry', async () => {
    await openChains('/chains', serverApi([stockOf('BCP1', { valueChain: 'Oil', valueChainPosition: 'None' }), stockOf('BCP2', { valueChain: 'Oil', valueChainPosition: 'None' })]))
    const links = Array.from(document.querySelectorAll('section ul a')).map((a) => a.getAttribute('href'))
    expect(links).toEqual(['/stocks/s-BCP1', '/stocks/s-BCP1/edit', '/stocks/s-BCP2', '/stocks/s-BCP2/edit'])
  })

  it('TC-C-942 the rename request carries only from, to and merge, and no amount reaches the screen, a toast or another origin', async () => {
    const secret = held('98765.4321', '12345.6789', 'USD')
    const stocks = [stockOf('S1', { valueChain: 'Banks', valueChainPosition: 'Upstream', holding: secret }), stockOf('S2', { valueChain: 'Finance', valueChainPosition: 'Upstream', holding: secret })]
    const stub = serverApi(stocks, { concentrationThreshold: 40, usdThbRate: '36.123456', usdThbRateUpdatedAt: null })
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    await openChains('/chains', stub)

    let dialog = await openRenameOf('Banks')
    await typeName(dialog, 'Lenders')
    await submit(dialog)
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    dialog = await openRenameOf('Lenders')
    await typeName(dialog, 'Finance')
    await submit(dialog)
    await within(dialog).findByRole('heading', { name: /^Merge into/ })
    const mergeText = dialog.textContent ?? ''
    await userEvent.click(within(dialog).getByRole('button', { name: /^Merge/ }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

    const bodies = stub.callsTo('POST /chains/rename').map((c) => c.body as object)
    expect(bodies).toHaveLength(2)
    for (const body of bodies) expect(Object.keys(body).sort()).toEqual(['from', 'merge', 'to'])
    const spoken = JSON.stringify([...vi.mocked(toast).mock.calls, ...vi.mocked(toast.success).mock.calls, mergeText])
    expect(spoken + JSON.stringify(bodies)).not.toMatch(/98765|12345|36\.1234/)
    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })
})

const renameButtonOfFirst = () => screen.getAllByRole('button', { name: 'Rename' })[0] as HTMLElement
