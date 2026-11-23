import { execFileSync, spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/** Helpers for tests that run against the local Supabase stack (`pnpm db:start`). */

export const API = 'http://127.0.0.1:54321'
export const MAILPIT = 'http://127.0.0.1:54324'
export const PASSWORD = 'Abc12345'
export const DB_CONTAINER = 'supabase_db_investhesis'

const b64 = (part: string) => JSON.parse(Buffer.from(part, 'base64url').toString('utf8')) as Record<string, unknown>
export const decodeProtectedHeader = (jwt: string) => b64(jwt.split('.')[0] ?? '')
export const decodeJwt = (jwt: string) => b64(jwt.split('.')[1] ?? '')

let statusEnv: Record<string, string> | undefined
/** `supabase status -o env` as a map; throws a helpful error when the stack is down. */
export function stackEnv(): Record<string, string> {
  if (statusEnv) return statusEnv
  let out: string
  try {
    out = execFileSync('pnpm', ['exec', 'supabase', 'status', '-o', 'env'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
  } catch {
    throw new Error('local Supabase is not running; run pnpm db:start first')
  }
  const env: Record<string, string> = {}
  for (const line of out.split('\n')) {
    const eq = line.indexOf('=')
    if (eq > 0) env[line.slice(0, eq)] = line.slice(eq + 1).replace(/^"|"$/g, '')
  }
  statusEnv = env
  return env
}

export function publishableKey(): string {
  const env = stackEnv()
  const key = env.PUBLISHABLE_KEY ?? env.ANON_KEY
  if (!key) throw new Error('no publishable key in `supabase status`')
  return key
}

export function serviceKey(): string {
  const env = stackEnv()
  const key = env.SERVICE_ROLE_KEY ?? env.SECRET_KEY
  if (!key) throw new Error('no service role key in `supabase status`')
  return key
}

export const client = (): SupabaseClient =>
  createClient(API, publishableKey(), { auth: { persistSession: false, autoRefreshToken: false } })

export const newEmail = (prefix = 't') => `${prefix}-${randomUUID()}@example.test`

export type Mail = { id: string; to: string; subject: string; html: string; text: string; created: string }

interface MailListItem {
  ID: string
  Subject: string
  Created: string
  To: { Address: string }[]
}

/** Every message addressed to `email`, oldest first (no waiting). */
export async function messagesTo(email: string): Promise<Mail[]> {
  const list = (await (await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}&limit=50`)).json()) as {
    messages: MailListItem[] | null
  }
  const mine = (list.messages ?? []).filter((m) => m.To.some((t) => t.Address.toLowerCase() === email.toLowerCase()))
  const full = await Promise.all(
    mine.map(async (m): Promise<Mail> => {
      const body = (await (await fetch(`${MAILPIT}/api/v1/message/${m.ID}`)).json()) as { HTML: string; Text: string }
      return { id: m.ID, to: email, subject: m.Subject, html: body.HTML, text: body.Text, created: m.Created }
    }),
  )
  return full.sort((a, b) => a.created.localeCompare(b.created))
}

/** Polls Mailpit until at least `count` messages to `email` match `accept` (default any), or `timeoutMs` passes. */
export async function mailFor(
  email: string,
  { count = 1, timeoutMs = 10_000, accept = (_m: Mail) => true }: { count?: number; timeoutMs?: number; accept?: (m: Mail) => boolean } = {},
): Promise<Mail[]> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const found = (await messagesTo(email)).filter(accept)
    if (found.length >= count || Date.now() > deadline) return found
    await new Promise((r) => setTimeout(r, 250))
  }
}

/** The first link in a message, with HTML entities decoded. */
export function linkIn(mail: Mail): URL {
  const m = /https?:\/\/[^\s"'<>]+/.exec(mail.html.replace(/&amp;/g, '&'))
  if (!m) throw new Error('no link in mail')
  return new URL(m[0])
}

export const tokenHashIn = (mail: Mail): string => {
  const hash = linkIn(mail).searchParams.get('token_hash')
  if (!hash) throw new Error('no token_hash in link')
  return hash
}

/** A confirmed user created through the admin API (no email is sent). */
export async function adminCreateUser(
  email = newEmail('u'),
  { password = PASSWORD, confirmed = true }: { password?: string; confirmed?: boolean } = {},
): Promise<{ id: string; email: string; password: string }> {
  const res = await fetch(`${API}/auth/v1/admin/users`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', apikey: serviceKey(), authorization: `Bearer ${serviceKey()}` },
    body: JSON.stringify({ email, password, email_confirm: confirmed }),
  })
  if (!res.ok) throw new Error(`admin create user failed: ${res.status} ${await res.text()}`)
  const user = (await res.json()) as { id: string }
  return { id: user.id, email, password }
}

/** Signs in an admin-created user; returns the client and its session. */
export async function signedIn(email: string, password = PASSWORD) {
  const sb = client()
  const { data, error } = await sb.auth.signInWithPassword({ email, password })
  if (error || !data.session) throw new Error(`sign-in failed: ${error?.code ?? 'no session'}`)
  return { sb, session: data.session }
}

/**
 * An unconfirmed user created through the admin API, who has been sent the confirmation mail through
 * public `resend` (ADR-018). Needs no public sign-up, so it works with `enable_signup` on or off.
 */
export async function unconfirmedUser(email: string, password = PASSWORD) {
  await adminCreateUser(email, { password, confirmed: false })
  const sb = client()
  const { error } = await sb.auth.resend({ type: 'signup', email })
  if (error) throw new Error(`resend failed: ${error.code}`)
  return sb
}

/** A user who was created by the admin API and confirmed through the real email link. */
export async function confirmedUser(email: string, password = PASSWORD) {
  const sb = await unconfirmedUser(email, password)
  const [mail] = await mailFor(email)
  if (!mail) throw new Error('no confirmation mail')
  const verified = await sb.auth.verifyOtp({ token_hash: tokenHashIn(mail), type: 'email' })
  if (verified.error) throw new Error(`verify failed: ${verified.error.code}`)
  return sb
}

const PSQL_TIMEOUT_MS = 15_000

export function psql(sql: string): { out: string; err: string; status: number | null } {
  const r = spawnSync(
    'docker',
    ['exec', '-i', DB_CONTAINER, 'psql', '-U', 'postgres', '-d', 'postgres', '-At', '-v', 'VERBOSITY=verbose'],
    // Time-bounded: a hung `docker exec` once stalled TC-E-002 until the test timeout.
    { input: sql, encoding: 'utf8', timeout: PSQL_TIMEOUT_MS, killSignal: 'SIGKILL' },
  )
  if (r.error) throw new Error(`psql did not finish within ${PSQL_TIMEOUT_MS} ms: ${r.error.message}`)
  return { out: r.stdout.trim(), err: r.stderr, status: r.status }
}

export const userCount = (email: string) => Number(psql(`select count(*) from auth.users where email = '${email.toLowerCase()}';`).out)
