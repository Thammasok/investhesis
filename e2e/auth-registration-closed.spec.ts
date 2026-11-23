import { expect, test } from '@playwright/test'
import {
  accountMenu,
  adminCreateUser,
  emailLink,
  expectNoSecretsIn,
  fillSignIn,
  historyUrls,
  mailFor,
  makeUser,
  meFromPage,
  newEmail,
  openSignedIn,
  PASSWORD,
  psql,
  recordRequests,
} from './lib/kit.ts'

const notFound = (page: import('@playwright/test').Page) =>
  page.getByRole('heading', { level: 1, name: 'Page not found' })

// Accounts are created by the owner (user-auth v1.2): users here come from the Admin API.
test.describe('no self sign-up in the web', () => {
  test('TC-E-301 (replaces TC-E-001): an admin-created user signs in, lands on /stocks, and the API knows them', async ({ page }) => {
    const user = await makeUser('e2e-301')
    await page.goto('/auth/sign-in')
    await fillSignIn(page, user.email, PASSWORD)
    await page.getByRole('button', { name: 'Sign in' }).click()

    await expect(page).toHaveURL(/\/stocks$/)
    await expect(accountMenu(page)).toContainText(user.email)
    const me = await meFromPage(page)
    expect(me.status).toBe(200)
    expect(me.body.email).toBe(user.email)
    expect(me.body.id).toBe(psql(`select id from auth.users where email = '${user.email}';`).out)
    expect(me.body.id).toMatch(/^[0-9a-f-]{36}$/)
  })

  test('TC-E-302: the registration URL is not-found when signed out and makes no sign-up call', async ({ page, context }) => {
    const requests = recordRequests(context)

    for (const url of ['/auth/sign-up', '/auth/sign-up?next=%2Flists']) {
      await page.goto(url)
      await expect(notFound(page)).toBeVisible()
      await expect(page.locator('input[type="password"]')).toHaveCount(0)
      await expect(page.getByRole('link', { name: 'Go to stocks' })).toBeVisible()
    }
    expect(requests.filter((r) => r.url().includes('/auth/v1/signup'))).toEqual([])
  })

  test('TC-E-303: the registration URL is not-found when signed in, and the session survives', async ({ page }) => {
    await openSignedIn(page, await makeUser('e2e-303'))

    await page.goto('/auth/sign-up')

    await expect(notFound(page)).toBeVisible()
    await expect(page).toHaveURL(/\/auth\/sign-up$/)
    await page.goto('/stocks')
    await expect(page.getByRole('heading', { level: 1, name: 'Stocks' })).toBeVisible()
  })

  test('TC-E-304: sign-in offers no registration link and its error does not hint at one', async ({ page }) => {
    const words = /create account|sign up|register/i
    for (const url of ['/auth/sign-in', '/auth/sign-in?next=%2Flists']) {
      await page.goto(url)
      await expect(page.getByRole('heading', { level: 1, name: 'Sign in to your account' })).toBeVisible()
      const hrefs = await page.locator('a').evaluateAll((anchors) => anchors.map((a) => a.getAttribute('href') ?? ''))
      expect(hrefs.filter((href) => /sign-?up/i.test(href))).toEqual([])
      expect(await page.locator('main').innerText()).not.toMatch(words)
      await expect(page.getByRole('link', { name: 'Forgot password?' })).toBeVisible()
    }

    await fillSignIn(page, newEmail('e2e-304'), 'Wrong12345')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page.getByRole('alert')).toHaveText('Email or password is incorrect.')
    expect(await page.getByRole('alert').innerText()).not.toMatch(words)
  })

  test('TC-E-312 (replaces the sign-up part of TC-E-022): nothing sensitive stays in URLs or history after confirming an admin-created account', async ({ page }) => {
    const user = await adminCreateUser(newEmail('e2e-312'), { confirmed: false })
    await page.goto('/auth/sign-in')
    await fillSignIn(page, user.email, PASSWORD)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await page.getByRole('button', { name: 'Resend' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Check your email' })).toBeVisible()
    const [mail] = await mailFor(user.email)
    await page.goto(emailLink(mail!))
    await expect(page).toHaveURL(/\/stocks$/)

    const urls = await historyUrls(page)

    expectNoSecretsIn(urls, [PASSWORD, user.email, encodeURIComponent(user.email)])
  })
})
