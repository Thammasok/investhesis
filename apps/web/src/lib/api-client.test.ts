import { createMemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { sessionEndedHandler } from '@/features/auth/guards'
import { createMockAuthClient } from '@/features/auth/mock-auth-client'
import { FakeAuthClient, fakeSession } from '@/test/fake-auth-client'
import { ApiError, createApiClient } from './api-client'

const json = (status: number, body: unknown = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

function setup(responses: Response[], auth = FakeAuthClient.signedIn('T1'), path = '/lists') {
  const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => responses.shift() ?? json(500))
  const router = createMemoryRouter(
    [
      { path: '/auth/sign-in', element: null },
      { path: '/lists', element: null },
    ],
    { initialEntries: [path] },
  )
  const client = createApiClient({
    authClient: auth,
    fetch: fetchMock as unknown as typeof fetch,
    onSessionEnded: sessionEndedHandler(router),
    getCurrentPath: () => router.state.location.pathname + router.state.location.search,
  })
  return { client, fetchMock, router, auth }
}

const authHeader = (fetchMock: ReturnType<typeof setup>['fetchMock'], call: number) =>
  ((fetchMock.mock.calls[call][1] ?? {}).headers as Record<string, string>).authorization

describe('api-client', () => {
  it('sends the bearer token when a session exists', async () => {
    const { client, fetchMock } = setup([json(200, { id: 'u1' })])
    await expect(client.get('/me')).resolves.toEqual({ id: 'u1' })
    expect(fetchMock.mock.calls[0][0]).toBe('/api/me')
    expect(authHeader(fetchMock, 0)).toBe('Bearer T1')
  })

  it('sends no token in mock mode', async () => {
    const fetchMock = vi.fn(async () => json(200, {}))
    const client = createApiClient({
      authClient: createMockAuthClient(),
      fetch: fetchMock as unknown as typeof fetch,
      onSessionEnded: () => {},
    })
    await client.get('/me')
    const headers = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].headers as Record<string, string>
    expect(headers.authorization).toBeUndefined()
  })

  it('makes no request without a session', async () => {
    const { client, fetchMock } = setup([json(200)], FakeAuthClient.signedOut())
    await expect(client.get('/me')).rejects.toMatchObject({ status: 302 })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('TC-U-017: recovers from one expired token', async () => {
    const auth = new FakeAuthClient({ session: fakeSession('T1'), refreshResult: fakeSession('T2') })
    const { client, fetchMock } = setup([json(401), json(200, { ok: 1 })], auth)

    await expect(client.get('/me')).resolves.toEqual({ ok: 1 })

    expect(auth.calls.refresh).toBe(1)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(authHeader(fetchMock, 1)).toBe('Bearer T2')
  })

  it('TC-U-018: gives up after a second 401', async () => {
    const auth = new FakeAuthClient({ session: fakeSession('T1'), refreshResult: fakeSession('T2') })
    const { client, router } = setup([json(401), json(401)], auth, '/lists')

    await expect(client.get('/lists')).rejects.toMatchObject({ name: 'ApiError', status: 401 })

    expect(auth.calls.signOut).toBe(1)
    expect(auth.calls.refresh).toBe(1)
    expect(router.state.location.pathname + router.state.location.search).toBe('/auth/sign-in?next=%2Flists')
    expect(router.state.location.state).toEqual({ reason: 'session_ended' })
  })

  it('ends the session when the refresh itself fails', async () => {
    const auth = new FakeAuthClient({ session: fakeSession('T1'), refreshResult: null })
    const { client, fetchMock, router } = setup([json(401)], auth)

    await expect(client.get('/lists')).rejects.toBeInstanceOf(ApiError)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(auth.calls.signOut).toBe(1)
    expect(router.state.location.pathname).toBe('/auth/sign-in')
  })

  it('re-sends a FormData body on the retry', async () => {
    const auth = new FakeAuthClient({ session: fakeSession('T1'), refreshResult: fakeSession('T2') })
    const { client, fetchMock } = setup([json(401), json(200)], auth)
    const form = new FormData()
    form.append('file', new Blob(['a,b']), 'x.csv')

    await client.post('/import', { body: form })

    expect(fetchMock.mock.calls[0][1]?.body).toBe(form)
    expect(fetchMock.mock.calls[1][1]?.body).toBe(form)
  })

  it('throws ApiError with the problem body on other failures, without retrying', async () => {
    const { client, fetchMock, auth } = setup([json(404, { title: 'Not found' })])
    await expect(client.get('/stocks/x')).rejects.toMatchObject({ status: 404, body: { title: 'Not found' } })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(auth.calls.refresh).toBe(0)
  })
})
