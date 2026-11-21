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

async function signUp(email: string, password: string, confirm = password) {
  await userEvent.type(screen.getByLabelText('Email'), email)
  if (password) await userEvent.type(screen.getByLabelText('Password', { selector: 'input' }), password)
  if (confirm) await userEvent.type(screen.getByLabelText('Confirm password', { selector: 'input' }), confirm)
  await userEvent.click(screen.getByRole('button', { name: 'Create account' }))
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
      ['/auth/sign-up', '/stocks'],
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

  it('TC-C-016: next is carried to the sign-up and forgot links', async () => {
    renderAt('/auth/sign-in?next=%2Flists')
    await h1('Sign in to your account')
    expect(screen.getByRole('link', { name: 'Sign up' })).toHaveAttribute('href', '/auth/sign-up?next=%2Flists')
    expect(screen.getByRole('link', { name: 'Forgot password?' })).toHaveAttribute(
      'href',
      '/auth/forgot-password?next=%2Flists',
    )
  })

  it('TC-C-016: no next, no query on the links', async () => {
    renderAt('/auth/sign-in')
    await h1('Sign in to your account')
    expect(screen.getByRole('link', { name: 'Sign up' })).toHaveAttribute('href', '/auth/sign-up')
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
    expect(await h1('Sign in to your account')).toHaveFocus()
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

  it('TC-U-015: a signed-in visitor on a guest page lands on /stocks', async () => {
    for (const path of ['/auth/sign-in', '/auth/sign-up']) {
      const { router } = renderAt(path, FakeAuthClient.signedIn())
      await waitFor(() => expect(router.state.location.pathname).toBe('/stocks'))
      document.body.innerHTML = ''
    }
  })
})

describe('sign-up', () => {
  it.each([
    ['', '', 'Enter a password.', 'Password'],
    ['Abc1234', 'Abc1234', 'Use at least 8 characters.', 'Password'],
    ['a'.repeat(73), 'a'.repeat(73), 'Use 72 characters or fewer.', 'Password'],
    ['Abc12345', 'Abc12346', "Passwords don't match.", 'Confirm password'],
  ])('TC-C-022: (%#) blocks the call and focuses the first invalid field', async (password, confirm, message, field) => {
    const { fake } = renderAt('/auth/sign-up')
    await h1('Create your account')
    await signUp('new@x.io', password, confirm)

    expect(await screen.findByText(message)).toBeInTheDocument()
    expect(fake.calls.signUp).toBe(0)
    expect(screen.getByLabelText(field, { selector: 'input' })).toHaveFocus()
  })

  it('TC-C-024: the error is tied to its input', async () => {
    renderAt('/auth/sign-up')
    await h1('Create your account')
    await signUp('new@x.io', 'Abc12345', 'Abc12346')
    const input = screen.getByLabelText('Confirm password', { selector: 'input' })
    const error = await screen.findByText("Passwords don't match.")
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input.getAttribute('aria-describedby')).toContain(error.id)
    expect(input.closest('[data-slot="field"]')).toHaveAttribute('data-invalid', 'true')
  })

  it.each(['Abc12345', 'a'.repeat(72)])('TC-C-023: accepts a %#-th boundary password', async (password) => {
    const { fake } = renderAt('/auth/sign-up')
    await h1('Create your account')
    await signUp('new@x.io', password)
    await waitFor(() => expect(fake.args.signUp).toEqual([['new@x.io', password]]))
  })

  it('TC-U-025 / TC-C-032: new and taken emails reach the same check-email screen, email only in state', async () => {
    for (const email of ['taken@x.io', 'new@x.io']) {
      const { router } = renderAt('/auth/sign-up')
      await h1('Create your account')
      await signUp(email, 'Abc12345')
      const heading = await h1('Check your email')
      expect(heading).toHaveFocus()
      expect(where(router)).toBe('/auth/check-email')
      expect(screen.getByText(email, { exact: false })).toBeInTheDocument()
      expect(screen.getByRole('link', { name: 'Back to sign in' })).toBeInTheDocument()
      document.body.innerHTML = ''
    }
  })

  it('TC-U-025b / TC-C-027: a non-allowlisted email shows the invite-only alert and keeps the passwords', async () => {
    const { router, fake } = renderAt('/auth/sign-up')
    await h1('Create your account')
    fake.errorsByEmail['stranger@gmail.com'] = 'signup_not_allowed'

    await signUp('stranger@gmail.com', 'Abc12345')

    expect(await screen.findByRole('alert')).toHaveTextContent('Sign-up is invite-only. Ask the owner to add this email.')
    expect(where(router)).toBe('/auth/sign-up')
    expect(screen.getByLabelText('Email')).toHaveFocus()
    expect(screen.getByLabelText('Password', { selector: 'input' })).toHaveValue('Abc12345')
    expect(screen.getByLabelText('Confirm password', { selector: 'input' })).toHaveValue('Abc12345')
  })

  it('TC-C-025: weak_password from the server lands on the Password field', async () => {
    const { fake } = renderAt('/auth/sign-up')
    await h1('Create your account')
    fake.nextError = 'weak_password'
    await signUp('new@x.io', 'Abc12345')
    expect(await screen.findByText('Use 8 to 72 characters for your password.')).toBeInTheDocument()
    expect(screen.getByLabelText('Password', { selector: 'input' })).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByLabelText('Password', { selector: 'input' })).toHaveValue('Abc12345')
  })

  it.each([
    ['rate_limited', 'Too many attempts. Try again in a few minutes.'],
    ['unavailable', "Can't reach the sign-in service. Try again."],
  ] as const)('TC-C-026: %s shows an alert and keeps every value', async (code, text) => {
    const { router, fake } = renderAt('/auth/sign-up')
    await h1('Create your account')
    fake.nextError = code
    await signUp('new@x.io', 'Abc12345')
    expect(await screen.findByRole('alert')).toHaveTextContent(text)
    expect(screen.getByLabelText('Email')).toHaveValue('new@x.io')
    expect(screen.getByLabelText('Confirm password', { selector: 'input' })).toHaveValue('Abc12345')
    expect(where(router)).toBe('/auth/sign-up')
  })

  it('TC-C-028: the passwords are empty after going back', async () => {
    const { router } = renderAt('/auth/sign-up')
    await h1('Create your account')
    await signUp('new@x.io', 'Abc12345')
    await h1('Check your email')
    await act(() => router.navigate(-1))
    await h1('Create your account')
    expect(screen.getByLabelText('Password', { selector: 'input' })).toHaveValue('')
    expect(screen.getByLabelText('Confirm password', { selector: 'input' })).toHaveValue('')
  })

  it('TC-C-016: next survives to the sign-in link', async () => {
    renderAt('/auth/sign-up?next=%2Flists')
    await h1('Create your account')
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/auth/sign-in?next=%2Flists')
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

  it('TC-C-030: autocomplete tokens', async () => {
    renderAt('/auth/sign-in')
    await h1('Sign in to your account')
    expect(screen.getByLabelText('Email')).toHaveAttribute('autocomplete', 'email')
    expect(screen.getByLabelText('Password')).toHaveAttribute('autocomplete', 'current-password')
    document.body.innerHTML = ''
    renderAt('/auth/sign-up')
    await h1('Create your account')
    expect(screen.getByLabelText('Password', { selector: 'input' })).toHaveAttribute('autocomplete', 'new-password')
    expect(screen.getByLabelText('Confirm password', { selector: 'input' })).toHaveAttribute(
      'autocomplete',
      'new-password',
    )
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
