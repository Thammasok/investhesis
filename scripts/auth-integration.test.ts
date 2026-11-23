import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildApp } from '../apps/api/src/app.ts'
import { supabaseIdentityResolver } from '../apps/api/src/auth/supabase-identity-resolver.ts'
import { loadConfig } from '../apps/api/src/config/env.ts'
import { createRemoteJWKSet, supabaseEnv } from '../apps/api/test/auth.ts'
import {
  adminCreateUser,
  API,
  client,
  decodeJwt,
  decodeProtectedHeader,
  linkIn,
  mailFor,
  messagesTo,
  newEmail,
  PASSWORD,
  psql,
  publishableKey,
  serviceKey,
  signedIn,
  tokenHashIn,
  unconfirmedUser,
  userCount,
} from './lib/stack.ts'

const ROOT = resolve(import.meta.dirname, '..')
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

describe('access tokens from local Auth (TC-A-018..020)', () => {
  it('TC-A-018: a token from signInWithPassword has the ES256 header and the designed claims', async () => {
    // Arrange
    const user = await adminCreateUser()

    // Act
    const { session } = await signedIn(user.email)

    // Assert
    const header = decodeProtectedHeader(session.access_token)
    const jwks = (await (await fetch(`${API}/auth/v1/.well-known/jwks.json`)).json()) as { keys: { kid: string }[] }
    expect(header.alg).toBe('ES256')
    expect(jwks.keys.map((k) => k.kid)).toContain(header.kid)
    const claims = decodeJwt(session.access_token)
    expect(claims).toMatchObject({ iss: `${API}/auth/v1`, aud: 'authenticated', role: 'authenticated' })
    expect(Number(claims.exp) - Number(claims.iat)).toBe(3600)
    expect(String(claims.sub)).toMatch(UUID)
    expect(claims.sub).toBe(user.id)
    expect(claims.is_anonymous).not.toBe(true)
  })

  it('TC-A-019: the API verifier accepts a real local token and knows the user', async () => {
    // Arrange
    const user = await adminCreateUser()
    const { session } = await signedIn(user.email)
    const config = loadConfig(supabaseEnv)
    const app = await buildApp({
      config,
      resolveIdentity: supabaseIdentityResolver({
        issuer: config.supabaseAuth?.issuer ?? '',
        audience: 'authenticated',
        keys: createRemoteJWKSet(new URL(config.supabaseAuth?.jwksUrl ?? '')),
      }),
      logStream: { write() {} },
    })

    // Act
    const res = await app.inject({ method: 'GET', url: '/me', headers: { authorization: `Bearer ${session.access_token}` } })
    await app.close()

    // Assert
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ id: user.id, email: user.email })
    expect(psql(`select id from auth.users where email = '${user.email}';`).out).toBe(user.id)
  })

  it('TC-A-020: anonymous sign-ins are disabled and create no user', async () => {
    const before = psql(`select count(*) from auth.users where is_anonymous;`).out
    const { error } = await client().auth.signInAnonymously()
    expect(error?.code).toBe('anonymous_provider_disabled')
    expect(psql(`select count(*) from auth.users where is_anonymous;`).out).toBe(before)
  })
})

describe('password and account rules at the provider (TC-A-023, TC-A-305, TC-A-309)', () => {
  it('TC-A-305: a 72-character password is accepted by the Admin API', async () => {
    const email = newEmail()
    await adminCreateUser(email, { password: 'a'.repeat(72) })
    expect(userCount(email)).toBe(1)
    const { error } = await client().auth.signInWithPassword({ email, password: 'a'.repeat(72) })
    expect(error).toBeNull()
  })

  it('TC-A-305: a 73-character password is rejected and creates no user', async () => {
    const email = newEmail()
    await expect(adminCreateUser(email, { password: 'a'.repeat(73) })).rejects.toThrow(/400.*validation_failed/)
    expect(userCount(email)).toBe(0)
  })

  it('TC-A-309: creating the same address twice (any case) is refused and leaves one user', async () => {
    const user = await adminCreateUser(newEmail('taken'))
    await expect(adminCreateUser(user.email, { password: 'Different123' })).rejects.toThrow(/email_exists/)
    await expect(adminCreateUser(user.email.toUpperCase(), { password: 'Different123' })).rejects.toThrow(/email_exists/)
    expect(userCount(user.email)).toBe(1)
    const old = await client().auth.signInWithPassword({ email: user.email, password: PASSWORD })
    expect(old.error).toBeNull()
  })

  it('TC-A-302: public sign-up answers the same 422 for a known, an unconfirmed, an unknown and a mixed-case address', async () => {
    const known = await adminCreateUser(newEmail('known'))
    const unconfirmed = newEmail('unconf')
    await adminCreateUser(unconfirmed, { confirmed: false })
    const addresses = [known.email, unconfirmed, newEmail('unknown'), known.email.replace(/^k/, 'K')]
    const before = psql(`select count(*) from auth.users;`).out

    const results = await Promise.all(addresses.map((email) => client().auth.signUp({ email, password: 'Different123' })))

    for (const r of results) {
      expect(r.error?.status).toBe(422)
      expect(r.error?.code).toBe('signup_disabled')
    }
    expect(new Set(results.map((r) => r.error?.message)).size).toBe(1)
    expect(psql(`select count(*) from auth.users;`).out).toBe(before)
    const old = await client().auth.signInWithPassword({ email: known.email, password: PASSWORD })
    expect(old.error).toBeNull()
  })

  it('TC-A-023: wrong password and unknown email fail identically', async () => {
    // Arrange
    const user = await adminCreateUser()

    // Act
    const wrong = await client().auth.signInWithPassword({ email: user.email, password: 'Wrong12345' })
    const unknown = await client().auth.signInWithPassword({ email: newEmail('nobody'), password: 'Wrong12345' })

    // Assert
    expect(wrong.error?.code).toBe('invalid_credentials')
    expect(unknown.error?.code).toBe('invalid_credentials')
    expect(wrong.error?.status).toBe(unknown.error?.status)
    expect(wrong.error?.message).toBe(unknown.error?.message)
  })
})

describe('emails and links (TC-A-024..028, TC-A-301, TC-A-315)', () => {
  it('TC-A-024: a reset for an unregistered email is silent', async () => {
    const email = newEmail('nobody')
    const { error } = await client().auth.resetPasswordForEmail(email, { redirectTo: 'http://localhost:5173/auth/confirm' })
    expect(error).toBeNull()
    expect(await mailFor(email, { timeoutMs: 2000 })).toHaveLength(0)
  })

  it('TC-A-025: the recovery email links to /auth/confirm with type=recovery', async () => {
    const user = await adminCreateUser()
    const { error } = await client().auth.resetPasswordForEmail(user.email, { redirectTo: 'http://localhost:5173/auth/confirm' })
    expect(error).toBeNull()

    const mails = await mailFor(user.email)

    expect(mails).toHaveLength(1)
    const link = linkIn(mails[0]!)
    expect(`${link.origin}${link.pathname}`).toBe('http://localhost:5173/auth/confirm')
    expect(link.searchParams.get('type')).toBe('recovery')
    expect(link.searchParams.get('token_hash')).toBeTruthy()
  })

  it('TC-A-026: a confirmation link works once', async () => {
    const email = newEmail()
    const sb = await unconfirmedUser(email)
    const [mail] = await mailFor(email)
    const hash = tokenHashIn(mail!)

    const first = await sb.auth.verifyOtp({ token_hash: hash, type: 'email' })
    const second = await client().auth.verifyOtp({ token_hash: hash, type: 'email' })

    expect(first.error).toBeNull()
    expect(first.data.session?.access_token).toBeTruthy()
    expect(second.error?.code).toBe('otp_expired')
    expect(second.data.session).toBeNull()
  })

  it('TC-A-027: a truncated hash and a wrong type are both invalid', async () => {
    const email = newEmail()
    await unconfirmedUser(email)
    const [mail] = await mailFor(email)
    const hash = tokenHashIn(mail!)

    const truncated = await client().auth.verifyOtp({ token_hash: hash.slice(0, -1), type: 'email' })
    const wrongType = await client().auth.verifyOtp({ token_hash: hash, type: 'recovery' })

    for (const r of [truncated, wrongType]) {
      expect(r.error).not.toBeNull()
      expect(['otp_expired', 'bad_code_verifier']).toContain(r.error?.code)
      expect(r.data.session).toBeNull()
    }
    // the real link must still be unspent
    expect((await client().auth.verifyOtp({ token_hash: hash, type: 'email' })).error).toBeNull()
  })

  it('TC-A-028: a second confirmation email inside the 60 s window is refused', async () => {
    const email = newEmail()
    const sb = await unconfirmedUser(email)
    await mailFor(email)

    const { error } = await sb.auth.resend({ type: 'signup', email })

    expect(error?.code).toBe('over_email_send_rate_limit')
    expect(await messagesTo(email)).toHaveLength(1)
  })

  it('TC-A-315: a foreign redirect URL never reaches a resend or recovery link', async () => {
    // Arrange
    const unconfirmed = newEmail('unconf')
    await adminCreateUser(unconfirmed, { confirmed: false })
    const user = await adminCreateUser()

    // Act
    await client().auth.resend({ type: 'signup', email: unconfirmed, options: { emailRedirectTo: 'https://evil.example/auth/confirm' } })
    const reset = await client().auth.resetPasswordForEmail(user.email, { redirectTo: 'https://evil.example/' })

    // Assert: each link points at the site URL, or the call was rejected
    const confirmation = await mailFor(unconfirmed, { timeoutMs: 3000 })
    for (const mail of confirmation) {
      expect(mail.html).not.toContain('evil.example')
      expect(linkIn(mail).host).toBe('localhost:5173')
    }
    if (!reset.error) {
      const [recovery] = await mailFor(user.email)
      expect(recovery!.html).not.toContain('evil.example')
      expect(linkIn(recovery!).host).toBe('localhost:5173')
    }
  })

  it('TC-A-301/TC-A-303: a raw sign-up request and empty or anonymous variants create nothing', async () => {
    const headers = { 'content-type': 'application/json', apikey: publishableKey() }
    const email = newEmail('raw')
    const before = psql(`select count(*) from auth.users;`).out
    const post = (body: unknown) => fetch(`${API}/auth/v1/signup`, { method: 'POST', headers, body: JSON.stringify(body) })

    const raw = await post({ email, password: PASSWORD })
    expect(raw.status).toBe(422)
    expect(await raw.json()).toMatchObject({ code: 422, error_code: 'signup_disabled' })
    expect(await mailFor(email, { timeoutMs: 1500 })).toHaveLength(0)
    for (const body of [{}, { data: {} }, { phone: '+66812345678', password: PASSWORD }]) {
      const res = await post(body)
      expect(res.status, JSON.stringify(body)).toBeGreaterThanOrEqual(400)
      expect(res.status, JSON.stringify(body)).toBeLessThan(500)
    }
    expect(psql(`select count(*) from auth.users;`).out).toBe(before)
    expect(psql(`select count(*) from auth.users where is_anonymous;`).out).toBe('0')
  })
})

describe('refresh tokens (TC-A-030)', () => {
  it('TC-A-030: a stale refresh token is rejected as already used', async () => {
    // Arrange: R1 -> R2 -> R3, so R1 is no longer the direct parent of the live token.
    // Deviation from the case text (see test-report.md, D-1): local Auth 3.2.0 answers a reuse of the
    // direct parent with the live token even after the 10 s window, and a reuse of an older ancestor
    // is rejected with `refresh_token_already_used` but does NOT revoke the family.
    const user = await adminCreateUser()
    const { sb, session } = await signedIn(user.email)
    const r1 = session.refresh_token
    const r2 = (await sb.auth.refreshSession({ refresh_token: r1 })).data.session!.refresh_token
    const r3 = (await sb.auth.refreshSession({ refresh_token: r2 })).data.session!.refresh_token
    expect(new Set([r1, r2, r3]).size).toBe(3)

    // Act
    await sleep(11_000)
    const reuse = await client().auth.refreshSession({ refresh_token: r1 })

    // Assert
    expect(reuse.error?.code).toBe('refresh_token_already_used')
    expect(reuse.data.session).toBeNull()
  }, 40_000)

  it('TC-A-030: reuse inside 10 s is tolerated', async () => {
    const user = await adminCreateUser()
    const { sb, session } = await signedIn(user.email)
    const r1 = session.refresh_token
    await sb.auth.refreshSession({ refresh_token: r1 })

    const again = await client().auth.refreshSession({ refresh_token: r1 })

    expect(again.error).toBeNull()
  })
})

function parseToml(text: string): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = {}
  let section = ''
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\s+#.*$/, '').trim()
    if (!line || line.startsWith('#')) continue
    const header = /^\[([^\]]+)\]$/.exec(line)
    if (header) {
      section = header[1]!
      out[section] = {}
      continue
    }
    const kv = /^([A-Za-z0-9_.]+)\s*=\s*(.+)$/.exec(line)
    if (kv && out[section]) out[section][kv[1]!] = kv[2]!.replace(/^"|"$/g, '')
  }
  return out
}

describe('static checks of the project files (TC-A-310, TC-A-032)', () => {
  const config = parseToml(readFileSync(resolve(ROOT, 'supabase/config.toml'), 'utf8'))

  it('TC-A-310: auth settings match design.md (sign-up closed, no hook)', () => {
    expect(config.auth).toMatchObject({
      site_url: 'http://localhost:5173',
      additional_redirect_urls: '["http://localhost:5173/**"]',
      jwt_expiry: '3600',
      enable_refresh_token_rotation: 'true',
      refresh_token_reuse_interval: '10',
      enable_signup: 'false',
      enable_anonymous_sign_ins: 'false',
      minimum_password_length: '8',
      signing_keys_path: './signing_keys.json',
    })
    expect(config['auth.email']).toMatchObject({
      enable_confirmations: 'true',
      require_current_password: 'true',
      secure_password_change: 'false',
      max_frequency: '60s',
      otp_expiry: '3600',
    })
    const hook = config['auth.hook.before_user_created']
    expect(hook === undefined || hook.enabled === 'false').toBe(true)
  })

  it('TC-A-310: the email templates named in config.toml exist', () => {
    for (const section of ['auth.email.template.confirmation', 'auth.email.template.recovery']) {
      const path = config[section]?.content_path
      expect(path, section).toBeTruthy()
      expect(existsSync(resolve(ROOT, 'supabase', path ?? '')) || existsSync(resolve(ROOT, path ?? '')), `${section} ${path}`).toBe(true)
    }
  })

  it('TC-A-310: auth rate limits are not loosened beyond the CLI defaults', () => {
    const limits = config['auth.rate_limit'] ?? {}
    const ceiling: Record<string, number> = { email_sent: 2, sign_in_sign_ups: 30, token_refresh: 150, token_verifications: 30, anonymous_users: 30 }
    for (const [key, max] of Object.entries(ceiling)) {
      expect(Number(limits[key]), key).toBeLessThanOrEqual(max)
    }
  })

  it('TC-A-032: nothing needs a paid Supabase plan and the SMTP option for OQ-1 is named', () => {
    const toml = readFileSync(resolve(ROOT, 'supabase/config.toml'), 'utf8')
    const readme = readFileSync(resolve(ROOT, 'supabase/README.md'), 'utf8')
    const uncommented = toml.split('\n').filter((l) => !l.trim().startsWith('#')).join('\n')
    expect(uncommented).not.toMatch(/password_requirements\s*=\s*"[^"]+"/)
    expect(uncommented).not.toMatch(/sessions\.(timebox|inactivity_timeout)\s*=\s*"[^"]+/)
    expect(uncommented).not.toMatch(/\[auth\.saml\]/)
    expect(readme).toMatch(/\b(Resend|Brevo|Amazon SES|Mailtrap)\b[^\n]*(free|low-cost|low cost)|(free|low-cost|low cost)[^\n]*\b(Resend|Brevo|Amazon SES|Mailtrap)\b/i)
  })

  it('TC-A-032: the only runtime dependencies added for auth are jose and supabase-js', () => {
    const api = JSON.parse(readFileSync(resolve(ROOT, 'apps/api/package.json'), 'utf8')) as { dependencies: Record<string, string> }
    const web = JSON.parse(readFileSync(resolve(ROOT, 'apps/web/package.json'), 'utf8')) as { dependencies: Record<string, string> }
    const root = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8')) as { devDependencies: Record<string, string> }
    expect(api.dependencies).toHaveProperty('jose')
    expect(web.dependencies).toHaveProperty('@supabase/supabase-js')
    expect(root.devDependencies).toHaveProperty('supabase')
    // No auth SDKs from a vendor besides Supabase's own client.
    for (const name of Object.keys({ ...api.dependencies, ...web.dependencies })) {
      expect(name, name).not.toMatch(/^(@auth0|auth0|firebase|@clerk|next-auth|passport|@auth\/)/)
    }
  })
})

// ---- user-auth v1.2 T-005: admin-created accounts at the provider, in the API and in the repo files ----

/** The API in supabase mode, verifying tokens against the local JWKS (as TC-A-019 does). */
async function localApi() {
  const config = loadConfig(supabaseEnv)
  return buildApp({
    config,
    resolveIdentity: supabaseIdentityResolver({
      issuer: config.supabaseAuth?.issuer ?? '',
      audience: 'authenticated',
      keys: createRemoteJWKSet(new URL(config.supabaseAuth?.jwksUrl ?? '')),
    }),
    logStream: { write() {} },
  })
}

describe('admin-created user and the API (TC-A-304, TC-A-316)', () => {
  it('TC-A-304: an admin-created user signs in with no mail and the API answers /me with the same id and email', async () => {
    // Arrange
    const email = newEmail('admin-made')
    const user = await adminCreateUser(email)
    const app = await localApi()

    // Act
    const { session } = await signedIn(email)
    const res = await app.inject({ method: 'GET', url: '/me', headers: { authorization: `Bearer ${session.access_token}` } })
    await app.close()

    // Assert
    expect(await messagesTo(email)).toHaveLength(0)
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ id: user.id, email })
    expect(psql(`select id from auth.users where email = '${email}';`).out).toBe(user.id)
  })

  it('TC-A-316: /me accepts a valid token, rejects a tampered payload and a missing token', async () => {
    // Arrange
    const user = await adminCreateUser(newEmail('bad-token'))
    const { session } = await signedIn(user.email)
    const [head, payload, signature] = session.access_token.split('.') as [string, string, string]
    const mid = Math.floor(payload.length / 2)
    const tampered = `${head}.${payload.slice(0, mid)}${payload[mid] === 'A' ? 'B' : 'A'}${payload.slice(mid + 1)}.${signature}`
    const app = await localApi()
    const get = (token?: string) =>
      app.inject({ method: 'GET', url: '/me', headers: token ? { authorization: `Bearer ${token}` } : {} })

    // Act
    const [valid, bad, none] = [await get(session.access_token), await get(tampered), await get()]
    await app.close()

    // Assert
    expect(valid.statusCode).toBe(200)
    expect(bad.statusCode).toBe(401)
    expect(bad.json()).toMatchObject({ code: 'unauthenticated' })
    expect(bad.headers['www-authenticate']).toMatch(/^Bearer/)
    expect(none.statusCode).toBe(401)
  })
})

describe('recovery, refresh, sign-out and resend for admin-created users (TC-A-306, 307, 308, 314)', () => {
  it('TC-A-306: recovery answers the same for a known and an unknown address; only the known one gets mail', async () => {
    // Arrange
    const known = await adminCreateUser(newEmail('rec-known'))
    const unknown = newEmail('rec-ghost')
    const recover = async (email: string) => {
      const res = await fetch(`${API}/auth/v1/recover`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', apikey: publishableKey() },
        body: JSON.stringify({ email }),
      })
      return { status: res.status, body: await res.text() }
    }

    // Act
    const a = await recover(known.email)
    const b = await recover(unknown)

    // Assert
    expect(a).toEqual(b)
    expect(a.status).toBe(200)
    expect(await mailFor(known.email)).toHaveLength(1)
    expect(await mailFor(unknown, { timeoutMs: 2000 })).toHaveLength(0)
    expect(userCount(unknown)).toBe(0)
  })

  it('TC-A-307: refresh tokens rotate; a stale one is rejected and a reuse inside 10 s is tolerated (D-1: no family revocation locally)', async () => {
    // Arrange: R1 -> R2 -> R3, so R1 is no longer the direct parent of the live token.
    // Same deviation as TC-A-030 (v1.0 test report D-1): local Auth 3.2.0 rejects the stale ancestor with
    // `refresh_token_already_used` but does not revoke the session family, so that part is not asserted.
    const user = await adminCreateUser(newEmail('rot'))
    const { sb, session } = await signedIn(user.email)
    const r1 = session.refresh_token
    const r2 = (await sb.auth.refreshSession({ refresh_token: r1 })).data.session!.refresh_token
    const quick = await client().auth.refreshSession({ refresh_token: r1 })
    const r3 = (await sb.auth.refreshSession({ refresh_token: r2 })).data.session!.refresh_token
    expect(new Set([r1, r2, r3]).size).toBe(3)

    // Act
    await sleep(11_000)
    const stale = await client().auth.refreshSession({ refresh_token: r1 })

    // Assert
    expect(quick.error).toBeNull()
    expect(stale.error?.code).toBe('refresh_token_already_used')
    expect(stale.data.session).toBeNull()
  }, 40_000)

  it('TC-A-308: sign-out revokes the refresh token; the access token verifies only until it expires', async () => {
    // Arrange
    const user = await adminCreateUser(newEmail('out'))
    const { sb, session } = await signedIn(user.email)
    const app = await localApi()

    // Act
    const out = await sb.auth.signOut()
    const refresh = await client().auth.refreshSession({ refresh_token: session.refresh_token })
    const stillValid = await app.inject({ method: 'GET', url: '/me', headers: { authorization: `Bearer ${session.access_token}` } })
    await app.close()

    // Assert
    expect(out.error).toBeNull()
    expect(refresh.error).not.toBeNull()
    expect(refresh.data.session).toBeNull()
    // Unchanged v1.0 behaviour: the JWT is verified statelessly, so it works until `exp` (at most 1 hour).
    expect(stillValid.statusCode).toBe(200)
  })

  it('TC-A-314: a second resend inside 60 s is refused and sends nothing; one after the window is sent', async () => {
    // Arrange
    const email = newEmail('resend')
    const sb = await unconfirmedUser(email)
    await mailFor(email)

    // Act
    const inside = await sb.auth.resend({ type: 'signup', email })
    const afterInside = await messagesTo(email)
    await sleep(61_000)
    const later = await sb.auth.resend({ type: 'signup', email })
    const mails = await mailFor(email, { count: 2 })

    // Assert
    expect(inside.error?.code).toBe('over_email_send_rate_limit')
    expect(afterInside).toHaveLength(1)
    expect(later.error).toBeNull()
    expect(mails).toHaveLength(2)
  }, 90_000)
})

describe('no admin credential in the repository, and the README (TC-A-312, TC-A-318)', () => {
  const tracked = () =>
    execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' })
      .split('\n')
      .filter((f) => f && existsSync(resolve(ROOT, f)) && !/pnpm-lock\.yaml$|\.(png|ico|jpg|woff2?)$/.test(f))
  const read = (f: string) => readFileSync(resolve(ROOT, f), 'utf8')

  it('TC-A-312: no tracked file holds the live service key or any JWT or secret-key literal, and only the README and the test helper name it', () => {
    // Arrange
    const key = serviceKey()
    const jwt = /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/
    const secretKey = /sb_secret_[A-Za-z0-9_-]{8,}/
    const named = /service_role|SERVICE_ROLE_KEY/i
    const allowedToName = new Set(['supabase/README.md', 'scripts/lib/stack.ts', 'supabase/config.toml', 'scripts/auth-integration.test.ts'])

    // Act
    const files = tracked()
    const holdsKey: string[] = []
    const holdsLiteral: string[] = []
    const names: string[] = []
    for (const f of files) {
      if (f.startsWith('docs/')) continue
      const text = read(f)
      if (text.includes(key)) holdsKey.push(f)
      if (jwt.test(text) || secretKey.test(text)) holdsLiteral.push(f)
      if (named.test(text) && !allowedToName.has(f)) names.push(f)
    }

    // Assert
    expect(holdsKey).toEqual([])
    expect(holdsLiteral).toEqual([])
    expect(names).toEqual([])
    for (const f of files.filter((f) => /\.env(\.example)?$/.test(f))) expect(read(f), f).not.toMatch(named)
  })

  it('TC-A-312: the README curl uses placeholders for the key and the temporary password', () => {
    const readme = read('supabase/README.md')
    expect(readme).toContain('$SERVICE_ROLE_KEY')
    expect(readme).toContain('<temporary-password>')
    expect(readme).not.toMatch(/Authorization: Bearer (?!\$SERVICE_ROLE_KEY)[A-Za-z0-9._-]{20,}/)
  })

  it('TC-A-318: the README documents creating accounts, the hand-over, re-opening and the rollout order', () => {
    const readme = read('supabase/README.md')
    const section = readme.slice(readme.indexOf('## Creating accounts'), readme.indexOf('## Production email'))
    expect(readme).toMatch(/^## Creating accounts$/m)
    expect(readme).not.toMatch(/^#+ .*allowlist/im)
    expect(section).toMatch(/Add user/)
    expect(section).toMatch(/Auto Confirm User/)
    expect(section).toMatch(/\/auth\/v1\/admin\/users/)
    expect(section).toMatch(/Hand-over/)
    expect(section).toMatch(/change the password/i)
    expect(section).toMatch(/Re-opening sign-up/)
    expect(section).toMatch(/enable_signup = true/)
    expect(section).toMatch(/Allow new users to sign up/)
    expect(readme).toMatch(/\(1\)[^\n]*disable Before User Created[^\n]*\(2\)[^\n]*sign up[^\n]*off[^\n]*\(3\)[^\n]*supabase db push/)
  })
})
