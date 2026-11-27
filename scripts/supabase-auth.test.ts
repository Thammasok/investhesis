import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  adminCreateUser,
  API,
  client,
  confirmedUser,
  decodeJwt,
  decodeProtectedHeader,
  mailFor,
  newEmail,
  PASSWORD,
  psql,
  serviceKey,
  tokenHashIn,
  unconfirmedUser,
  userCount,
} from './lib/stack.ts'

describe('signing key script', () => {
  it('keeps the existing key on a second run', () => {
    const file = new URL('../supabase/signing_keys.json', import.meta.url)
    const before = readFileSync(file, 'utf8')
    execFileSync('pnpm', ['db:keys'], { encoding: 'utf8' })
    expect(readFileSync(file, 'utf8')).toBe(before)
    expect(JSON.parse(before)).toHaveLength(1)
  })
})

describe('test helpers need no public sign-up (T-001)', () => {
  it('TC-U-301 confirmedUser creates its user through the admin API', async () => {
    const email = newEmail('h')
    const sb = await confirmedUser(email)
    const { data, error } = await sb.auth.signInWithPassword({ email, password: PASSWORD })
    expect(error).toBeNull()
    expect(data.session).toBeTruthy()
    expect(psql(`select email_confirmed_at is not null from auth.users where email = '${email}';`).out).toBe('t')
  })

  it('TC-U-302 the warm-up message carries the custom template link', async () => {
    const email = newEmail('warm')
    await unconfirmedUser(email)
    const [mail] = await mailFor(email, { timeoutMs: 40_000, accept: (m) => /\/auth\/confirm\?token_hash=/.test(m.html) })
    expect(mail).toBeTruthy()
  })
})

describe('local Supabase Auth settings', () => {
  it('TC-U-001 publishes one ES256 key at the JWKS endpoint', async () => {
    const res = await fetch(`${API}/auth/v1/.well-known/jwks.json`)
    const body = (await res.json()) as { keys: Record<string, unknown>[] }
    expect(body.keys).toHaveLength(1)
    expect(body.keys[0]).toMatchObject({ kty: 'EC', crv: 'P-256', alg: 'ES256' })
    expect(body.keys[0].kid).toBeTruthy()
    expect(body.keys[0]).not.toHaveProperty('d')
  })

  it('TC-A-305 the Admin API enforces the 8 character minimum (successor of TC-U-002)', async () => {
    const create = (password: string) =>
      fetch(`${API}/auth/v1/admin/users`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', apikey: serviceKey(), authorization: `Bearer ${serviceKey()}` },
        body: JSON.stringify({ email: newEmail('pw'), password, email_confirm: false }),
      })
    const short = await create('Abc1234')
    expect(short.status).toBe(422)
    expect(((await short.json()) as { error_code: string }).error_code).toBe('weak_password')
    expect((await create(PASSWORD)).ok).toBe(true)
  })

  it('TC-U-003 sends token_hash links for confirmation and recovery', async () => {
    const email = newEmail()
    const sb = await confirmedUser(email)
    const [confirm] = await mailFor(email)
    expect(confirm.html).toMatch(/http:\/\/localhost:5173\/auth\/confirm\?token_hash=[^&"]+&(amp;)?type=email/)
  })

  it('TC-U-004 refuses sign-in before confirmation', async () => {
    const email = newEmail()
    await adminCreateUser(email, { confirmed: false })
    const { error } = await client().auth.signInWithPassword({ email, password: PASSWORD })
    expect(error?.code).toBe('email_not_confirmed')
  })

  it('TC-U-005 requires the current password to change it, and issues ES256 tokens', async () => {
    const email = newEmail()
    const sb = await confirmedUser(email)
    const { data } = await sb.auth.signInWithPassword({ email, password: PASSWORD })
    const token = data.session!.access_token
    expect(decodeProtectedHeader(token).alg).toBe('ES256')
    const claims = decodeJwt(token)
    expect(claims).toMatchObject({ iss: `${API}/auth/v1`, aud: 'authenticated', role: 'authenticated' })
    expect(Number(claims.exp) - Number(claims.iat)).toBe(3600)

    const without = await sb.auth.updateUser({ password: 'Xyz98765' })
    expect(without.error?.code).toBe('current_password_required')
    const wrong = await sb.auth.updateUser({ password: 'Xyz98765', current_password: 'Wrong1234' })
    expect(wrong.error?.code).toBe('current_password_invalid')
    const ok = await sb.auth.updateUser({ password: 'Xyz98765', current_password: PASSWORD })
    expect(ok.error).toBeNull()
  })

  it('sends a recovery link with type=recovery', async () => {
    const email = newEmail()
    const sb = await confirmedUser(email)
    await sb.auth.signOut()
    const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: 'http://localhost:5173/auth/reset' })
    expect(error).toBeNull()
    for (let i = 0; i < 20; i++) {
      const mails = await mailFor(email)
      if (mails.some((m) => /http:\/\/localhost:5173\/auth\/confirm\?token_hash=[^&"]+&(amp;)?type=recovery/.test(m.html))) return
      await new Promise((r) => setTimeout(r, 250))
    }
    throw new Error('no recovery mail')
  })
})

const sqlState = (err: string) => /ERROR:\s+([0-9A-Z]{5}):/.exec(err)?.[1]

/** Parsed `[section] key = value` lines of config.toml (enough for the two settings checked here). */
function readConfig(): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = {}
  let section = ''
  for (const raw of readFileSync(new URL('../supabase/config.toml', import.meta.url), 'utf8').split('\n')) {
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

describe('closed sign-up (user-auth v1.2 T-003)', () => {
  const tag = randomUUID().slice(0, 8)

  it('TC-U-309 spike: admin create, public resend, mail link and sign-in all work with sign-up closed', async () => {
    const email = `spike-${tag}@example.test`
    const created = await adminCreateUser(email, { confirmed: false })
    expect(created.id).toBeTruthy()

    const sb = client()
    const resend = await sb.auth.resend({ type: 'signup', email })
    expect(resend.error).toBeNull()
    const mails = await mailFor(email)
    expect(mails).toHaveLength(1)

    const verified = await sb.auth.verifyOtp({ token_hash: tokenHashIn(mails[0]!), type: 'email' })
    expect(verified.error).toBeNull()
    const { data, error } = await client().auth.signInWithPassword({ email, password: PASSWORD })
    expect(error).toBeNull()
    expect(data.session).toBeTruthy()
  })

  it('TC-U-310 public sign-up is refused with 422 signup_disabled and nothing is created', async () => {
    for (const email of [`a-${tag}@example.test`, `a-${tag}@gmail.com`]) {
      const { error } = await client().auth.signUp({ email, password: PASSWORD })
      expect(error?.status, email).toBe(422)
      expect(error?.code, email).toBe('signup_disabled')
      expect(userCount(email), email).toBe(0)
      expect(await mailFor(email, { timeoutMs: 1500 }), email).toHaveLength(0)
    }
  })

  it('TC-U-311 the allowlist table and the hook function are gone', () => {
    const r = psql(
      `select to_regprocedure('app.hook_before_user_created(jsonb)') is null, to_regclass('app.signup_allowlist') is null;`,
    )
    expect(r.err).toBe('')
    expect(r.out).toBe('t|t')
  })

  it('TC-U-312 config.toml closes sign-up and has no Before User Created hook', () => {
    const config = readConfig()
    expect(config.auth?.enable_signup).toBe('false')
    const hook = config['auth.hook.before_user_created']
    expect(hook === undefined || hook.enabled === 'false').toBe(true)
  })

  it('TC-U-313 an admin-created user resets the password through the mail link and signs in with it', async () => {
    const user = await adminCreateUser(newEmail('reset'))
    const sb = client()
    const sent = await sb.auth.resetPasswordForEmail(user.email, { redirectTo: 'http://localhost:5173/auth/confirm' })
    expect(sent.error).toBeNull()
    const [mail] = await mailFor(user.email, { accept: (m) => /type=recovery/.test(m.html.replace(/&amp;/g, '&')) })
    expect(mail).toBeTruthy()

    const verified = await sb.auth.verifyOtp({ token_hash: tokenHashIn(mail!), type: 'recovery' })
    expect(verified.error).toBeNull()
    const changed = await sb.auth.updateUser({ password: 'correct-horse-2' })
    expect(changed.error).toBeNull()
    await sb.auth.signOut()

    const again = await client().auth.signInWithPassword({ email: user.email, password: 'correct-horse-2' })
    expect(again.error).toBeNull()
    expect(again.data.session).toBeTruthy()
    const old = await client().auth.signInWithPassword({ email: user.email, password: PASSWORD })
    expect(old.error?.code).toBe('invalid_credentials')
  })

  it('TC-U-314 public resend sends a mail only for an admin-created unconfirmed address and creates no user', async () => {
    const unknown = `nobody-${tag}@example.test`
    const unconfirmed = `unconf-${tag}@example.test`
    await adminCreateUser(unconfirmed, { confirmed: false })

    const a = await client().auth.resend({ type: 'signup', email: unknown })
    const b = await client().auth.resend({ type: 'signup', email: unconfirmed })

    expect(userCount(unknown)).toBe(0)
    expect(await mailFor(unknown, { timeoutMs: 2000 })).toHaveLength(0)
    expect(await mailFor(unconfirmed)).toHaveLength(1)
    // Pinned in supabase/README.md: both calls succeed with the same body, so the response shows nothing
    // about whether an address exists or is unconfirmed (no finding).
    expect(a.error).toBeNull()
    expect(b.error).toBeNull()
    expect(a.data).toEqual(b.data)
  })

  it('TC-U-315 anon and authenticated cannot read the app schema', () => {
    for (const role of ['anon', 'authenticated']) {
      for (const table of ['stocks', 'lists']) {
        expect(sqlState(psql(`set role ${role}; select * from app.${table};`).err), `${role} ${table}`).toBe('42501')
      }
    }
  })

  it('TC-A-311 the close_signup migration sorts after stock_lists and can run twice', () => {
    const dir = new URL('../supabase/migrations/', import.meta.url)
    const names = readdirSync(dir).sort()
    const close = names.find((f) => f.endsWith('_close_signup.sql'))
    expect(close).toBeTruthy()
    expect(names.findIndex((f) => f === close)).toBeGreaterThan(names.findIndex((f) => f.endsWith('_stock_lists.sql')))
    expect(names.some((f) => f.endsWith('_signup_allowlist.sql'))).toBe(true)
    const r = psql(readFileSync(new URL(close!, dir), 'utf8'))
    expect(r.status).toBe(0)
    expect(sqlState(r.err)).toBeUndefined()
  })

  it('TC-A-313 seed.sql no longer mentions the allowlist', () => {
    expect(readFileSync(new URL('../supabase/seed.sql', import.meta.url), 'utf8')).not.toMatch(/signup_allowlist/)
  })
})
