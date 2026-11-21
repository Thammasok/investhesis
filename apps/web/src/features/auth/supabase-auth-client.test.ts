import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { AuthClient, AuthEvent } from './auth-client'
import { createSupabaseAuthClient } from './supabase-auth-client'

const URL_ = 'http://127.0.0.1:54398'
const USER = { id: '6f1c2b9e-0d4a-4c8e-9a51-2f6c0b7d3e11', email: 'a@example.test', aud: 'authenticated' }

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    // Auth only puts a machine `code` in the body when the client announces this API version.
    headers: { 'content-type': 'application/json', 'x-supabase-api-version': '2024-01-01' },
  })

const sessionBody = (token = 'ACCESS-1', refresh = 'REFRESH-1', expiresIn = 3600) => ({
  access_token: token,
  token_type: 'bearer',
  expires_in: expiresIn,
  expires_at: Math.floor(Date.now() / 1000) + expiresIn,
  refresh_token: refresh,
  user: USER,
})

type Handler = (url: URL, init: RequestInit | undefined) => Response | Promise<Response>
let handler: Handler
const calls: { path: string; body: unknown }[] = []
const realFetch = globalThis.fetch

beforeEach(() => {
  calls.length = 0
  handler = () => json(404, {})
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input))
    calls.push({ path: url.pathname + url.search, body: init?.body ? JSON.parse(String(init.body)) : undefined })
    return handler(url, init)
  }) as typeof fetch
  localStorage.clear()
})
afterEach(() => {
  globalThis.fetch = realFetch
  localStorage.clear()
})

const make = (): AuthClient => createSupabaseAuthClient({ url: URL_, publishableKey: 'pk', origin: 'http://localhost:5173' })

describe('supabase auth adapter', () => {
  it('signIn maps the provider error and signs in on success', async () => {
    handler = () => json(400, { code: 'invalid_credentials', message: 'Invalid login credentials' })
    const client = make()
    expect(await client.signIn('a@example.test', 'bad')).toEqual({ ok: false, error: 'invalid_credentials' })

    handler = () => json(200, sessionBody())
    expect(await client.signIn('a@example.test', 'Abc12345')).toEqual({ ok: true })
    expect(await client.getAccessToken()).toBe('ACCESS-1')
  })

  it('signUp sends the confirm redirect, and an already-registered email is a success', async () => {
    handler = () => json(200, { id: USER.id, email: USER.email })
    const client = make()
    expect(await client.signUp('a@example.test', 'Abc12345')).toEqual({ ok: true })
    expect(calls[0]?.path).toContain('redirect_to=http%3A%2F%2Flocalhost%3A5173%2Fauth%2Fconfirm')

    handler = () => json(422, { code: 'user_already_exists', message: 'User already registered' })
    expect(await client.signUp('a@example.test', 'Abc12345')).toEqual({ ok: true })

    handler = () => json(403, { code: 'unexpected_failure', message: 'Hook requested to reject: signup_not_allowed' })
    expect(await client.signUp('x@gmail.com', 'Abc12345')).toEqual({ ok: false, error: 'signup_not_allowed' })
  })

  it('signUp reports an unreachable service as unavailable', async () => {
    handler = () => {
      throw new TypeError('fetch failed')
    }
    expect(await make().signUp('a@example.test', 'Abc12345')).toEqual({ ok: false, error: 'unavailable' })
  })

  it('resend, reset, verify and the password calls map their results', async () => {
    const client = make()
    handler = () => json(200, {})
    expect(await client.resendConfirmation('a@example.test')).toEqual({ ok: true })
    expect(await client.requestPasswordReset('a@example.test')).toEqual({ ok: true })

    handler = () => json(429, { code: 'over_email_send_rate_limit', message: 'rate' })
    expect(await client.resendConfirmation('a@example.test')).toEqual({ ok: false, error: 'rate_limited' })

    handler = () => json(403, { code: 'otp_expired', message: 'Email link is invalid or has expired' })
    expect(await client.verifyEmailLink('hash', 'email')).toEqual({ ok: false, error: 'link_invalid' })

    handler = () => json(200, sessionBody())
    expect(await client.verifyEmailLink('hash', 'recovery')).toEqual({ ok: true })

    handler = (url) => (url.pathname.endsWith('/user') ? json(200, USER) : json(404, {}))
    expect(await client.setNewPassword('Xyz98765')).toEqual({ ok: true })
    expect(await client.changePassword('Abc12345', 'Xyz98765')).toEqual({ ok: true })
    expect(calls.at(-1)?.body).toMatchObject({ password: 'Xyz98765', current_password: 'Abc12345' })

    handler = () => json(400, { code: 'current_password_invalid', message: 'x' })
    expect(await client.changePassword('wrong', 'Xyz98765')).toEqual({ ok: false, error: 'wrong_current_password' })
  })

  it('refresh renews the session, and gives null when the refresh token is refused', async () => {
    const client = make()
    handler = () => json(200, sessionBody('ACCESS-1', 'R1'))
    await client.signIn('a@example.test', 'Abc12345')

    handler = () => json(200, sessionBody('ACCESS-2', 'R2'))
    expect((await client.refresh())?.accessToken).toBe('ACCESS-2')

    handler = () => json(400, { code: 'refresh_token_not_found', message: 'Invalid Refresh Token' })
    expect(await client.refresh()).toBeNull()
  })

  it('getSession is null when signed out, and an expired token is renewed first', async () => {
    const client = make()
    expect(await client.getSession()).toBeNull()
    expect(await client.getAccessToken()).toBeNull()

    handler = () => json(200, sessionBody('OLD', 'R1', 1))
    await client.signIn('a@example.test', 'Abc12345')
    await new Promise((r) => setTimeout(r, 20))
    handler = () => json(200, sessionBody('NEW', 'R2'))
    expect((await make().getSession())?.accessToken).toBe('NEW')
  })

  it('onChange reports other-tab changes and skips this client\'s own signOut', async () => {
    const client = make()
    handler = () => json(200, sessionBody())
    await client.signIn('a@example.test', 'Abc12345')
    const seen: AuthEvent[] = []
    const stop = client.onChange((e) => seen.push(e))

    handler = () => json(204, {})
    await client.signOut()
    await new Promise((r) => setTimeout(r, 20))
    expect(seen).toEqual([])
    expect(await client.getSession()).toBeNull()

    handler = () => json(200, sessionBody())
    await client.signIn('a@example.test', 'Abc12345')
    await new Promise((r) => setTimeout(r, 20))
    expect(seen).toContain('SIGNED_IN')
    stop()
    const count = seen.length
    await client.refresh()
    await new Promise((r) => setTimeout(r, 20))
    expect(seen).toHaveLength(count)
  })
})
