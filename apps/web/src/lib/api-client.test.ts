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

  it('TC-C-102: a multipart post goes to /api/imports with the bearer token, no manual content-type, and the retry re-sends the same file under the new token', async () => {
    // Arrange
    const auth = new FakeAuthClient({ session: fakeSession('T1'), refreshResult: fakeSession('T2') })
    const { client, fetchMock } = setup([json(401), json(200, { created: 1 })], auth, '/import-export')
    const form = new FormData()
    form.append('duplicateMode', 'skip')
    form.append('file', new File(['ticker,market\nNVDA,US'], 'stocks.csv', { type: 'text/csv' }))

    // Act
    await client.post('/imports', { body: form })

    // Assert
    const calls = fetchMock.mock.calls as unknown as [string, RequestInit][]
    expect(calls.map((c) => c[0])).toEqual(['/api/imports', '/api/imports'])
    for (const [, init] of calls) expect((init.headers as Record<string, string>)['content-type']).toBeUndefined()
    expect(authHeader(fetchMock, 0)).toBe('Bearer T1')
    expect(authHeader(fetchMock, 1)).toBe('Bearer T2')
    const [first, second] = calls.map(([, init]) => (init.body as FormData).get('file') as File)
    expect(await second.text()).toBe(await first.text())
    expect(second.name).toBe('stocks.csv')
  })

  it('TC-C-102: a second 401 runs the sign-out path, a 409 becomes an ApiError with its code and is not retried', async () => {
    // Arrange
    const twice = setup([json(401), json(401)], new FakeAuthClient({ session: fakeSession('T1'), refreshResult: fakeSession('T2') }), '/import-export')
    const conflict = setup([json(409, { code: 'list_name_taken', title: 'x' })])
    const form = () => {
      const f = new FormData()
      f.append('file', new File(['a'], 'a.csv'))
      return f
    }

    // Act
    await twice.client.post('/imports', { body: form() }).catch(() => undefined)
    const rejected = conflict.client.post('/imports', { body: form() })

    // Assert
    expect(twice.auth.calls.signOut).toBe(1)
    expect(twice.router.state.location.pathname).toBe('/auth/sign-in')
    await expect(rejected).rejects.toMatchObject({ name: 'ApiError', status: 409, code: 'list_name_taken' })
    expect(conflict.fetchMock).toHaveBeenCalledTimes(1)
    expect(conflict.auth.calls.refresh).toBe(0)
  })

  it.each([403, 404, 500])('TC-C-010: a %i does not refresh or sign out and rejects with ApiError', async (status) => {
    const { client, fetchMock, auth } = setup([json(status, { title: 'x' })])
    await expect(client.get('/stocks/x')).rejects.toMatchObject({ name: 'ApiError', status, body: { title: 'x' } })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(auth.calls.refresh).toBe(0)
    expect(auth.calls.signOut).toBe(0)
  })
})

const problem = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/problem+json' } })

describe('api-client requests and errors', () => {
  it('TC-U-070: a problem response becomes an ApiError with code, detail, errors and existingStockId', async () => {
    const { client } = setup([
      problem(409, {
        code: 'stock_exists',
        detail: 'Already saved',
        existingStockId: 'A',
        errors: [{ path: 'ticker', message: 'taken' }],
      }),
    ])
    const thrown = await client.post('/stocks', { body: { ticker: 'AAPL' } }).catch((e: unknown) => e)
    expect(thrown).toBeInstanceOf(ApiError)
    expect(thrown).toMatchObject({
      status: 409,
      code: 'stock_exists',
      detail: 'Already saved',
      existingStockId: 'A',
      errors: [{ path: 'ticker', message: 'taken' }],
    })
  })

  it('TC-U-070: a non-problem error body still gives an ApiError with a code', async () => {
    const { client } = setup([new Response('boom', { status: 502 })])
    await expect(client.get('/stocks')).rejects.toMatchObject({ status: 502, code: 'http_502', errors: [] })
  })

  it('TC-U-071: requests are prefixed with /api and send JSON', async () => {
    const { client, fetchMock } = setup([json(200, {})])
    await client.patch('/stocks/1', { body: { moat: null } })
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/stocks/1')
    expect(init.method).toBe('PATCH')
    expect((init.headers as Record<string, string>)['content-type']).toBe('application/json')
    expect(init.body).toBe('{"moat":null}')
  })

  it('TC-U-072: a 204 resolves to undefined without parsing a body', async () => {
    const { client } = setup([new Response(null, { status: 204 })])
    await expect(client.delete('/lists/1')).resolves.toBeUndefined()
  })

  it('TC-U-073: a network failure becomes ApiError status 0 network_error', async () => {
    const fetchMock = vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    })
    const client = createApiClient({
      authClient: createMockAuthClient(),
      fetch: fetchMock as unknown as typeof fetch,
      onSessionEnded: () => {},
    })
    await expect(client.get('/stocks')).rejects.toMatchObject({ name: 'ApiError', status: 0, code: 'network_error' })
  })

  it('TC-U-071: a FormData body is sent as is, with no content-type so the browser adds the boundary', async () => {
    const { client, fetchMock } = setup([json(200, {})])
    const form = new FormData()
    form.append('file', new File(['a'], 'a.csv'))
    await client.post('/imports/preview', { body: form })
    const init = fetchMock.mock.calls[0][1] as RequestInit
    expect(init.body).toBe(form)
    expect((init.headers as Record<string, string>)['content-type']).toBeUndefined()
  })

  it('TC-U-070: download sends the bearer token and returns the blob with its file name', async () => {
    const res = new Response('a,b', {
      status: 200,
      headers: { 'content-type': 'text/csv', 'content-disposition': 'attachment; filename="stocks-template.csv"' },
    })
    const { client, fetchMock } = setup([res])
    const file = await client.download('/imports/template.csv')
    expect(fetchMock.mock.calls[0][0]).toBe('/api/imports/template.csv')
    expect(authHeader(fetchMock, 0)).toBe('Bearer T1')
    expect(file.filename).toBe('stocks-template.csv')
    expect(await file.blob.text()).toBe('a,b')
  })

  it('TC-U-070: download falls back to the path name and refreshes once on a 401', async () => {
    const auth = new FakeAuthClient({ session: fakeSession('T1'), refreshResult: fakeSession('T2') })
    const { client, fetchMock } = setup([json(401), new Response('x', { status: 200 })], auth)
    const file = await client.download('/imports/template.xlsx')
    expect(file.filename).toBe('template.xlsx')
    expect(authHeader(fetchMock, 1)).toBe('Bearer T2')
  })

  it('TC-U-070: download failure is an ApiError', async () => {
    const { client } = setup([problem(500, { code: 'internal' })])
    await expect(client.download('/imports/template.csv')).rejects.toMatchObject({ status: 500, code: 'internal' })
  })
})
