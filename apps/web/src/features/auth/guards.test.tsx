import { render, screen } from '@testing-library/react'
import { createMemoryRouter, type RouteObject } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { describe, expect, it, vi } from 'vitest'
import { createRoutes } from '@/routers/router'
import { FakeAuthClient } from '@/test/fake-auth-client'
import { emptyApi } from '@/test/stub-api'
import { watchAuth } from './guards'

function renderAt(path: string, authClient: FakeAuthClient, extend?: (routes: RouteObject[]) => void) {
  const routes = createRoutes(authClient, { apiClient: emptyApi().client() })
  extend?.(routes)
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  render(<RouterProvider router={router} />)
  return router
}

const settled = () => new Promise((resolve) => setTimeout(resolve, 30))

describe('requireSession', () => {
  it('TC-U-014: redirects a signed-out visitor and keeps the target', async () => {
    const router = renderAt('/stocks/abc?tab=lenses', FakeAuthClient.signedOut())

    expect(await screen.findByRole('heading', { level: 1, name: 'Sign in to your account' })).toBeInTheDocument()
    const { pathname, search } = router.state.location
    expect(pathname + search).toBe('/auth/sign-in?next=%2Fstocks%2Fabc%3Ftab%3Dlenses')
  })

  it('TC-U-014b: runs before child loaders and makes no API request', async () => {
    const childLoader = vi.fn(async () => {
      await fetch('/api/stocks')
      return null
    })
    const fetchSpy = vi.fn()
    const realFetch = globalThis.fetch
    globalThis.fetch = fetchSpy

    const router = renderAt('/stocks', FakeAuthClient.signedOut(), (routes) => {
      const app = routes.find((route) => route.id === 'app')
      const stocks = app?.children?.find((child) => child.path === 'stocks')
      if (!stocks) throw new Error('stocks route missing')
      stocks.loader = childLoader
    })
    await screen.findByRole('heading', { level: 1, name: 'Sign in to your account' })
    await settled()

    expect(childLoader).toHaveBeenCalledTimes(0)
    expect(fetchSpy).toHaveBeenCalledTimes(0)
    expect(router.state.location.pathname).toBe('/auth/sign-in')
    globalThis.fetch = realFetch
  })

  it('renders the page when a session exists', async () => {
    renderAt('/lists', FakeAuthClient.signedIn())
    expect(await screen.findByRole('heading', { level: 1, name: 'Lists' })).toBeInTheDocument()
  })
})

describe('redirectIfSignedIn', () => {
  it('TC-U-015: sends a signed-in user from the sign-in page to /stocks', async () => {
    const router = renderAt('/auth/sign-in', FakeAuthClient.signedIn())
    expect(await screen.findByRole('heading', { level: 1, name: 'Stocks' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/stocks')
  })
})

describe('watchAuth', () => {
  it('TC-U-020: a sign-out in another tab ends this tab\'s session', async () => {
    const auth = FakeAuthClient.signedIn()
    const router = renderAt('/stocks', auth)
    await screen.findByRole('heading', { level: 1, name: 'Stocks' })
    watchAuth(router, auth)

    auth.emit('SIGNED_OUT')

    expect(await screen.findByRole('heading', { level: 1, name: 'Sign in to your account' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/auth/sign-in')
    expect(router.state.location.search).toBe('?next=%2Fstocks')
    expect(router.state.location.state).toEqual({ reason: 'session_ended' })
  })

  it('ignores token refreshes and stops after unsubscribe', async () => {
    const auth = FakeAuthClient.signedIn()
    const router = renderAt('/stocks', auth)
    await screen.findByRole('heading', { level: 1, name: 'Stocks' })
    const stop = watchAuth(router, auth)

    auth.emit('TOKEN_REFRESHED')
    stop()
    auth.emit('SIGNED_OUT')
    await settled()

    expect(router.state.location.pathname).toBe('/stocks')
  })
})
