import { expect, test } from '@playwright/test'
import {
  accountMenu,
  fillSignIn,
  makeUser,
  meFromPage,
  openSignedIn,
  PASSWORD,
  recordRequests,
  signInUI,
  signOutViaMenu,
  STORAGE_KEY,
  storedToken,
} from './lib/kit.ts'

const bearerOf = (headers: Record<string, string>) => headers.authorization

test.describe('session', () => {
  test('TC-E-009: the session survives a reload and a browser restart', async ({ page, browser }) => {
    const user = await makeUser('e2e-9')
    await signInUI(page, user.email)
    await expect(page).toHaveURL(/\/stocks$/)

    await page.reload()

    await expect(page).toHaveURL(/\/stocks$/)
    expect((await meFromPage(page)).status).toBe(200)

    const state = await page.context().storageState()
    const restarted = await browser.newContext({ storageState: state, baseURL: test.info().project.use.baseURL as string })
    const second = await restarted.newPage()
    await second.goto('/stocks')
    await expect(second).toHaveURL(/\/stocks$/)
    await expect(accountMenu(second)).toContainText(user.email)
    expect((await meFromPage(second)).status).toBe(200)
    await restarted.close()
  })

  test('TC-E-010: an expired access token is renewed silently, once', async ({ page }) => {
    // Arrange: seed a session, then make the next GET /api/me answer 401 once
    const user = await makeUser('e2e-10')
    await openSignedIn(page, user)
    await page.waitForTimeout(1200) // a refreshed token must differ from the seeded one (iat has second resolution)
    const meCalls: (string | undefined)[] = []
    const refreshCalls: string[] = []
    let rejected = false
    await page.route('**/api/me', async (route) => {
      meCalls.push(bearerOf(route.request().headers()))
      if (!rejected) {
        rejected = true
        await route.fulfill({ status: 401, contentType: 'application/problem+json', body: JSON.stringify({ code: 'unauthenticated' }) })
      } else {
        await route.continue()
      }
    })
    page.on('request', (r) => {
      if (r.url().includes('/auth/v1/token') && r.url().includes('grant_type=refresh_token')) refreshCalls.push(r.url())
    })

    // Act
    await page.goto('/stocks')

    // Assert
    await expect(accountMenu(page)).toContainText(user.email)
    expect(refreshCalls).toHaveLength(1)
    expect(meCalls).toHaveLength(2)
    expect(meCalls[0]).toMatch(/^Bearer /)
    expect(meCalls[1]).not.toBe(meCalls[0])
    await expect(page).toHaveURL(/\/stocks$/)
  })

  test('TC-E-011: an unrecoverable session leads to sign-in with the notice, then back', async ({ page }) => {
    const user = await makeUser('e2e-11')
    await openSignedIn(page, user, '/lists')
    await expect(page.getByRole('heading', { level: 1, name: 'Lists' })).toBeVisible()
    await page.route('**/api/**', (route) =>
      route.fulfill({ status: 401, contentType: 'application/problem+json', body: JSON.stringify({ code: 'unauthenticated' }) }),
    )
    await page.route('**/auth/v1/token?grant_type=refresh_token', (route) =>
      route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'invalid_grant', error_description: 'Invalid Refresh Token: Refresh Token Not Found' }) }),
    )

    await page.goto('/lists')

    await expect(page).toHaveURL(/\/auth\/sign-in\?next=%2Flists$/)
    await expect(page.getByRole('status')).toContainText('Your session has ended. Sign in again.')
    await page.unroute('**/api/**')
    await page.unroute('**/auth/v1/token?grant_type=refresh_token')
    await fillSignIn(page, user.email, PASSWORD)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page).toHaveURL(/\/lists$/)
  })

  test('TC-E-012: the token auto-renews across the expiry window (fake clock)', async ({ page }) => {
    const user = await makeUser('e2e-12')
    await page.clock.install({ time: new Date() })
    await openSignedIn(page, user)
    await expect(accountMenu(page)).toContainText(user.email)
    const before = await storedToken(page)

    await page.clock.fastForward(61 * 60 * 1000)
    await expect.poll(() => storedToken(page), { timeout: 15_000 }).not.toBe(before)

    expect((await meFromPage(page)).status).toBe(200)
    await expect(page).toHaveURL(/\/stocks$/)
  })

  test('TC-E-013: sign-out ends the session and the old token is never sent again', async ({ page, context }) => {
    const user = await makeUser('e2e-13')
    await openSignedIn(page, user, '/stocks')
    const token = (await storedToken(page)) ?? ''
    expect(token).not.toBe('')
    await page.getByRole('link', { name: 'Lists' }).first().click()
    await expect(page).toHaveURL(/\/lists$/)
    const after: (string | undefined)[] = []
    const requests = recordRequests(context)

    await signOutViaMenu(page)
    const mark = requests.length
    await page.goBack()

    await expect(page).toHaveURL(/\/auth\/sign-in\?next=%2Fstocks$/)
    for (const r of requests.slice(mark)) after.push(r.headers().authorization)
    expect(after.filter((h) => h?.includes(token))).toEqual([])
    expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toBeNull()
    expect(await page.evaluate(() => Object.keys(localStorage).filter((k) => /auth-token/.test(k)))).toEqual([])
  })

  test('TC-E-014: signing out in one tab signs out the other', async ({ context, page }) => {
    const user = await makeUser('e2e-14')
    await openSignedIn(page, user)
    await expect(accountMenu(page)).toContainText(user.email)
    const other = await context.newPage()
    await other.goto('/stocks')
    await expect(accountMenu(other)).toContainText(user.email)

    await signOutViaMenu(page)

    await expect(other).toHaveURL(/\/auth\/sign-in\?next=%2Fstocks$/)
    await expect(other.getByRole('status')).toContainText('Your session has ended. Sign in again.')
  })
})
