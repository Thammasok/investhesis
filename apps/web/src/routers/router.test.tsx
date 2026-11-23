import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { describe, expect, it } from 'vitest'
import type { AuthClient } from '@/features/auth/auth-client'
import { FakeAuthClient } from '@/test/fake-auth-client'
import { makeList, makeStock } from '@/test/stock-fixtures'
import { emptyApi } from '@/test/stub-api'
import { createRoutes } from './router'

// Stocks the detail and edit pages can load.
function pagesApi() {
  return emptyApi()
    .on('GET /stocks/AAPL', makeStock({ id: 'AAPL', ticker: 'AAPL' }))
    .on('GET /stocks/PTT', makeStock({ id: 'PTT', ticker: 'PTT' }))
    .on('GET /lists/L1', makeList('L1', 'Core holdings'))
}

// Signed in by default; guest pages (the sign-in tests below) use a signed-out fake.
function renderAt(path: string, authClient: AuthClient = FakeAuthClient.signedIn()) {
  const router = createMemoryRouter(createRoutes(authClient, { apiClient: pagesApi().client() }), { initialEntries: [path] })
  render(<RouterProvider router={router} />)
  return router
}

const heading = (name: string | RegExp) => screen.findByRole('heading', { level: 1, name })
// `hidden`: behind a route-backed dialog (/stocks/new, /import-export/import) the page is aria-hidden.
const breadcrumb = () => screen.getByRole('navigation', { name: 'breadcrumb', hidden: true })
const mainNav = () => within(screen.getByRole('navigation', { name: 'Main', hidden: true }))

describe('router', () => {
  it('redirects / to /stocks', async () => {
    const router = renderAt('/')
    expect(await heading('Stocks')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/stocks')
  })

  it.each([
    ['/stocks/new', 'Add stock'],
    ['/import-export/import', 'Import stocks'],
  ])('renders %s as a dialog over its page', async (path, name) => {
    renderAt(path)
    expect(await screen.findByRole('dialog', { name })).toBeInTheDocument()
  })

  it.each([
    ['/concentration', 'Concentration'],
    ['/chains', 'Value chains'],
    ['/lists', 'Lists'],
    ['/import-export', 'Import / export'],
    ['/stocks/AAPL', /^AAPL/],
    ['/stocks/AAPL/edit', 'Edit AAPL'],
    ['/lists/L1', 'Core holdings'],
  ])('renders %s', async (path, name) => {
    renderAt(path)
    expect(await heading(name)).toBeInTheDocument()
  })

  it('shows not found for an unknown path', async () => {
    renderAt('/nope')
    expect(await heading('Page not found')).toBeInTheDocument()
  })
})

describe('app layout', () => {
  it('marks the current page in the sidebar and moves between pages', async () => {
    renderAt('/stocks')
    await heading('Stocks')
    expect(mainNav().getByRole('link', { name: 'Stocks', current: 'page' })).toBeInTheDocument()

    await userEvent.click(mainNav().getByRole('link', { name: 'Concentration' }))

    expect(await heading('Concentration')).toBeInTheDocument()
    expect(mainNav().getByRole('link', { name: 'Concentration', current: 'page' })).toBeInTheDocument()
    expect(mainNav().queryByRole('link', { name: 'Stocks', current: 'page' })).not.toBeInTheDocument()
  })

  it('keeps Stocks active on a stock page and shows the trail in the breadcrumb', async () => {
    renderAt('/stocks/PTT')
    await heading(/^PTT/)

    expect(mainNav().getByRole('link', { name: 'Stocks' })).toHaveAttribute('data-active', 'true')

    const trail = within(breadcrumb())
    expect(trail.getByRole('link', { name: 'Stocks' })).toHaveAttribute('href', '/stocks')
    expect(trail.getByText('PTT')).toHaveAttribute('aria-current', 'page')
  })

  it.each([
    ['/stocks/new', ['Stocks', 'New stock']],
    ['/stocks/PTT/edit', ['Stocks', 'PTT', 'Edit']],
    ['/lists/L1', ['Lists', 'Core holdings']],
  ])('shows the trail for %s in the breadcrumb', async (path, labels) => {
    renderAt(path)
    await screen.findByRole('heading', { level: 1, hidden: true })
    const trail = within(breadcrumb())
    for (const label of labels) expect(trail.getByText(label)).toBeInTheDocument()
    expect(trail.getByText(labels.at(-1) as string)).toHaveAttribute('aria-current', 'page')
    expect(mainNav().getByRole('link', { name: path.startsWith('/lists') ? 'Lists' : 'Stocks', hidden: true })).toHaveAttribute(
      'data-active',
      'true',
    )
  })

  it.each([
    ['/stocks/new', 'Stocks'],
    ['/stocks/PTT/edit', 'Stocks'],
    ['/lists/L1', 'Lists'],
    ['/import-export', 'Import / export'],
  ])('TC-C-103: %s marks only %s as active in the main navigation', async (path, active) => {
    renderAt(path)
    await screen.findByRole('heading', { level: 1, hidden: true })

    const links = mainNav().getAllByRole('link', { hidden: true })

    const current = links.filter((l) => l.getAttribute('data-active') === 'true').map((l) => l.textContent)
    expect(current).toEqual([active])
  })

  it('collapses and expands the sidebar from the header trigger', async () => {
    renderAt('/stocks')
    await heading('Stocks')
    const sidebar = document.querySelector('[data-slot="sidebar"][data-state]')
    expect(sidebar).toHaveAttribute('data-state', 'expanded')

    await userEvent.click(screen.getByRole('button', { name: 'Toggle Sidebar' }))

    expect(sidebar).toHaveAttribute('data-state', 'collapsed')
  })

  it('signs out from the account menu to the sign-in page', async () => {
    const fake = FakeAuthClient.signedIn()
    const router = renderAt('/stocks', fake)
    await heading('Stocks')

    await userEvent.click(screen.getByRole('button', { name: 'Account menu' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Sign out' }))

    expect(await heading('Sign in to your account')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/auth/sign-in')
    expect(fake.session).toBeNull()
  })
})

describe('auth layout', () => {
  it('redirects /auth to the sign-in page, outside the app shell', async () => {
    const router = renderAt('/auth', FakeAuthClient.signedOut())
    expect(await heading('Sign in to your account')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/auth/sign-in')
    expect(screen.queryByRole('navigation', { name: 'Main' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Investhesis' })).toHaveAttribute('href', '/auth/sign-in')
  })

  it('enters the app after signing in, replacing the sign-in entry', async () => {
    const router = renderAt('/auth/sign-in', FakeAuthClient.signedOut())
    await heading('Sign in to your account')

    await userEvent.type(screen.getByLabelText('Email'), 'investor@example.com')
    await userEvent.type(screen.getByLabelText('Password'), 'secret-password')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await heading('Stocks')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/stocks')
    expect(router.state.location.search).toBe('')
    expect(router.state.historyAction).toBe('REPLACE')
  })

  it('does not sign in while a required field is empty', async () => {
    const router = renderAt('/auth/sign-in', FakeAuthClient.signedOut())
    await heading('Sign in to your account')

    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    // Give a (wrong) navigation time to settle before checking that none happened.
    await new Promise((resolve) => setTimeout(resolve, 50))

    expect(screen.getByLabelText('Email')).toBeInvalid()
    expect(router.state.location.pathname).toBe('/auth/sign-in')
    expect(router.state.navigation.state).toBe('idle')
  })
})
