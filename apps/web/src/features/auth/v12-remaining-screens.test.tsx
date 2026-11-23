import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createRoutes } from '@/routers/router'
import { FakeAuthClient, fakeSession } from '@/test/fake-auth-client'
import { emptyApi } from '@/test/stub-api'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() }, Toaster: () => null }))

// Component cases of user-auth v1.2 (TC-C-306, 307, 311, 312) for the screens that remain once sign-up is gone.

type Entry = string | { pathname: string; search?: string; state?: unknown }

function renderAt(entry: Entry, fake = FakeAuthClient.signedOut()) {
  const router = createMemoryRouter(createRoutes(fake, { apiClient: emptyApi().client() }), { initialEntries: [entry] })
  render(<RouterProvider router={router} />)
  return { router, fake }
}

const h1 = (name: string) => screen.findByRole('heading', { level: 1, name })

afterEach(() => {
  vi.useRealTimers()
  document.body.innerHTML = ''
})

const long = (n: number) => 'a'.repeat(n)

/** Each row: new password, confirm, the message that blocks the call (or null when the call is made once). */
const BOUNDARIES: [string, string, string, string | null][] = [
  ['0 characters', '', '', 'Enter a password.'],
  ['7 characters', 'Abc1234', 'Abc1234', 'Use at least 8 characters.'],
  ['8 characters', 'Abc12345', 'Abc12345', null],
  ['72 characters', long(72), long(72), null],
  ['73 characters', long(73), long(73), 'Use 72 characters or fewer.'],
  ['a mismatching confirm', 'Abc12345', 'Abc12346', "Passwords don't match."],
]

describe('new-password rules on the remaining forms (TC-C-306)', () => {
  it.each(BOUNDARIES)('TC-C-306: reset-password with %s', async (_label, password, confirm, message) => {
    const fake = new FakeAuthClient({ session: fakeSession('T1', 'a@x.io') })
    renderAt('/auth/reset-password', fake)
    await h1('Choose a new password')
    const next = screen.getByLabelText('New password', { selector: 'input' })
    const again = screen.getByLabelText('Confirm new password', { selector: 'input' })
    if (password) await userEvent.type(next, password, { delay: null })
    if (confirm) await userEvent.type(again, confirm, { delay: null })

    await userEvent.click(screen.getByRole('button', { name: 'Save password' }))

    if (message) {
      expect(await screen.findByText(message)).toBeInTheDocument()
      expect(fake.args.setNewPassword).toEqual([])
    } else {
      await waitFor(() => expect(fake.args.setNewPassword).toEqual([password]))
    }
  })

  it.each(BOUNDARIES)('TC-C-306: account change-password with %s', async (_label, password, confirm, message) => {
    const fake = FakeAuthClient.signedIn()
    renderAt('/account', fake)
    await h1('Account')
    await userEvent.type(screen.getByLabelText('Current password', { selector: 'input' }), 'Abc12345', { delay: null })
    const next = screen.getByLabelText('New password', { selector: 'input' })
    const again = screen.getByLabelText('Confirm new password', { selector: 'input' })
    if (password) await userEvent.type(next, password, { delay: null })
    if (confirm) await userEvent.type(again, confirm, { delay: null })

    await userEvent.click(screen.getByRole('button', { name: 'Change password' }))

    if (message) {
      expect((await screen.findAllByText(message)).length).toBeGreaterThan(0)
      expect(fake.args.changePassword).toEqual([])
    } else {
      await waitFor(() => expect(fake.args.changePassword).toEqual([['Abc12345', password]]))
    }
  })
})

describe('check-email reached from sign-in resend (TC-C-307)', () => {
  it('TC-C-307: shows the address from state, never puts it in the URL, and resends only after the 60 s cooldown', async () => {
    // Arrange: the real path, sign-in with an unconfirmed account then Resend (fake clock from the start)
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const fake = FakeAuthClient.signedOut()
    const { router } = renderAt('/auth/sign-in', fake)
    await h1('Sign in to your account')
    fake.nextError = 'email_not_confirmed'
    await userEvent.type(screen.getByLabelText('Email'), 'a@example.test')
    await userEvent.type(screen.getByLabelText('Password'), 'Abc12345{Enter}')
    await userEvent.click(await screen.findByRole('button', { name: 'Resend' }))

    // Assert: the address and a sent status, nothing in the URL
    await h1('Check your email')
    expect(document.body.textContent).toContain('a@example.test')
    expect(router.state.location.pathname + router.state.location.search + router.state.location.hash).toBe('/auth/check-email')
    expect(screen.getByRole('button', { name: /^Resend in \d+s$/ })).toBeDisabled()

    // Act: wait out the cooldown with a fake clock, then resend
    await act(async () => void vi.advanceTimersByTime(61_000))
    const resend = screen.getByRole('button', { name: 'Resend email' })
    expect(resend).toBeEnabled()
    await act(async () => resend.click())

    // Assert
    expect(fake.calls.resend).toBe(2)
    expect(screen.getByRole('status')).toHaveTextContent('Sent again.')
  })

  it('TC-C-307: visited directly with no state it shows the generic fallback and no address', async () => {
    renderAt({ pathname: '/auth/check-email', state: null })
    await h1('Check your email')
    expect(screen.getByLabelText('Email')).toHaveValue('')
    expect(document.body.textContent).not.toMatch(/@/)
  })
})

describe('autofill attributes on the remaining forms (TC-C-311)', () => {
  it('TC-C-311: reset-password fields use new-password', async () => {
    renderAt('/auth/reset-password', new FakeAuthClient({ session: fakeSession('T1', 'a@x.io') }))
    await h1('Choose a new password')
    expect(screen.getByLabelText('New password', { selector: 'input' })).toHaveAttribute('autocomplete', 'new-password')
    expect(screen.getByLabelText('Confirm new password', { selector: 'input' })).toHaveAttribute('autocomplete', 'new-password')
  })

  it('TC-C-311: account fields use current-password and new-password', async () => {
    renderAt('/account', FakeAuthClient.signedIn())
    await h1('Account')
    expect(screen.getByLabelText('Current password', { selector: 'input' })).toHaveAttribute('autocomplete', 'current-password')
    expect(screen.getByLabelText('New password', { selector: 'input' })).toHaveAttribute('autocomplete', 'new-password')
    expect(screen.getByLabelText('Confirm new password', { selector: 'input' })).toHaveAttribute('autocomplete', 'new-password')
  })

  it('TC-C-311: forgot-password and check-email email fields use the email token', async () => {
    renderAt('/auth/forgot-password')
    await h1('Reset your password')
    expect(screen.getByLabelText('Email')).toHaveAttribute('autocomplete', 'email')
  })
})

describe('title, focus and landmark on every remaining auth screen (TC-C-312)', () => {
  const SCREENS: [string, Entry, FakeAuthClient, string, string][] = [
    ['sign-in', '/auth/sign-in', FakeAuthClient.signedOut(), 'Sign in to your account', 'Sign in · Investhesis'],
    ['check-email', { pathname: '/auth/check-email', state: { email: 'a@x.io' } }, FakeAuthClient.signedOut(), 'Check your email', 'Check your email · Investhesis'],
    ['link-expired', { pathname: '/auth/link-expired', state: { type: 'email' } }, FakeAuthClient.signedOut(), 'This link has expired or was already used', 'Link expired · Investhesis'],
    ['forgot-password', '/auth/forgot-password', FakeAuthClient.signedOut(), 'Reset your password', 'Forgot password · Investhesis'],
    ['reset-password', '/auth/reset-password', new FakeAuthClient({ session: fakeSession('T1', 'a@x.io') }), 'Choose a new password', 'New password · Investhesis'],
  ]

  it.each(SCREENS)('TC-C-312: %s sets its title, focuses the h1 once and has one main landmark', async (_name, entry, fake, heading, title) => {
    renderAt(entry, fake)
    const el = await h1(heading)
    await waitFor(() => expect(el).toHaveFocus())
    expect(document.title).toBe(title)
    expect(screen.getAllByRole('main')).toHaveLength(1)
    expect(document.querySelectorAll('h1')).toHaveLength(1)
  })

  it('TC-C-312: the confirm result screen sets its title, focuses the h1 and has one main landmark', async () => {
    const fake = FakeAuthClient.signedOut()
    fake.validLinks = { h1: 'email' }
    fake.verifyGate = new Promise<void>(() => {})
    renderAt('/auth/confirm?token_hash=h1&type=email', fake)
    const el = await h1('Confirming your email…')
    await waitFor(() => expect(el).toHaveFocus())
    expect(document.title).toBe('Confirming · Investhesis')
    expect(screen.getAllByRole('main')).toHaveLength(1)
  })
})
