import { mailFor, newEmail, unconfirmedUser } from './stack.ts'

/**
 * Auth fetches the email templates from Kong and reloads them about every 10 s; Kong comes up after
 * Auth, so a freshly started stack can send the built-in wording for a few seconds. Wait for the
 * custom templates once, before any test file runs.
 */
export default async function setup() {
  for (let i = 0; i < 40; i++) {
    const email = newEmail('warmup')
    await unconfirmedUser(email)
    const [mail] = await mailFor(email, { timeoutMs: 5000 })
    if (mail && /\/auth\/confirm\?token_hash=/.test(mail.html)) return
    await new Promise((r) => setTimeout(r, 1000))
  }
  throw new Error('custom email templates not loaded by local Auth after 40 s')
}
