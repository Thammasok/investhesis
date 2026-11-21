import { expect, type BrowserContext, type Page, type Request } from '@playwright/test'
import { adminCreateUser, linkIn, newEmail, PASSWORD, signedIn, type Mail } from '../../scripts/lib/stack.ts'

export * from '../../scripts/lib/stack.ts'

/** Origin the suite's web server listens on (E2E_WEB_PORT, default 5173). */
export const WEB_ORIGIN = `http://localhost:${process.env.E2E_WEB_PORT ?? '5173'}`

/** The link of an email as the browser should open it: Auth writes the site URL (:5173), the suite may run elsewhere. */
export function emailLink(mail: Mail): string {
  const link = linkIn(mail)
  return `${WEB_ORIGIN}${link.pathname}${link.search}`
}

export const NEW_PASSWORD = 'Xyz98765'
export const STORAGE_KEY = 'sb-127-auth-token'

/** A confirmed user created through the admin API, with a unique @example.test address. */
export const makeUser = (prefix = 'e2e') => adminCreateUser(newEmail(prefix))

/**
 * Puts a freshly signed-in session into the page's localStorage (one `/token` call from node, no
 * UI), then opens `path`. Use it when sign-in itself is not the thing under test.
 */
export async function openSignedIn(page: Page, user: { email: string; password?: string }, path = '/stocks') {
  const { session } = await signedIn(user.email, user.password ?? PASSWORD)
  await page.goto('/auth/forgot-password')
  await page.evaluate(([key, value]) => localStorage.setItem(key as string, value as string), [STORAGE_KEY, JSON.stringify(session)])
  await page.goto(path)
  return session
}

export async function fillSignIn(page: Page, email: string, password: string) {
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
}

export async function signInUI(page: Page, email: string, password = PASSWORD, from = '/auth/sign-in') {
  await page.goto(from)
  await fillSignIn(page, email, password)
  await page.getByRole('button', { name: 'Sign in' }).click()
}

export const accountMenu = (page: Page) => page.getByRole('button', { name: 'Account menu' })

export async function signOutViaMenu(page: Page) {
  await accountMenu(page).click()
  await page.getByRole('menuitem', { name: 'Sign out' }).click()
  await expect(page).toHaveURL(/\/auth\/sign-in/)
}

export async function storedToken(page: Page): Promise<string | null> {
  return page.evaluate((key) => {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as { access_token: string }).access_token : null
  }, STORAGE_KEY)
}

/** `GET /api/me` from inside the page, with the stored Bearer token. */
export async function meFromPage(page: Page): Promise<{ status: number; body: { id: string; email: string } }> {
  return page.evaluate(async (key) => {
    const raw = localStorage.getItem(key)
    const token = raw ? (JSON.parse(raw) as { access_token: string }).access_token : ''
    const res = await fetch('/api/me', { headers: { authorization: `Bearer ${token}` } })
    return { status: res.status, body: (await res.json()) as { id: string; email: string } }
  }, STORAGE_KEY)
}

/** Every request the page makes, for assertions about what was (not) sent. */
export function recordRequests(target: Page | BrowserContext) {
  const requests: Request[] = []
  target.on('request', (r) => requests.push(r))
  return requests
}

/** Walks the session history back to its start and returns every URL on the way (current first). */
export async function historyUrls(page: Page): Promise<string[]> {
  const urls = [page.url()]
  for (let i = 0; i < 20; i++) {
    const before = page.url()
    const res = await page.goBack({ waitUntil: 'commit' }).catch(() => null)
    if (!res && page.url() === before) break
    urls.push(page.url())
    if (page.url() === 'about:blank') break
  }
  return urls
}

export function expectNoSecretsIn(urls: string[], secrets: string[]) {
  for (const url of urls) {
    for (const bad of ['token_hash', 'access_token', 'refresh_token', ...secrets]) {
      expect(url, `URL ${url}`).not.toContain(bad)
    }
  }
}

export const trackNavigations = (page: Page) => {
  const urls: string[] = []
  page.on('framenavigated', (f) => {
    if (f === page.mainFrame()) urls.push(f.url())
  })
  return urls
}
