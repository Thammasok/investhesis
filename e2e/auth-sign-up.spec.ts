import { expect, test } from '@playwright/test'
import {
  adminCreateUser,
  expectNoSecretsIn,
  historyUrls,
  emailLink,
  mailFor,
  meFromPage,
  newEmail,
  PASSWORD,
  psql,
  userCount,
  accountMenu,
} from './lib/kit.ts'

async function fillSignUp(page: import('@playwright/test').Page, email: string, password = PASSWORD, confirm = password) {
  await page.goto('/auth/sign-up')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByLabel('Confirm password', { exact: true }).fill(confirm)
  await page.getByRole('button', { name: 'Create account' }).click()
}

test.describe('sign-up', () => {
  test('TC-E-001: sign up, confirm, land signed in, and the API knows me', async ({ page }) => {
    // Arrange
    const email = newEmail('e2e-1')

    // Act: sign up
    await fillSignUp(page, email)

    // Assert: check-email screen, exactly one mail
    await expect(page.getByRole('heading', { level: 1, name: 'Check your email' })).toBeVisible()
    await expect(page.getByText(email)).toBeVisible()
    const mails = await mailFor(email)
    expect(mails).toHaveLength(1)

    // Act: open the emailed link in the same page
    await page.goto(emailLink(mails[0]!))

    // Assert: signed in on /stocks, link parameters gone, toast, menu, API
    await expect(page).toHaveURL(/\/stocks$/)
    expect(page.url()).not.toContain('token_hash')
    await expect(page.getByText('Email confirmed. Welcome to Investhesis.')).toBeVisible()
    await expect(accountMenu(page)).toContainText(email)
    const me = await meFromPage(page)
    expect(me.status).toBe(200)
    expect(me.body.email).toBe(email)
    expect(me.body.id).toBe(psql(`select id from auth.users where email = '${email}';`).out)
    expect(me.body.id).toMatch(/^[0-9a-f-]{36}$/)
  })

  test('TC-E-002: a non-allowlisted sign-up is refused with nothing created', async ({ page }) => {
    const email = newEmail('stranger').replace('@example.test', '@gmail.com')

    for (let attempt = 0; attempt < 2; attempt++) {
      await fillSignUp(page, email)

      await expect(page.getByRole('alert').filter({ hasText: 'Sign-up is invite-only. Ask the owner to add this email.' })).toBeVisible()
      await expect(page).toHaveURL('/auth/sign-up')
      await expect(page.getByLabel('Email')).toBeFocused()
    }
    expect(await mailFor(email, { timeoutMs: 1500 })).toHaveLength(0)
    expect(userCount(email)).toBe(0)
  })

  test('TC-E-003: allowlist matching ignores case and excludes sub-domains', async ({ page }) => {
    const mixed = `E2E-Mixed-${Date.now()}@EXAMPLE.TEST`
    await fillSignUp(page, mixed)
    await expect(page.getByRole('heading', { level: 1, name: 'Check your email' })).toBeVisible()
    expect(await mailFor(mixed.toLowerCase())).toHaveLength(1)

    const sub = `x-${Date.now()}@sub.example.test`
    await fillSignUp(page, sub)
    await expect(page.getByRole('alert').filter({ hasText: 'invite-only' })).toBeVisible()
    expect(await mailFor(sub, { timeoutMs: 1500 })).toHaveLength(0)
  })

  test('TC-E-004: an already-registered email gets the same screen as a new one', async ({ page }) => {
    const taken = await adminCreateUser(newEmail('e2e-4'))
    const fresh = newEmail('e2e-4n')
    const seen: { heading: string; body: string }[] = []

    for (const email of [taken.email, fresh]) {
      await fillSignUp(page, email)
      const heading = page.getByRole('heading', { level: 1, name: 'Check your email' })
      await expect(heading).toBeVisible()
      await expect(page).toHaveURL('/auth/check-email')
      const main = (await page.getByRole('main').innerText()).replaceAll(email, '<email>')
      seen.push({ heading: await heading.innerText(), body: main })
      await expect(page.getByRole('alert')).toHaveCount(0)
      expect(main.toLowerCase()).not.toContain('already')
      expect(main.toLowerCase()).not.toContain('registered')
    }
    expect(seen[0]).toEqual(seen[1])
  })

  test('TC-E-022: no token, password or email stays in the URLs or history after sign-up and confirm', async ({ page }) => {
    const email = newEmail('e2e-22')
    await fillSignUp(page, email)
    await expect(page.getByRole('heading', { level: 1, name: 'Check your email' })).toBeVisible()
    const [mail] = await mailFor(email)
    await page.goto(emailLink(mail!))
    await expect(page).toHaveURL('/stocks')

    const urls = await historyUrls(page)

    expectNoSecretsIn(urls, [PASSWORD, email, encodeURIComponent(email)])
  })
})
