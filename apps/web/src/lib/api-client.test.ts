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
  it('TC-C-008: attaches the bearer header when a session exists', async () => {
    const { client, fetchMock } = setup([json(200, { id: 'u1' })])
    await expect(client.get('/me')).resolves.toEqual({ id: 'u1' })
    expect(fetchMock.mock.calls[0][0]).toBe('/api/me')
    expect(authHeader(fetchMock, 0)).toBe('Bearer T1')
  })

  it('TC-C-008: sends no Authorization header in mock mode', async () => {
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

  it('TC-C-007: makes no request without a session and redirects like the guard', async () => {
    const { client, fetchMock } = setup([json(200)], FakeAuthClient.signedOut(), '/lists')
    const thrown = await client.get('/lists').catch((e: unknown) => e)
    expect(thrown).toBeInstanceOf(Response)
    expect((thrown as Response).status).toBe(302)
    expect((thrown as Response).headers.get('location')).toBe('/auth/sign-in?next=%2Flists')
    expect(fetchMock).toHaveBeenCalledTimes(0)
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

  it('TC-C-011: ends the session when the refresh itself fails, without a retry', async () => {
    const auth = new FakeAuthClient({ session: fakeSession('T1'), refreshResult: null })
    const { client, fetchMock, router } = setup([json(401)], auth, '/lists')

    await expect(client.get('/lists')).rejects.toBeInstanceOf(ApiError)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(auth.calls.signOut).toBe(1)
    expect(router.state.location.pathname + router.state.location.search).toBe('/auth/sign-in?next=%2Flists')
    expect(router.state.location.state).toEqual({ reason: 'session_ended' })
  })

  it('TC-C-009: re-sends an equal FormData file on the retry and returns 201', async () => {
    const auth = new FakeAuthClient({ session: fakeSession('T1'), refreshResult: fakeSession('T2') })
    const { client, fetchMock } = setup([json(401), json(201, { imported: 1 })], auth)
    const form = new FormData()
    form.append('file', new Blob(['a,b']), 'x.csv')

    const result = await client.post('/import', { body: form })

    expect(result).toEqual({ imported: 1 })
    expect(auth.calls.refresh).toBe(1)
    const sent = fetchMock.mock.calls.map((c) => ((c[1] as RequestInit).body as FormData).get('file') as File)
    expect(sent).toHaveLength(2)
    expect(await sent[1].text()).toBe(await sent[0].text())
    expect(sent[1].name).toBe(sent[0].name)
    expect(authHeader(fetchMock, 1)).toBe('Bearer T2')
  })

  it.each([403, 404, 500])('TC-C-010: a %i does not refresh or sign out and rejects with ApiError', async (status) => {
    const { client, fetchMock, auth } = setup([json(status, { title: 'x' })])
    await expect(client.get('/stocks/x')).rejects.toMatchObject({ name: 'ApiError', status, body: { title: 'x' } })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(auth.calls.refresh).toBe(0)
    expect(auth.calls.signOut).toBe(0)
  })
})
