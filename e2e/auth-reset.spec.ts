import { expect, test, type Page } from '@playwright/test'
import {
  adminCreateUser,
  client,
  emailLink,
  expectNoSecretsIn,
  fillSignIn,
  historyUrls,
  mailFor,
  makeUser,
  NEW_PASSWORD,
  newEmail,
  PASSWORD,
  signOutViaMenu,
  tokenHashIn,
} from './lib/kit.ts'

async function requestReset(page: Page, email: string) {
  await page.goto('/auth/forgot-password')
  await page.getByLabel('Email').fill(email)
  await page.getByRole('button', { name: 'Send reset link' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Check your email' })).toBeVisible()
}

async function signInAs(page: Page, email: string, password: string) {
  await page.goto('/auth/sign-in')
  await fillSignIn(page, email, password)
  await page.getByRole('button', { name: 'Sign in' }).click()
}

test.describe('forgot and reset', () => {
  test('TC-E-015: forgot, reset, then sign in with the new password only', async ({ page }) => {
    // Arrange
    const user = await makeUser('e2e-15')

    // Act: request the reset
    await requestReset(page, user.email)
    await expect(page.getByRole('main')).toContainText(`If an account exists for ${user.email}, we sent a link to reset its password.`)
    const [mail] = await mailFor(user.email)
    await page.goto(emailLink(mail!))

    // Assert: reset page, no token in the URL
    await expect(page).toHaveURL(/\/auth\/reset-password$/)
    await page.getByLabel('New password', { exact: true }).fill(NEW_PASSWORD)
    await page.getByLabel('Confirm new password', { exact: true }).fill(NEW_PASSWORD)
    await page.getByRole('button', { name: 'Save password' }).click()
    await expect(page).toHaveURL(/\/stocks$/)
    await expect(page.getByText("Password updated. You're signed in.")).toBeVisible()
    expectNoSecretsIn(await historyUrls(page), [PASSWORD, NEW_PASSWORD, user.email, encodeURIComponent(user.email)])
    await page.goto('/stocks')

    // Act: new password signs in, old one does not
    await signOutViaMenu(page)
    await signInAs(page, user.email, NEW_PASSWORD)
    await expect(page).toHaveURL(/\/stocks$/)
    await signOutViaMenu(page)
    await signInAs(page, user.email, PASSWORD)
    await expect(page.getByRole('alert')).toHaveText('Email or password is incorrect.')
  })

  test('TC-E-016: forgot for an unregistered email looks the same and sends nothing', async ({ page }) => {
    const known = await makeUser('e2e-16')
    const unknown = newEmail('e2e-16-nobody')
    const texts: string[] = []

    for (const email of [unknown, known.email]) {
      await requestReset(page, email)
      texts.push((await page.getByRole('main').innerText()).replaceAll(email, '<email>'))
    }

    expect(texts[0]).toBe(texts[1])
    expect(await mailFor(known.email)).toHaveLength(1)
    expect(await mailFor(unknown, { timeoutMs: 1500 })).toHaveLength(0)
  })

  test('TC-E-018: the reset page without a recovery session shows Link expired', async ({ page }) => {
    await page.goto('/auth/reset-password')

    await expect(page).toHaveURL(/\/auth\/link-expired$/)
    await expect(page.getByRole('heading', { level: 1, name: 'This link has expired or was already used' })).toBeVisible()
  })
})

test.describe('email links', () => {
  const expired = (page: Page) => page.getByRole('heading', { level: 1, name: 'This link has expired or was already used' })

  test('TC-E-017: a used confirmation link lands on Link expired with Send a new link', async ({ page, browser }) => {
    const user = await adminCreateUser(newEmail('e2e-17c'), { confirmed: false })
    await client().auth.resend({ type: 'signup', email: user.email })
    const [mail] = await mailFor(user.email)
    const link = emailLink(mail!)

    await page.goto(link)
    await expect(page).toHaveURL(/\/stocks$/)
    const fresh = await browser.newContext({ baseURL: test.info().project.use.baseURL as string })
    const second = await fresh.newPage()
    await second.goto(link)

    await expect(second).toHaveURL(/\/auth\/link-expired/)
    await expect(expired(second)).toBeVisible()
    await expect(second.getByText('Links work once and expire after 1 hour.')).toBeVisible()
    await expect(second.getByRole('button', { name: 'Send a new link' })).toBeVisible()
    await expect(second.getByRole('button', { name: 'Reset password' })).toHaveCount(0)
    await fresh.close()
  })

  test('TC-E-017: a used recovery link lands on Link expired for a recovery link', async ({ page, browser }) => {
    const user = await makeUser('e2e-17r')
    await client().auth.resetPasswordForEmail(user.email)
    const [mail] = await mailFor(user.email)
    expect(tokenHashIn(mail!)).toBeTruthy()
    const link = emailLink(mail!)

    await page.goto(link)
    await expect(page).toHaveURL(/\/auth\/reset-password$/)
    const fresh = await browser.newContext({ baseURL: test.info().project.use.baseURL as string })
    const second = await fresh.newPage()
    await second.goto(link)

    await expect(expired(second)).toBeVisible()
    await expect(second.getByRole('button', { name: 'Send a new link' })).toBeVisible()
    await fresh.close()
  })

  test('TC-E-017: a garbage hash sends a new confirmation email on request', async ({ page }) => {
    const user = await adminCreateUser(newEmail('e2e-17g'), { confirmed: false })

    await page.goto('/auth/confirm?token_hash=garbage&type=email')
    await expect(expired(page)).toBeVisible()
    await page.getByLabel('Email').fill(user.email)
    await page.getByRole('button', { name: 'Send a new link' }).click()

    await expect(page.getByRole('heading', { level: 1, name: 'Check your email' })).toBeVisible()
    expect(await mailFor(user.email)).toHaveLength(1)
  })

  test('TC-E-017: a garbage recovery hash sends a new reset email on request', async ({ page }) => {
    const user = await makeUser('e2e-17h')

    await page.goto('/auth/confirm?token_hash=garbage&type=recovery')
    await expect(expired(page)).toBeVisible()
    await page.getByLabel('Email').fill(user.email)
    await page.getByRole('button', { name: 'Send a new link' }).click()

    await expect(page.getByRole('heading', { level: 1, name: 'Check your email' })).toBeVisible()
    expect(await mailFor(user.email)).toHaveLength(1)
  })

  test('TC-E-017: a link without token_hash lands on Link expired', async ({ page }) => {
    await page.goto('/auth/confirm?type=email')

    await expect(page).toHaveURL(/\/auth\/link-expired/)
    await expect(expired(page)).toBeVisible()
  })

  test('TC-E-017: an unknown type offers both actions', async ({ page }) => {
    await page.goto('/auth/confirm?token_hash=x&type=magiclink')

    await expect(expired(page)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Resend confirmation' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Reset password' })).toBeVisible()
  })
})
