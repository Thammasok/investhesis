import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { beforeAll, describe, expect, it } from 'vitest'

const API = 'http://127.0.0.1:54321'
const MAILPIT = 'http://127.0.0.1:54324'
const PASSWORD = 'Abc12345'

const b64 = (part: string) => JSON.parse(Buffer.from(part, 'base64url').toString('utf8')) as Record<string, unknown>
const decodeProtectedHeader = (jwt: string) => b64(jwt.split('.')[0])
const decodeJwt = (jwt: string) => b64(jwt.split('.')[1])

function anonKey(): string {
  const out = execFileSync('pnpm', ['exec', 'supabase', 'status', '-o', 'env'], { encoding: 'utf8' })
  const line = out.split('\n').find((l) => /^(ANON_KEY|PUBLISHABLE_KEY)=/.test(l))
  if (!line) throw new Error('no anon key in `supabase status`; run pnpm db:start first')
  return line.slice(line.indexOf('=') + 1).replace(/"/g, '')
}

const key = anonKey()
const client = () => createClient(API, key, { auth: { persistSession: false, autoRefreshToken: false } })

const newEmail = () => `t-${randomUUID()}@example.test`

interface MailMessage {
  ID: string
  To: { Address: string }[]
}

async function mailFor(email: string): Promise<{ html: string; text: string }[]> {
  for (let i = 0; i < 20; i++) {
    const list = (await (await fetch(`${MAILPIT}/api/v1/messages`)).json()) as { messages: MailMessage[] }
    const mine = list.messages.filter((m) => m.To.some((t) => t.Address === email))
    if (mine.length > 0) {
      return Promise.all(
        mine.map(async (m) => {
          const full = (await (await fetch(`${MAILPIT}/api/v1/message/${m.ID}`)).json()) as {
            HTML: string
            Text: string
          }
          return { html: full.HTML, text: full.Text }
        }),
      )
    }
    await new Promise((r) => setTimeout(r, 250))
  }
  return []
}

async function confirmedUser(email: string, password = PASSWORD) {
  const sb = client()
  const { error } = await sb.auth.signUp({ email, password })
  expect(error).toBeNull()
  const [mail] = await mailFor(email)
  const hash = /token_hash=([^&"\s]+)/.exec(mail.html)![1]
  const verified = await sb.auth.verifyOtp({ token_hash: hash, type: 'email' })
  expect(verified.error).toBeNull()
  return sb
}

// Auth fetches the email templates from Kong and reloads them about every 10 s; Kong comes up after
// Auth, so a freshly started stack can send the built-in wording for a few seconds.
beforeAll(async () => {
  for (let i = 0; i < 40; i++) {
    const email = newEmail()
    await client().auth.signUp({ email, password: PASSWORD })
    const [mail] = await mailFor(email)
    if (mail && /\/auth\/confirm\?token_hash=/.test(mail.html)) return
    await new Promise((r) => setTimeout(r, 1000))
  }
  throw new Error('custom email templates not loaded by local Auth after 40 s')
}, 120_000)

describe('signing key script', () => {
  it('keeps the existing key on a second run', () => {
    const file = new URL('../supabase/signing_keys.json', import.meta.url)
    const before = readFileSync(file, 'utf8')
    execFileSync('pnpm', ['db:keys'], { encoding: 'utf8' })
    expect(readFileSync(file, 'utf8')).toBe(before)
    expect(JSON.parse(before)).toHaveLength(1)
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

  it('TC-U-002 enforces the 8 character minimum', async () => {
    const sb = client()
    const short = await sb.auth.signUp({ email: newEmail(), password: 'Abc1234' })
    expect(short.error?.code).toBe('weak_password')
    const ok = await sb.auth.signUp({ email: newEmail(), password: PASSWORD })
    expect(ok.error).toBeNull()
    expect(ok.data.user?.email_confirmed_at).toBeFalsy()
  })

  it('TC-U-003 sends token_hash links for confirmation and recovery', async () => {
    const email = newEmail()
    const sb = await confirmedUser(email)
    const [confirm] = await mailFor(email)
    expect(confirm.html).toMatch(/http:\/\/localhost:5173\/auth\/confirm\?token_hash=[^&"]+&(amp;)?type=email/)
  })

  it('TC-U-004 refuses sign-in before confirmation', async () => {
    const email = newEmail()
    const sb = client()
    await sb.auth.signUp({ email, password: PASSWORD })
    const { error } = await sb.auth.signInWithPassword({ email, password: PASSWORD })
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
