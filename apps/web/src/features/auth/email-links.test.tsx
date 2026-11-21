import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StrictMode } from 'react'
import { createMemoryRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRoutes } from '@/routers/router'
import { FakeAuthClient, fakeSession } from '@/test/fake-auth-client'

vi.mock('sonner', () => ({ toast: { success: vi.fn() } }))

type Entry = string | { pathname: string; search?: string; state?: unknown }

function renderAt(entry: Entry, fake = FakeAuthClient.signedOut(), strict = false) {
  const router = createMemoryRouter(createRoutes(fake), { initialEntries: [entry] })
  const ui = <RouterProvider router={router} />
  render(strict ? <StrictMode>{ui}</StrictMode> : ui)
  return { router, fake }
}

const h1 = (name: string) => screen.findByRole('heading', { level: 1, name })
const path = (router: { state: { location: { pathname: string; search: string } } }) =>
  router.state.location.pathname + router.state.location.search
const stateOf = (router: { state: { location: { state: unknown } } }) => router.state.location.state

function withLinks(links: Record<string, 'email' | 'recovery'>, session = false) {
  const fake = session ? FakeAuthClient.signedIn() : FakeAuthClient.signedOut()
  fake.validLinks = links
  return fake
}

beforeEach(() => vi.mocked(toast.success).mockClear())
afterEach(() => vi.useRealTimers())

describe('/auth/confirm', () => {
  it('TC-U-028: a valid email link signs in, lands on next, replaces history, toasts', async () => {
    const { router, fake } = renderAt('/auth/confirm?token_hash=h1&type=email&next=%2Flists', withLinks({ h1: 'email' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/lists'))
    expect(fake.args.verify).toEqual([['h1', 'email']])
    expect(router.state.historyAction).toBe('REPLACE')
    expect(router.state.location.search).toBe('')
    expect(toast.success).toHaveBeenCalledWith('Email confirmed. Welcome to Investhesis.')
  })

  it('TC-U-029: a recovery link always lands on reset-password', async () => {
    const { router } = renderAt('/auth/confirm?token_hash=h2&type=recovery&next=%2Flists', withLinks({ h2: 'recovery' }))

    await waitFor(() => expect(path(router)).toBe('/auth/reset-password'))
    await h1('Choose a new password')
    expect(toast.success).not.toHaveBeenCalled()
  })

  it('TC-U-030: bad links go to link-expired with the link type', async () => {
    const cases: Array<[string, string]> = [
      ['?token_hash=h3&type=email', 'email'],
      ['?type=email', 'email'],
      ['?token_hash=h4', 'unknown'],
      ['?token_hash=h4&type=magiclink', 'unknown'],
      ['?token_hash=h3&type=email&next=%2F%2Fevil.example', 'email'],
      ['?type=recovery', 'recovery'],
    ]
    for (const [search, type] of cases) {
      const { router, fake } = renderAt({ pathname: '/auth/confirm', search })
      await waitFor(() => expect(router.state.location.pathname).toBe('/auth/link-expired'))
      expect(stateOf(router)).toEqual({ type })
      expect(router.state.historyAction).toBe('REPLACE')
      if (!search.includes('token_hash') || !search.includes('type=')) expect(fake.calls.verify).toBe(0)
      document.body.innerHTML = ''
    }
  })

  it('TC-C-036: a hostile next on a valid email link lands on /stocks', async () => {
    for (const next of ['//evil.example', 'https://evil.example/']) {
      const { router } = renderAt({
        pathname: '/auth/confirm',
        search: `?token_hash=h5&type=email&next=${encodeURIComponent(next)}`,
      }, withLinks({ h5: 'email' }))
      await waitFor(() => expect(router.state.location.pathname).toBe('/stocks'))
      document.body.innerHTML = ''
    }
  })

  it('TC-C-034: shows the confirming screen while the link is verified', async () => {
    let release = () => {}
    const fake = withLinks({ h1: 'email', h2: 'recovery' })
    fake.verifyGate = new Promise<void>((resolve) => (release = resolve))

    const first = renderAt('/auth/confirm?token_hash=h1&type=email', fake)
    expect(await screen.findByText('Confirming your email…')).toBeInTheDocument()
    expect(document.querySelector('svg[aria-hidden="true"].animate-spin')).not.toBeNull()
    await act(async () => release())
    await waitFor(() => expect(first.router.state.location.pathname).toBe('/stocks'))
    document.body.innerHTML = ''

    const gated = withLinks({ h2: 'recovery' })
    gated.verifyGate = new Promise<void>(() => {})
    renderAt('/auth/confirm?token_hash=h2&type=recovery', gated)
    expect(await screen.findByText('Checking your link…')).toBeInTheDocument()
  })

  it('TC-C-035: verifies once under StrictMode and never renders the hash', async () => {
    const { router, fake } = renderAt('/auth/confirm?token_hash=SECRETHASH&type=email', withLinks({ SECRETHASH: 'email' }), true)

    await waitFor(() => expect(router.state.location.pathname).toBe('/stocks'))
    expect(fake.calls.verify).toBe(1)
    expect(document.body.innerHTML).not.toContain('SECRETHASH')
  })
})

describe('/auth/link-expired', () => {
  it('TC-C-037: email link offers a new confirmation link', async () => {
    const { router, fake } = renderAt({ pathname: '/auth/link-expired', state: { type: 'email' } })
    await h1('This link has expired or was already used')
    expect(screen.getByText('Links work once and expire after 1 hour.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to sign in' })).toHaveAttribute('href', '/auth/sign-in')

    await userEvent.type(screen.getByLabelText('Email'), 'a@x.io')
    await userEvent.click(screen.getByRole('button', { name: 'Send a new link' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/auth/check-email'))
    expect(fake.args.resend).toEqual(['a@x.io'])
    expect(stateOf(router)).toEqual({ email: 'a@x.io', justSent: true })
  })

  it('TC-C-037: recovery link offers a new reset link and shows the sent state', async () => {
    const { router, fake } = renderAt({ pathname: '/auth/link-expired', state: { type: 'recovery' } })
    await h1('This link has expired or was already used')

    await userEvent.type(screen.getByLabelText('Email'), 'a@x.io')
    await userEvent.click(screen.getByRole('button', { name: 'Send a new link' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/auth/forgot-password'))
    expect(fake.args.reset).toEqual(['a@x.io'])
    expect(await h1('Check your email')).toBeInTheDocument()
    expect(screen.getByText(/If an account exists for a@x\.io/)).toBeInTheDocument()
  })

  it('TC-C-037: an unknown type shows both outline actions', async () => {
    const { router, fake } = renderAt({ pathname: '/auth/link-expired', state: { type: 'unknown' } })
    await h1('This link has expired or was already used')
    expect(screen.queryByRole('button', { name: 'Send a new link' })).toBeNull()

    await userEvent.type(screen.getByLabelText('Email'), 'a@x.io')
    await userEvent.click(screen.getByRole('button', { name: 'Reset password' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/auth/forgot-password'))
    expect(fake.args.reset).toEqual(['a@x.io'])
    expect(screen.getByRole('button', { name: 'Resend in 60s' })).toBeDisabled()
  })

  it('TC-C-037: no or garbage state is treated as unknown', async () => {
    renderAt({ pathname: '/auth/link-expired', state: { type: 'bogus' } })
    await h1('This link has expired or was already used')
    expect(screen.getByRole('button', { name: 'Resend confirmation' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reset password' })).toBeInTheDocument()
  })

  it('TC-C-037: signed in shows the already-signed-in variant without a form', async () => {
    renderAt({ pathname: '/auth/link-expired', state: { type: 'email' } }, FakeAuthClient.signedIn())
    await h1('You\'re already signed in.')
    expect(screen.getByRole('link', { name: 'Go to Stocks' })).toHaveAttribute('href', '/stocks')
    expect(screen.queryByLabelText('Email')).toBeNull()
    expect(screen.getByText('Links work once and expire after 1 hour.')).toBeInTheDocument()
  })

  it('shows the mapped error when resending fails', async () => {
    const fake = FakeAuthClient.signedOut()
    renderAt({ pathname: '/auth/link-expired', state: { type: 'email' } }, fake)
    await h1('This link has expired or was already used')
    fake.nextError = 'rate_limited'
    await userEvent.type(screen.getByLabelText('Email'), 'a@x.io')
    await userEvent.click(screen.getByRole('button', { name: 'Send a new link' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Too many attempts. Try again in a few minutes.')
  })
})

describe('/auth/forgot-password', () => {
  async function submit(email: string) {
    await userEvent.type(screen.getByLabelText('Email'), email)
    await userEvent.click(screen.getByRole('button', { name: 'Send reset link' }))
  }

  it('TC-U-031 / TC-C-038: shows the same sent state for any email and focuses its heading', async () => {
    const { fake } = renderAt('/auth/forgot-password')
    await h1('Reset your password')
    await submit('nobody@x.io')

    const heading = await h1('Check your email')
    expect(heading).toHaveFocus()
    expect(
      screen.getByText('If an account exists for nobody@x.io, we sent a link to reset its password. It expires in 1 hour.'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(fake.args.reset).toEqual(['nobody@x.io'])
    expect(screen.getByRole('link', { name: 'Back to sign in' })).toBeInTheDocument()
  })

  it('TC-U-032: a rate limit shows the alert and keeps the form', async () => {
    const fake = FakeAuthClient.signedOut()
    renderAt('/auth/forgot-password', fake)
    await h1('Reset your password')
    fake.nextError = 'rate_limited'
    await submit('a@x.io')

    expect(await screen.findByRole('alert')).toHaveTextContent('Too many attempts. Try again in a few minutes.')
    expect(screen.getByLabelText('Email')).toHaveValue('a@x.io')
    expect(screen.queryByRole('heading', { level: 1, name: 'Check your email' })).toBeNull()
  })

  it('TC-C-039: an outage shows the alert, not the sent state', async () => {
    const fake = FakeAuthClient.signedOut()
    renderAt('/auth/forgot-password', fake)
    await h1('Reset your password')
    fake.nextError = 'unavailable'
    await submit('a@x.io')
    expect(await screen.findByRole('alert')).toHaveTextContent("Can't reach the sign-in service. Try again.")
  })

  it('TC-C-039: prefills from router state, then resend runs on a 60 s cooldown', async () => {
    const { router, fake } = renderAt({ pathname: '/auth/forgot-password', state: { email: 'a@x.io' } })
    await h1('Reset your password')
    expect(screen.getByLabelText('Email')).toHaveValue('a@x.io')
    expect(path(router)).toBe('/auth/forgot-password')

    vi.useFakeTimers({ shouldAdvanceTime: true })
    await userEvent.click(screen.getByRole('button', { name: 'Send reset link' }))
    await h1('Check your email')
    const resend = screen.getByRole('button', { name: 'Resend in 60s' })
    expect(resend).toBeDisabled()

    await act(async () => void vi.advanceTimersByTime(60_000))
    const ready = screen.getByRole('button', { name: 'Resend email' })
    await userEvent.click(ready)
    await waitFor(() => expect(fake.args.reset).toEqual(['a@x.io', 'a@x.io']))
    expect(screen.getByRole('button', { name: 'Resend in 60s' })).toBeDisabled()
  })

  it('is a guest page: a signed-in visitor goes to /stocks', async () => {
    const { router } = renderAt('/auth/forgot-password', FakeAuthClient.signedIn())
    await waitFor(() => expect(router.state.location.pathname).toBe('/stocks'))
  })

  it('sign-in passes the typed email to forgot-password through router state', async () => {
    const { router } = renderAt('/auth/sign-in')
    await h1('Sign in to your account')
    await userEvent.type(screen.getByLabelText('Email'), 'a@x.io')
    await userEvent.click(screen.getByRole('link', { name: 'Forgot password?' }))

    await h1('Reset your password')
    expect(path(router)).toBe('/auth/forgot-password')
    expect(stateOf(router)).toEqual({ email: 'a@x.io' })
    expect(screen.getByLabelText('Email')).toHaveValue('a@x.io')
  })
})

describe('/auth/reset-password', () => {
  const recovery = () => new FakeAuthClient({ session: fakeSession('T1', 'a@x.io') })

  async function fill(password: string, confirm = password) {
    if (password) await userEvent.type(screen.getByLabelText('New password', { selector: 'input' }), password)
    if (confirm) await userEvent.type(screen.getByLabelText('Confirm new password', { selector: 'input' }), confirm)
    await userEvent.click(screen.getByRole('button', { name: 'Save password' }))
  }

  it('TC-U-034 / TC-C-041: without a session goes to link-expired (recovery)', async () => {
    const { router } = renderAt('/auth/reset-password')
    await waitFor(() => expect(router.state.location.pathname).toBe('/auth/link-expired'))
    expect(stateOf(router)).toEqual({ type: 'recovery' })
  })

  it('TC-C-040: shows the email, no back link, and checks the rules before calling', async () => {
    const fake = recovery()
    renderAt('/auth/reset-password', fake)
    await h1('Choose a new password')
    expect(screen.getByText('For a@x.io')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Back to sign in' })).toBeNull()
    expect(screen.getByLabelText('New password', { selector: 'input' })).toHaveAttribute('autocomplete', 'new-password')

    await fill('short1A')
    expect(await screen.findByText('Use at least 8 characters.')).toBeInTheDocument()
    expect(screen.getByLabelText('New password', { selector: 'input' })).toHaveFocus()
    expect(fake.args.setNewPassword).toEqual([])

    document.body.innerHTML = ''
    renderAt('/auth/reset-password', fake)
    await h1('Choose a new password')
    await fill('Abc12345', 'Abc12346')
    expect(await screen.findByText("Passwords don't match.")).toBeInTheDocument()
    expect(screen.getByLabelText('Confirm new password', { selector: 'input' })).toHaveAttribute('aria-invalid', 'true')
    expect(fake.args.setNewPassword).toEqual([])
  })

  it('TC-U-033: same_password shows on the field, then success goes to /stocks with a toast', async () => {
    const fake = recovery()
    const { router } = renderAt('/auth/reset-password', fake)
    await h1('Choose a new password')
    fake.nextError = 'same_password'

    await fill('Abc12345')
    expect(await screen.findByText("Choose a password you haven't used here.")).toBeInTheDocument()
    expect(path(router)).toBe('/auth/reset-password')

    await userEvent.click(screen.getByRole('button', { name: 'Save password' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/stocks'))
    expect(fake.args.setNewPassword).toEqual(['Abc12345', 'Abc12345'])
    expect(toast.success).toHaveBeenCalledWith("Password updated. You're signed in.")
    expect(router.state.historyAction).toBe('REPLACE')
  })

  it('TC-C-041: a lost recovery session on submit goes to link-expired', async () => {
    const fake = recovery()
    const { router } = renderAt('/auth/reset-password', fake)
    await h1('Choose a new password')
    fake.nextError = 'link_invalid'
    await fill('Abc12345')

    await waitFor(() => expect(router.state.location.pathname).toBe('/auth/link-expired'))
    expect(stateOf(router)).toEqual({ type: 'recovery' })
  })

  it('maps weak_password to the field and other failures to an alert', async () => {
    const fake = recovery()
    renderAt('/auth/reset-password', fake)
    await h1('Choose a new password')
    fake.nextError = 'weak_password'
    await fill('Abc12345')
    expect(await screen.findByText('Use 8 to 72 characters for your password.')).toBeInTheDocument()

    fake.nextError = 'unavailable'
    await userEvent.click(screen.getByRole('button', { name: 'Save password' }))
    expect(await screen.findByRole('alert')).toHaveTextContent("Can't reach the sign-in service. Try again.")
  })

  it('TC-C-042: recovery pages are not guest pages', async () => {
    const reset = renderAt('/auth/reset-password', recovery())
    await h1('Choose a new password')
    expect(reset.router.state.location.pathname).toBe('/auth/reset-password')
    document.body.innerHTML = ''

    const confirm = renderAt('/auth/confirm?token_hash=h2&type=recovery', (() => {
      const fake = recovery()
      fake.validLinks = { h2: 'recovery' }
      return fake
    })())
    await waitFor(() => expect(confirm.router.state.location.pathname).toBe('/auth/reset-password'))
    document.body.innerHTML = ''

    const expired = renderAt({ pathname: '/auth/link-expired', state: { type: 'recovery' } }, recovery())
    await h1("You're already signed in.")
    expect(expired.router.state.location.pathname).toBe('/auth/link-expired')
    expect(within(document.body).queryByLabelText('Email')).toBeNull()
  })
})
