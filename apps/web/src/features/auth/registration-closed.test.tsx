import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { createMemoryRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { describe, expect, it } from 'vitest'
import { createRoutes } from '@/routers/router'
import { FakeAuthClient } from '@/test/fake-auth-client'
import { emptyApi } from '@/test/stub-api'
import type { AuthClient, AuthErrorCode } from './auth-client'
import { authErrorMessages } from './auth-errors'
import { createMockAuthClient } from './mock-auth-client'
import { mapSupabaseError } from './map-supabase-error'
import { createSupabaseAuthClient } from './supabase-auth-client'

// Accounts are created by the owner (user-auth v1.2): the web has no registration entry point.
const REGISTRATION = /sign.?up|invite|register|create (an )?account|allowlist/i

type Entry = string | { pathname: string; state?: unknown }

function renderAt(entry: Entry, auth: AuthClient = FakeAuthClient.signedOut()) {
  const router = createMemoryRouter(createRoutes(auth, { apiClient: emptyApi().client() }), { initialEntries: [entry] })
  render(<RouterProvider router={router} />)
  return router
}

const h1 = (name: string) => screen.findByRole('heading', { level: 1, name })

describe('the registration route is gone', () => {
  it('TC-U-303: /auth/sign-up?next=... renders not-found with no password field', async () => {
    renderAt('/auth/sign-up?next=%2Fstocks')
    await h1('Page not found')
    expect(document.querySelectorAll('input[type="password"], input[autocomplete="new-password"]')).toHaveLength(0)
  })

  it('TC-U-304: a signed-in visitor also gets not-found, with no redirect', async () => {
    const router = renderAt('/auth/sign-up', FakeAuthClient.signedIn())
    await h1('Page not found')
    expect(router.state.location.pathname).toBe('/auth/sign-up')
  })

  it.each(['/auth/sign-up', '/auth/sign-up/', '/auth/sign-up?next=%2Flists', '/auth/SIGN-UP'])(
    'TC-C-301: %s is not a registration form and does not redirect to sign-in',
    async (entry) => {
      const router = renderAt(entry)
      await h1('Page not found')
      expect(screen.queryByLabelText(/password/i)).not.toBeInTheDocument()
      expect(router.state.location.pathname.toLowerCase()).toMatch(/^\/auth\/sign-up\/?$/)
    },
  )

  it('TC-C-313: mock mode keeps sign-up closed and /stocks open', async () => {
    renderAt('/auth/sign-up', createMockAuthClient())
    await h1('Page not found')
    document.body.innerHTML = ''
    const router = renderAt('/stocks', createMockAuthClient())
    await h1('Stocks')
    expect(router.state.location.pathname).toBe('/stocks')
  })
})

describe('the sign-in page offers no registration', () => {
  it('TC-U-305: no sign-up link or text; Forgot password remains', async () => {
    renderAt('/auth/sign-in')
    await h1('Sign in to your account')
    const links = screen.getAllByRole('link')
    expect(links.filter((link) => /sign-?up/i.test(link.getAttribute('href') ?? ''))).toEqual([])
    expect(document.body.textContent).not.toMatch(/create account|sign up/i)
    expect(screen.getByRole('link', { name: 'Forgot password?' })).toBeInTheDocument()
  })

  it('TC-C-304: wrong password and unknown email show the same alert, with no registration hint', async () => {
    const texts: string[] = []
    for (const email of ['known@example.test', 'ghost@example.test']) {
      const fake = FakeAuthClient.signedOut()
      fake.errorsByEmail[email] = 'invalid_credentials'
      renderAt('/auth/sign-in', fake)
      await h1('Sign in to your account')
      await userEvent.type(screen.getByLabelText('Email'), email)
      await userEvent.type(screen.getByLabelText('Password'), 'Abc12345{Enter}')
      const alert = await screen.findByRole('alert')
      texts.push(alert.textContent ?? '')
      expect(document.body.textContent).not.toMatch(REGISTRATION)
      document.body.innerHTML = ''
    }
    expect(texts[0]).toBe(texts[1])
  })

  it('TC-U-306 / TC-C-303: an unconfirmed account resends once and reaches check-email with state', async () => {
    const fake = FakeAuthClient.signedOut()
    const router = renderAt('/auth/sign-in', fake)
    await h1('Sign in to your account')
    fake.nextError = 'email_not_confirmed'
    await userEvent.type(screen.getByLabelText('Email'), 'a@example.test')
    await userEvent.type(screen.getByLabelText('Password'), 'Abc12345{Enter}')
    await userEvent.click(await screen.findByRole('button', { name: 'Resend' }))

    await h1('Check your email')
    expect(fake.calls.resend).toBe(1)
    expect(router.state.location.pathname).toBe('/auth/check-email')
    expect(router.state.location.search).toBe('')
    expect(router.state.location.state).toEqual({ email: 'a@example.test', justSent: true })
  })

  it.each([
    ['rate_limited', 'Too many attempts. Try again in a few minutes.'],
    ['unavailable', "Can't reach the sign-in service. Try again."],
  ] as const)('TC-C-303: a %s resend keeps the user on sign-in with the password', async (code, text) => {
    const fake = FakeAuthClient.signedOut()
    const router = renderAt('/auth/sign-in', fake)
    await h1('Sign in to your account')
    fake.nextError = 'email_not_confirmed'
    await userEvent.type(screen.getByLabelText('Email'), 'a@example.test')
    await userEvent.type(screen.getByLabelText('Password'), 'Abc12345{Enter}')
    const resend = await screen.findByRole('button', { name: 'Resend' })
    fake.nextError = code
    await userEvent.click(resend)

    await waitFor(() => expect(screen.getAllByRole('alert').map((a) => a.textContent).join(' ')).toContain(text))
    expect(router.state.location.pathname).toBe('/auth/sign-in')
    expect(screen.getByLabelText('Password')).toHaveValue('Abc12345')
  })
})

describe('no registration copy or API remains', () => {
  it('TC-U-307: no client has a signUp member', () => {
    const supabase = createSupabaseAuthClient({ url: 'http://127.0.0.1:1', publishableKey: 'pk', origin: 'http://localhost' })
    const clients = [FakeAuthClient.signedOut(), createMockAuthClient(), supabase]
    expect(clients.map((client) => 'signUp' in client)).toEqual([false, false, false])
  })

  it('TC-U-308: the old refusal code maps to unknown', () => {
    expect(mapSupabaseError({ status: 403, message: 'signup_not_allowed' })).toBe('unknown')
    expect(mapSupabaseError({ code: 'signup_not_allowed' })).toBe('unknown')
  })

  it('TC-C-302: no error copy mentions registration and the old code is not a member', () => {
    expect(Object.keys(authErrorMessages)).not.toContain('signup_not_allowed')
    for (const code of Object.keys(authErrorMessages) as AuthErrorCode[]) {
      expect(authErrorMessages[code], code).not.toMatch(REGISTRATION)
    }
  })

  it.each([
    ['/auth/sign-in'],
    ['/auth/forgot-password'],
    [{ pathname: '/auth/check-email', state: { email: 'a@example.test' } }],
    [{ pathname: '/auth/link-expired', state: { type: 'email' } }],
    [{ pathname: '/auth/link-expired', state: { type: 'recovery' } }],
    [{ pathname: '/auth/link-expired', state: { type: 'unknown' } }],
  ] as [Entry][])('TC-C-302 / TC-C-308: %j has no registration text or link', async (entry) => {
    renderAt(entry)
    await screen.findByRole('heading', { level: 1 })
    expect(document.body.textContent).not.toMatch(REGISTRATION)
    const hrefs = screen.queryAllByRole('link').map((link) => link.getAttribute('href') ?? '')
    expect(hrefs.filter((href) => REGISTRATION.test(href))).toEqual([])
  })

  it('TC-C-302: reset-password has no registration text', async () => {
    renderAt('/auth/reset-password', FakeAuthClient.signedIn())
    await screen.findByRole('heading', { level: 1 })
    expect(document.body.textContent).not.toMatch(REGISTRATION)
  })

  it('TC-C-309: non-test web source has no sign-up code beyond reviewed comments', () => {
    const SRC = path.resolve(__dirname, '../..')
    const walk = (dir: string): string[] =>
      readdirSync(dir).flatMap((name) => {
        const full = path.join(dir, name)
        return statSync(full).isDirectory() ? walk(full) : [full]
      })
    const pattern = /sign-?up|invite-only|signup_not_allowed|isAlreadyRegistered/i
    const hits = walk(SRC)
      .filter((file) => /\.(ts|tsx)$/.test(file) && !/\.test\.(ts|tsx)$/.test(file))
      .flatMap((file) =>
        readFileSync(file, 'utf8')
          .split('\n')
          .filter((line) => pattern.test(line) && !/^\s*(\/\/|\*|\/\*)/.test(line))
          .map((line) => `${path.relative(SRC, file)}: ${line.trim()}`),
      )
    // The only code line is Supabase's own name for the confirmation-resend type.
    expect(hits).toEqual([expect.stringContaining("auth.resend({ type: 'signup', email })")])
  })
})
