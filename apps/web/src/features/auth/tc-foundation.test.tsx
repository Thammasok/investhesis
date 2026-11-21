/// <reference types="node" />
import { spawnSync } from 'node:child_process'
import { readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApiClient } from '@/lib/api-client'
import { createRoutes } from '@/routers/router'
import { FakeAuthClient, fakeSession } from '@/test/fake-auth-client'
import type { AuthClient } from './auth-client'
import { watchAuth } from './guards'
import { createMockAuthClient } from './mock-auth-client'
import { Spinner } from './components/spinner'
import { createSupabaseAuthClient } from './supabase-auth-client'

const WEB_ROOT = path.resolve(import.meta.dirname, '../../..')
const SRC = path.join(WEB_ROOT, 'src')

const json = (status: number, body: unknown = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

const h1 = (name: string) => screen.findByRole('heading', { level: 1, name })
const where = (router: { state: { location: { pathname: string; search: string } } }) =>
  router.state.location.pathname + router.state.location.search

const realFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = realFetch
  localStorage.clear()
})

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name)
    return statSync(full).isDirectory() ? walk(full) : [full]
  })
}

describe('TC-C-001 only the adapter imports the Supabase SDK', () => {
  const fixture = path.join(SRC, 'features/auth/fixture-tc-c-001.ts')
  afterEach(() => rmSync(fixture, { force: true }))

  it('TC-C-001: oxlint rejects a second importer with no-restricted-imports', () => {
    // Arrange
    writeFileSync(fixture, `import { createClient } from '@supabase/supabase-js'\nexport const c = createClient\n`)

    // Act
    const run = spawnSync('pnpm', ['exec', 'oxlint', fixture], { cwd: WEB_ROOT, encoding: 'utf8' })

    // Assert
    expect(run.status).not.toBe(0)
    expect(run.stdout + run.stderr).toContain('no-restricted-imports')
  })

  it('TC-C-001: the only source file that imports the SDK is supabase-auth-client.ts', () => {
    const importers = walk(SRC)
      .filter((f) => /\.(ts|tsx)$/.test(f) && !/\.test\.(ts|tsx)$/.test(f) && f !== fixture)
      .filter((f) => /from ['"]@supabase\/supabase-js['"]/.test(readFileSync(f, 'utf8')))
      .map((f) => path.relative(SRC, f))
    expect(importers).toEqual(['features/auth/supabase-auth-client.ts'])
  })
})

describe('TC-C-003 mock mode keeps the old behaviour', () => {
  it('TC-C-003: /stocks renders, no Authorization header, the menu shows the /me email', async () => {
    // Arrange
    const authClient = createMockAuthClient()
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => json(200, { id: 'm', email: 'mock@x.io', displayName: null }))
    const apiClient = createApiClient({ authClient, onSessionEnded: () => {}, fetch: fetchMock as unknown as typeof fetch })

    // Act
    const router = createMemoryRouter(createRoutes(authClient, { apiClient }), { initialEntries: ['/stocks'] })
    render(<RouterProvider router={router} />)
    await h1('Stocks')

    // Assert
    expect(router.state.location.pathname).toBe('/stocks')
    const trigger = await screen.findByRole('button', { name: 'Account menu' })
    expect(within(trigger).getByText('mock@x.io')).toBeInTheDocument()
    const headers = fetchMock.mock.calls[0][1]?.headers as Record<string, string>
    expect(headers.authorization).toBeUndefined()
  })

  it('TC-C-003: opening the sign-in page leads straight to /stocks', async () => {
    const authClient = createMockAuthClient()
    const router = createMemoryRouter(createRoutes(authClient), { initialEntries: ['/auth/sign-in'] })
    render(<RouterProvider router={router} />)
    await h1('Stocks')
    expect(router.state.location.pathname).toBe('/stocks')
  })
})

describe('TC-C-004 the session survives a reload', () => {
  it('TC-C-004: a second adapter on the same storage returns the session with no sign-in call', async () => {
    // Arrange
    const url = 'http://127.0.0.1:54399'
    const expiresAt = Math.floor(Date.now() / 1000) + 3600
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes('/auth/v1/token?grant_type=password')) {
        return json(200, {
          access_token: 'ACCESS-1',
          token_type: 'bearer',
          expires_in: 3600,
          expires_at: expiresAt,
          refresh_token: 'REFRESH-1',
          user: { id: '6f1c2b9e-0d4a-4c8e-9a51-2f6c0b7d3e11', email: 'a@example.test', aud: 'authenticated' },
        })
      }
      return json(404)
    })
    vi.stubGlobal('fetch', fetchMock)
    const first = createSupabaseAuthClient({ url, publishableKey: 'pk', origin: 'http://localhost:5173' })
    expect(await first.signIn('a@example.test', 'Abc12345')).toEqual({ ok: true })
    const callsAfterSignIn = fetchMock.mock.calls.length

    // Act: a "reload" builds a new client on the same localStorage
    const second = createSupabaseAuthClient({ url, publishableKey: 'pk', origin: 'http://localhost:5173' })
    const session = await second.getSession()

    // Assert
    expect(session).toEqual({
      accessToken: 'ACCESS-1',
      user: { id: '6f1c2b9e-0d4a-4c8e-9a51-2f6c0b7d3e11', email: 'a@example.test' },
    })
    expect(fetchMock.mock.calls.length).toBe(callsAfterSignIn)
  })
})

/** Like the real adapter, getSession() renews an expired token first. */
class RenewingFake extends FakeAuthClient {
  override getSession = async () => this.refresh()
  override getAccessToken = async () => (await this.getSession())?.accessToken ?? null
}

describe('TC-C-005 an expired but refreshable session is renewed before the page renders', () => {
  function open(auth: AuthClient, fetchMock: ReturnType<typeof vi.fn>) {
    const apiClient = createApiClient({ authClient: auth, onSessionEnded: () => {}, fetch: fetchMock as unknown as typeof fetch })
    const router = createMemoryRouter(createRoutes(auth, { apiClient }), { initialEntries: ['/lists'] })
    render(<RouterProvider router={router} />)
    return router
  }

  it('TC-C-005: when the refresh succeeds /lists renders with Bearer T2', async () => {
    const auth = new RenewingFake({ session: fakeSession('T1'), refreshResult: fakeSession('T2') })
    const fetchMock = vi.fn(async (_u: string, _i?: RequestInit) => json(200, { id: 'u', email: 'a@x.io', displayName: null }))

    const router = open(auth, fetchMock)

    await h1('Lists')
    expect(router.state.location.pathname).toBe('/lists')
    const headers = fetchMock.mock.calls[0][1]?.headers as Record<string, string>
    expect(headers.authorization).toBe('Bearer T2')
  })

  it('TC-C-005: when the refresh fails the visitor is sent to sign-in with next', async () => {
    const auth = new RenewingFake({ session: fakeSession('T1'), refreshResult: null })
    const fetchMock = vi.fn(async () => json(200))

    const router = open(auth, fetchMock)

    await h1('Sign in to your account')
    expect(where(router)).toBe('/auth/sign-in?next=%2Flists')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('TC-C-006 a refreshed token needs no navigation', () => {
  it('TC-C-006: TOKEN_REFRESHED keeps the location and shows no notice', async () => {
    const auth = FakeAuthClient.signedIn()
    const router = createMemoryRouter(createRoutes(auth), { initialEntries: ['/stocks'] })
    render(<RouterProvider router={router} />)
    await h1('Stocks')
    watchAuth(router, auth)

    auth.emit('TOKEN_REFRESHED')
    await new Promise((r) => setTimeout(r, 30))

    expect(router.state.location.pathname).toBe('/stocks')
    expect(router.state.location.state).toBeNull()
    expect(screen.queryByText(/session has ended/i)).not.toBeInTheDocument()
  })
})

describe('TC-C-050 labels and live regions', () => {
  const ROUTES: [string, string[]][] = [
    ['/auth/sign-in', ['Email', 'Password']],
    ['/auth/sign-up', ['Email', 'Password', 'Confirm password']],
    ['/auth/forgot-password', ['Email']],
  ]

  it.each(ROUTES)('TC-C-050: every input on %s resolves by its visible label', async (route, labels) => {
    const router = createMemoryRouter(createRoutes(FakeAuthClient.signedOut()), { initialEntries: [route] })
    render(<RouterProvider router={router} />)
    await screen.findByRole('heading', { level: 1 })
    for (const label of labels) expect(screen.getByLabelText(label, { selector: 'input' })).toBeInTheDocument()
    expect(document.querySelectorAll('input').length).toBe(labels.length)
  })

  it('TC-C-050: reset-password inputs resolve by label', async () => {
    const router = createMemoryRouter(createRoutes(FakeAuthClient.signedIn()), { initialEntries: ['/auth/reset-password'] })
    render(<RouterProvider router={router} />)
    await screen.findByRole('heading', { level: 1 })
    for (const label of ['New password', 'Confirm new password']) {
      expect(screen.getByLabelText(label, { selector: 'input' })).toBeInTheDocument()
    }
  })

  it('TC-C-050: a form-level error is role=alert and a notice is role=status', async () => {
    const fake = FakeAuthClient.signedOut()
    fake.nextError = 'unavailable'
    const router = createMemoryRouter(createRoutes(fake), {
      initialEntries: [{ pathname: '/auth/sign-in', state: { reason: 'session_ended' } }],
    })
    render(<RouterProvider router={router} />)
    await h1('Sign in to your account')
    expect(screen.getByRole('status')).toHaveTextContent('Your session has ended')

    await userEvent.type(screen.getByLabelText('Email'), 'a@x.io')
    await userEvent.type(screen.getByLabelText('Password'), 'Abc12345')
    await userEvent.keyboard('{Enter}')

    expect(await screen.findByRole('alert')).toBeInTheDocument()
  })

  it('TC-C-050: a field error is announced through the field it belongs to', async () => {
    const router = createMemoryRouter(createRoutes(FakeAuthClient.signedOut()), { initialEntries: ['/auth/sign-up'] })
    render(<RouterProvider router={router} />)
    await screen.findByRole('heading', { level: 1 })
    await userEvent.type(screen.getByLabelText('Email'), 'a@x.io')
    await userEvent.type(screen.getByLabelText('Password', { selector: 'input' }), 'Abc12345')
    await userEvent.type(screen.getByLabelText('Confirm password', { selector: 'input' }), 'Different1')
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }))

    const confirm = screen.getByLabelText('Confirm password', { selector: 'input' })
    await waitFor(() => expect(confirm).toHaveAttribute('aria-invalid', 'true'))
    const describedBy = confirm.getAttribute('aria-describedby') ?? ''
    expect(describedBy).not.toBe('')
    expect(document.getElementById(describedBy.split(' ')[0])).toHaveTextContent(/match/i)
  })

  it('TC-C-050: decorative icons are aria-hidden on every auth page', async () => {
    for (const route of ['/auth/sign-in', '/auth/sign-up', '/auth/forgot-password', '/auth/link-expired']) {
      const router = createMemoryRouter(createRoutes(FakeAuthClient.signedOut()), { initialEntries: [route] })
      const { unmount } = render(<RouterProvider router={router} />)
      await screen.findByRole('heading', { level: 1 })
      const exposed = [...document.querySelectorAll('svg')].filter(
        (svg) => svg.getAttribute('aria-hidden') !== 'true' && !svg.closest('[aria-hidden="true"]'),
      )
      expect(exposed, route).toHaveLength(0)
      unmount()
    }
  })
})

describe('TC-C-051 the spinner honours reduced motion', () => {
  it('TC-C-051: the spinner class list includes motion-reduce:animate-none', () => {
    const { container } = render(<Spinner />)
    expect(container.querySelector('svg')?.getAttribute('class')).toContain('motion-reduce:animate-none')
  })

  it('TC-C-051: every animate-spin outside ui/ is paired with motion-reduce:animate-none', () => {
    const offenders = walk(SRC)
      .filter((f) => /\.(ts|tsx)$/.test(f) && !/\.test\./.test(f) && !f.includes('components/ui/'))
      .filter((f) => {
        const text = readFileSync(f, 'utf8')
        return /animate-spin/.test(text) && !/motion-reduce:animate-none/.test(text)
      })
    expect(offenders).toEqual([])
  })
})
