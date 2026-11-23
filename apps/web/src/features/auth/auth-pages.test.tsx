import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createRoutes } from '@/routers/router'
import { FakeAuthClient } from '@/test/fake-auth-client'

type Entry = string | { pathname: string; search?: string; state?: unknown }

function renderAt(entry: Entry, fake = FakeAuthClient.signedOut()) {
  const router = createMemoryRouter(createRoutes(fake), { initialEntries: [entry] })
  render(<RouterProvider router={router} />)
  return { router, fake }
}

const h1 = (name: string) => screen.findByRole('heading', { level: 1, name })
const where = (router: { state: { location: { pathname: string; search: string } } }) =>
  router.state.location.pathname + router.state.location.search

async function signIn(email = 'a@x.io', password = 'Abc12345') {
  await userEvent.type(screen.getByLabelText('Email'), email)
  await userEvent.type(screen.getByLabelText('Password'), password)
  await userEvent.keyboard('{Enter}')
}

afterEach(() => vi.useRealTimers())

describe('sign-in', () => {
  it('TC-U-022: signs in and returns to next, replacing history', async () => {
    const { router, fake } = renderAt('/auth/sign-in?next=%2Flists')
    await h1('Sign in to your account')

    await signIn()

    await waitFor(() => expect(router.state.location.pathname).toBe('/lists'))
    expect(fake.args.signIn).toEqual([['a@x.io', 'Abc12345']])
    expect(router.state.historyAction).toBe('REPLACE')
    expect(where(router)).not.toMatch(/Abc12345|a@x\.io/)
  })

  it('TC-C-015: hostile next values land on /stocks, the control on /lists', async () => {
    for (const [next, expected] of [
      ['//evil.example', '/stocks'],
      ['/\\evil.example', '/stocks'],
      ['https://evil.example/', '/stocks'],
      ['javascript:alert(1)', '/stocks'],
      ['%2F%2Fevil.example', '/stocks'],
      ['/auth/forgot-password', '/stocks'],
      ['/lists', '/lists'],
    ]) {
      const { router } = renderAt({ pathname: '/auth/sign-in', search: `?next=${encodeURIComponent(next)}` })
      await h1('Sign in to your account')
      await signIn()
      await waitFor(() => expect(router.state.location.pathname).toBe(expected))
      document.body.innerHTML = ''
    }
  })

  it('TC-U-023 / TC-C-013: wrong password shows the alert, clears and focuses the password', async () => {
    const { router, fake } = renderAt('/auth/sign-in')
    await h1('Sign in to your account')
    fake.nextError = 'invalid_credentials'

    await signIn('a@x.io', 'wrong')

    expect(await screen.findByRole('alert')).toHaveTextContent('Email or password is incorrect.')
    expect(screen.getByLabelText('Password')).toHaveValue('')
    expect(screen.getByLabelText('Password')).toHaveFocus()
    expect(screen.getByLabelText('Email')).toHaveValue('a@x.io')
    expect(where(router)).toBe('/auth/sign-in')
  })

  it('TC-C-014: sign-in does not apply the 8-character rule', async () => {
    const { fake } = renderAt('/auth/sign-in')
    await h1('Sign in to your account')
    await signIn('a@x.io', 'abc')
    await waitFor(() => expect(fake.args.signIn).toEqual([['a@x.io', 'abc']]))
  })

  it('TC-U-024 / TC-C-020: an unconfirmed account can resend and reaches check-email', async () => {
    const { router, fake } = renderAt('/auth/sign-in')
    await h1('Sign in to your account')
    fake.nextError = 'email_not_confirmed'
    await signIn()

    expect(await screen.findByRole('alert')).toHaveTextContent('Confirm your email first. We sent a link to a@x.io.')
    await userEvent.click(screen.getByRole('button', { name: 'Resend' }))

    expect(await h1('Check your email')).toBeInTheDocument()
    expect(fake.args.resend).toEqual(['a@x.io'])
    expect(where(router)).toBe('/auth/check-email')
  })

  it.each([
    ['rate_limited', 'Too many attempts. Try again in a few minutes.'],
    ['unavailable', "Can't reach the sign-in service. Try again."],
    ['unknown', 'Something went wrong. Try again.'],
  ] as const)('TC-C-019: %s shows a destructive alert and keeps the email', async (code, text) => {
    const { fake } = renderAt('/auth/sign-in')
    await h1('Sign in to your account')
    fake.nextError = code
    await signIn()
    expect(await screen.findByRole('alert')).toHaveTextContent(text)
    expect(screen.getByLabelText('Email')).toHaveValue('a@x.io')
  })

  it('TC-C-012: an unknown error logs no password', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { fake } = renderAt('/auth/sign-in')
    await h1('Sign in to your account')
    fake.nextError = 'unknown'
    await signIn('a@x.io', 'Abc12345')
    await screen.findByRole('alert')
    expect(JSON.stringify(spy.mock.calls)).not.toContain('Abc12345')
    spy.mockRestore()
  })

  it('TC-C-018: a double submit is ignored and the busy state is shown', async () => {
    const { fake } = renderAt('/auth/sign-in')
    await h1('Sign in to your account')
    let release = () => {}
    fake.signInGate = new Promise<void>((resolve) => (release = resolve))

    await userEvent.type(screen.getByLabelText('Email'), 'a@x.io')
    await userEvent.type(screen.getByLabelText('Password'), 'Abc12345{Enter}{Enter}')

    const button = await screen.findByRole('button', { name: 'Signing in…' })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByLabelText('Email')).not.toBeDisabled()
    release()
    await waitFor(() => expect(fake.calls.signIn).toBe(1))
  })

  it('TC-C-305: next is carried to the forgot link, and no link goes toward registration', async () => {
    renderAt('/auth/sign-in?next=%2Flists')
    await h1('Sign in to your account')
    expect(screen.getByRole('link', { name: 'Forgot password?' })).toHaveAttribute(
      'href',
      '/auth/forgot-password?next=%2Flists',
    )
    const hrefs = screen.getAllByRole('link').map((link) => link.getAttribute('href'))
    expect(hrefs.filter((href) => /sign-?up|register/i.test(href ?? ''))).toEqual([])
  })

  it('TC-C-305: no next, no query on the forgot link', async () => {
    renderAt('/auth/sign-in')
    await h1('Sign in to your account')
    expect(screen.getByRole('link', { name: 'Forgot password?' })).toHaveAttribute('href', '/auth/forgot-password')
  })

  it('TC-C-017: shows the session-ended notice only when sent with that state', async () => {
    renderAt({ pathname: '/auth/sign-in', state: { reason: 'session_ended' } })
    await h1('Sign in to your account')
    expect(screen.getByRole('status')).toHaveTextContent('Your session has ended. Sign in again.')
    document.body.innerHTML = ''
    renderAt('/auth/sign-in')
    await h1('Sign in to your account')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('TC-C-049: focuses the h1 and sets the title', async () => {
    renderAt('/auth/sign-in')
    const heading = await h1('Sign in to your account')
    // Focus and title are set in an effect right after the heading mounts.
    await waitFor(() => expect(heading).toHaveFocus())
    expect(document.title).toBe('Sign in · Investhesis')
  })

  it('TC-C-021: no credentials end up in the URL after any outcome', async () => {
    const { router, fake } = renderAt('/auth/sign-in')
    await h1('Sign in to your account')
    for (const error of ['invalid_credentials', 'email_not_confirmed'] as const) {
      fake.nextError = error
      await userEvent.clear(screen.getByLabelText('Email'))
      await signIn('a@x.io', 'Abc12345')
      await screen.findByRole('alert')
      expect(where(router)).toBe('/auth/sign-in')
    }
  })

  it('TC-C-310: a signed-in visitor on a guest page lands on /stocks', async () => {
    for (const path of ['/auth/sign-in', '/auth/forgot-password']) {
      const { router } = renderAt(path, FakeAuthClient.signedIn())
      await waitFor(() => expect(router.state.location.pathname).toBe('/stocks'))
      document.body.innerHTML = ''
    }
  })
})

describe('password input', () => {
  it('TC-C-029: toggles visibility without moving focus or submitting', async () => {
    const { fake } = renderAt('/auth/sign-in')
    await h1('Sign in to your account')
    const input = screen.getByLabelText('Password')
    const toggle = screen.getByRole('button', { name: 'Show password' })
    expect(toggle).toHaveAttribute('type', 'button')
    expect(input).toHaveAttribute('type', 'password')

    await userEvent.click(toggle)
    expect(input).toHaveAttribute('type', 'text')
    expect(screen.getByRole('button', { name: 'Hide password' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Hide password' })).toHaveFocus()

    await userEvent.keyboard(' ')
    expect(input).toHaveAttribute('type', 'password')
    expect(screen.getByRole('button', { name: 'Show password' })).toHaveAttribute('aria-pressed', 'false')
    expect(fake.calls.signIn).toBe(0)
  })

  it('TC-C-311: autocomplete tokens on sign-in', async () => {
    renderAt('/auth/sign-in')
    await h1('Sign in to your account')
    expect(screen.getByLabelText('Email')).toHaveAttribute('autocomplete', 'email')
    expect(screen.getByLabelText('Password')).toHaveAttribute('autocomplete', 'current-password')
  })
})

describe('check your email', () => {
  const at = (state: unknown) => ({ pathname: '/auth/check-email', state })

  it('TC-U-026: resend is disabled for 60 s with a countdown, then enabled', async () => {
    renderAt(at({ email: 'a@x.io' }))
    await h1('Check your email')
    vi.useFakeTimers({ shouldAdvanceTime: false })
    const button = screen.getByRole('button', { name: 'Resend email' })

    fireClick(button)
    await act(async () => {})
    expect(screen.getByRole('status')).toHaveTextContent('Sent again.')

    await act(async () => void vi.advanceTimersByTime(59000))
    expect(screen.getByRole('button', { name: 'Resend in 1s' })).toBeDisabled()

    await act(async () => void vi.advanceTimersByTime(1000))
    expect(screen.getByRole('button', { name: 'Resend email' })).toBeEnabled()
  })

  it('TC-C-031: a rate-limited resend shows the destructive alert instead of "Sent again."', async () => {
    const { fake } = renderAt(at({ email: 'a@x.io' }))
    await h1('Check your email')
    fake.nextError = 'rate_limited'
    await userEvent.click(screen.getByRole('button', { name: 'Resend email' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Too many attempts. Try again in a few minutes.')
    expect(screen.queryByText('Sent again.')).not.toBeInTheDocument()
  })

  it('a send that just happened starts the cooldown on arrival', async () => {
    renderAt(at({ email: 'a@x.io', justSent: true }))
    await h1('Check your email')
    expect(screen.getByRole('button', { name: /^Resend in \d+s$/ })).toBeDisabled()
  })

  it('TC-U-027 / TC-C-033: after a reload it asks for the email', async () => {
    const { fake } = renderAt(at(null))
    await h1('Check your email')
    const field = screen.getByLabelText('Email')
    await userEvent.click(screen.getByRole('button', { name: 'Resend email' }))
    expect(fake.calls.resend).toBe(0)
    expect(field).toBeInvalid()

    await userEvent.type(field, 'a@x.io{Enter}')
    await waitFor(() => expect(fake.args.resend).toEqual(['a@x.io']))
  })
})

function fireClick(element: HTMLElement) {
  // userEvent waits on timers, which are faked here; a plain click is enough for this test.
  act(() => element.click())
}
