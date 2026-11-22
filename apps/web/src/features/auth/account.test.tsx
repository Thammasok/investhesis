import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createApiClient } from '@/lib/api-client'
import { createRoutes } from '@/routers/router'
import { FakeAuthClient } from '@/test/fake-auth-client'
import type { AuthClient } from './auth-client'

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
vi.mock('sonner', () => ({ toast, Toaster: () => null }))

/** A `GET /me` stub with an empty stock list; any other path is a 404 so a stray call is visible. */
function meFetch(email: string | null) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url.endsWith('/me') && email) {
      return new Response(JSON.stringify({ id: 'u-1', email, displayName: null }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }
    // The pages behind the menu load their own data; the user has none.
    if (url.endsWith('/stocks') || url.endsWith('/lists')) {
      return new Response(JSON.stringify({ items: [] }), { status: 200, headers: { 'content-type': 'application/json' } })
    }
    return new Response('{}', { status: 404 })
  })
}

function renderApp(
  entries: string[],
  { fake = FakeAuthClient.signedIn(), email = 'investor@x.io' as string | null, index = entries.length - 1 } = {},
) {
  const apiClient = createApiClient({ authClient: fake as AuthClient, onSessionEnded: () => {}, fetch: meFetch(email) })
  const router = createMemoryRouter(createRoutes(fake, { apiClient }), { initialEntries: entries, initialIndex: index })
  render(<RouterProvider router={router} />)
  return { router, fake }
}

const h1 = (name: string) => screen.findByRole('heading', { level: 1, name })
const trigger = () => screen.findByRole('button', { name: 'Account menu' })

async function openMenu() {
  await userEvent.click(await trigger())
  return screen.findByRole('menu')
}

const current = () => screen.getByLabelText('Current password', { selector: 'input' }) as HTMLInputElement
const next = () => screen.getByLabelText('New password', { selector: 'input' }) as HTMLInputElement
const confirm = () => screen.getByLabelText('Confirm new password', { selector: 'input' }) as HTMLInputElement

async function fillAndSubmit(cur: string, nw: string, conf = nw) {
  if (cur) await userEvent.type(current(), cur)
  if (nw) await userEvent.type(next(), nw)
  if (conf) await userEvent.type(confirm(), conf)
  await userEvent.click(screen.getByRole('button', { name: 'Change password' }))
}

beforeEach(() => {
  toast.success.mockClear()
  toast.error.mockClear()
})

describe('account menu', () => {
  it('TC-U-035: shows the signed-in email from GET /me with initials IN', async () => {
    renderApp(['/stocks'])
    await h1('Stocks')
    // The open menu hides the rest of the page from queries, so read the trigger first.
    const btn = await trigger()
    expect(within(btn).getAllByText('investor@x.io')).toHaveLength(1)
    expect(within(btn).getByText('IN')).toBeInTheDocument()
    const menu = within(await openMenu())
    expect(menu.getAllByText('investor@x.io')).toHaveLength(1)
    expect(screen.queryByText('investor@example.com')).not.toBeInTheDocument()
  })

  it.each([
    ['a@x.io', 'A'],
    ['ab@x.io', 'AB'],
    ['investor@x.io', 'IN'],
  ])('TC-C-047: %s has initials %s and no repeated second line', async (email, initials) => {
    renderApp(['/stocks'], { email })
    await h1('Stocks')
    expect(within(await trigger()).getByText(initials)).toBeInTheDocument()
    expect(within(await trigger()).getAllByText(email)).toHaveLength(1)
  })

  it('falls back to the session email when GET /me is unavailable', async () => {
    renderApp(['/stocks'], { email: null })
    await h1('Stocks')
    expect(within(await trigger()).getByText('investor@example.com')).toBeInTheDocument()
  })

  it('TC-C-048: opens by keyboard, items are menuitems, Sign out is not a link, Esc restores focus', async () => {
    renderApp(['/stocks'])
    await h1('Stocks')
    const btn = await trigger()
    btn.focus()
    await userEvent.keyboard('{Enter}')
    const menu = await screen.findByRole('menu')
    expect(within(menu).getByRole('menuitem', { name: 'Account' })).toHaveAttribute('href', '/account')
    expect(within(menu).getByRole('menuitem', { name: 'Sign out' })).not.toHaveAttribute('href')
    expect(within(menu).queryByRole('link', { name: 'Sign out' })).not.toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())
    expect(btn).toHaveFocus()
  })

  it('TC-U-038: Sign out ends the session, replaces with sign-in, and Back cannot re-enter', async () => {
    const { router, fake } = renderApp(['/stocks', '/lists'])
    await h1('Lists')

    await userEvent.click(within(await openMenu()).getByRole('menuitem', { name: 'Sign out' }))

    expect(await h1('Sign in to your account')).toBeInTheDocument()
    expect(fake.session).toBeNull()
    expect(fake.calls.signOut).toBe(1)
    expect(router.state.location.pathname).toBe('/auth/sign-in')
    expect(router.state.historyAction).toBe('REPLACE')

    await router.navigate(-1)
    await waitFor(() => expect(router.state.location.pathname).toBe('/auth/sign-in'))
    expect(router.state.location.search).toBe('?next=%2Fstocks')
  })
})

describe('account page', () => {
  it('TC-C-045: shows the account, a labelled card, breadcrumb, and stays out of the main nav', async () => {
    renderApp(['/account'])
    expect(await h1('Account')).toBeInTheDocument()
    expect(await screen.findByText('Signed in as investor@x.io')).toBeInTheDocument()
    const form = screen.getByRole('form', { name: 'Change password' })
    expect(form).toBeInTheDocument()
    expect(within(screen.getByRole('navigation', { name: 'breadcrumb' })).getByText('Account')).toBeInTheDocument()
    expect(
      within(screen.getByRole('navigation', { name: 'Main' })).queryByRole('link', { name: 'Account' }),
    ).not.toBeInTheDocument()
    await userEvent.click(await trigger())
    expect(screen.getByRole('menuitem', { name: 'Account' })).toHaveAttribute('href', '/account')
  })

  it('the menu Account item opens /account', async () => {
    const { router } = renderApp(['/stocks'])
    await h1('Stocks')
    await userEvent.click(within(await openMenu()).getByRole('menuitem', { name: 'Account' }))
    expect(await h1('Account')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/account')
  })

  it('TC-C-046: a signed-out visitor is sent to sign-in with next', async () => {
    const { router } = renderApp(['/account'], { fake: FakeAuthClient.signedOut() })
    await h1('Sign in to your account')
    expect(router.state.location.pathname + router.state.location.search).toBe('/auth/sign-in?next=%2Faccount')
  })
})

describe('change password', () => {
  it('TC-U-036: success toasts, clears every field and focuses Current password', async () => {
    const { fake } = renderApp(['/account'])
    await h1('Account')
    await fillAndSubmit('Abc12345', 'Xyz98765')

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Password changed.'))
    expect(fake.args.changePassword).toEqual([['Abc12345', 'Xyz98765']])
    expect(current()).toHaveValue('')
    expect(next()).toHaveValue('')
    expect(confirm()).toHaveValue('')
    expect(current()).toHaveFocus()
  })

  it('TC-U-037: wrong current password is shown on that field, cleared and focused; new fields kept', async () => {
    const { fake } = renderApp(['/account'])
    await h1('Account')
    fake.nextError = 'wrong_current_password'
    await fillAndSubmit('nope', 'Xyz98765')

    expect(await screen.findByText('Current password is incorrect.')).toBeInTheDocument()
    expect(current()).toHaveValue('')
    expect(current()).toHaveFocus()
    expect(current()).toHaveAttribute('aria-invalid', 'true')
    expect(next()).toHaveValue('Xyz98765')
    expect(confirm()).toHaveValue('Xyz98765')
    expect(toast.success).not.toHaveBeenCalled()
  })

  it('TC-C-043: client rules block the call (7, 73 characters, mismatch)', async () => {
    const { fake } = renderApp(['/account'])
    await h1('Account')
    const submit = () => userEvent.click(screen.getByRole('button', { name: 'Change password' }))

    await userEvent.type(current(), 'Abc12345')
    await userEvent.type(next(), 'Abc1234')
    await userEvent.type(confirm(), 'Abc1234')
    await submit()
    expect(await screen.findByText('Use at least 8 characters.', { selector: '[role="alert"], [data-slot="field-error"]' })).toBeInTheDocument()

    await userEvent.clear(next())
    await userEvent.clear(confirm())
    await userEvent.type(next(), 'A'.repeat(73))
    await userEvent.type(confirm(), 'A'.repeat(73))
    await submit()
    expect(await screen.findByText('Use 72 characters or fewer.')).toBeInTheDocument()

    await userEvent.clear(next())
    await userEvent.clear(confirm())
    await userEvent.type(next(), 'Abc12345')
    await userEvent.type(confirm(), 'Abc12346')
    await submit()
    expect(await screen.findByText("Passwords don't match.")).toBeInTheDocument()

    expect(fake.args.changePassword).toHaveLength(0)
  })

  it('requires the current password natively and does not call', async () => {
    const { fake } = renderApp(['/account'])
    await h1('Account')
    await fillAndSubmit('', 'Xyz98765')
    expect(fake.args.changePassword).toHaveLength(0)
    expect(current()).toBeRequired()
  })

  it.each([
    ['same_password' as const, "Choose a password you haven't used here."],
    ['weak_password' as const, 'Use 8 to 72 characters for your password.'],
  ])('TC-C-044: %s is shown on New password; Current is kept', async (code, message) => {
    const { fake } = renderApp(['/account'])
    await h1('Account')
    fake.nextError = code
    await fillAndSubmit('Abc12345', 'Xyz98765')

    expect(await screen.findByText(message)).toBeInTheDocument()
    expect(next()).toHaveAttribute('aria-invalid', 'true')
    expect(next()).toHaveFocus()
    expect(current()).toHaveValue('Abc12345')
  })

  it('shows other failures in a destructive alert at the top of the card', async () => {
    const { fake } = renderApp(['/account'])
    await h1('Account')
    fake.nextError = 'rate_limited'
    await fillAndSubmit('Abc12345', 'Xyz98765')
    expect(await screen.findByRole('alert')).toHaveTextContent('Too many attempts. Try again in a few minutes.')
    expect(current()).toHaveValue('Abc12345')
  })
})
