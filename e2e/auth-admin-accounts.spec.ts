import { expect, test, type Page } from '@playwright/test'
import {
  accountMenu,
  adminCreateUser,
  API,
  client,
  emailLink,
  expectNoSecretsIn,
  fillSignIn,
  historyUrls,
  mailFor,
  makeUser,
  messagesTo,
  NEW_PASSWORD,
  newEmail,
  openSignedIn,
  PASSWORD,
  psql,
  publishableKey,
  signInUI,
  signOutViaMenu,
  userCount,
} from './lib/kit.ts'

// Flows of an account that the admin created (user-auth v1.2): none starts from a sign-up form.

const signedInOk = (page: Page) => expect(page).toHaveURL(/\/stocks$/)

test.describe('direct sign-up call', () => {
  test('TC-E-306: a sign-up request from the browser is refused for any address and creates nothing', async ({ page }) => {
    // Arrange
    const existing = await makeUser('e2e-306')
    const fresh = newEmail('e2e-306a')
    const gmail = `e2e-306-${Date.now()}@gmail.com`
    await page.goto('/auth/sign-in')
    const key = publishableKey()
    const before = psql('select count(*) from auth.users;').out

    // Act: the public anon key is in every browser bundle, so call the endpoint as a page would
    const results = await page.evaluate(
      async ([api, apikey, emails]) =>
        Promise.all(
          (emails as string[]).map(async (email) => {
            const res = await fetch(`${api}/auth/v1/signup`, {
              method: 'POST',
              headers: { 'content-type': 'application/json', apikey: apikey as string },
              body: JSON.stringify({ email, password: 'Different123' }),
            })
            return { status: res.status, body: (await res.json()) as { error_code: string } }
          }),
        ),
      [API, key, [fresh, gmail, existing.email]] as const,
    )

    // Assert
    for (const r of results) {
      expect(r.status).toBe(422)
      expect(r.body.error_code).toBe('signup_disabled')
    }
    expect(psql('select count(*) from auth.users;').out).toBe(before)
    expect(userCount(fresh)).toBe(0)
    expect(userCount(gmail)).toBe(0)
    expect(await mailFor(fresh, { timeoutMs: 1500 })).toHaveLength(0)
    expect(await mailFor(gmail, { timeoutMs: 500 })).toHaveLength(0)
    expect(await messagesTo(existing.email)).toHaveLength(0)
    const old = await client().auth.signInWithPassword({ email: existing.email, password: PASSWORD })
    expect(old.error).toBeNull()
  })
})

test.describe('admin-created accounts keep the v1.0 flows', () => {
  test('TC-E-307: forgot and reset password for an admin-created user', async ({ page }) => {
    // Arrange
    const user = await makeUser('e2e-307')
    const texts: string[] = []

    // Act 1: the sent screen is the same for the known and an unknown address
    for (const email of [newEmail('e2e-307-ghost'), user.email]) {
      await page.goto('/auth/forgot-password')
      await page.getByLabel('Email').fill(email)
      await page.getByRole('button', { name: 'Send reset link' }).click()
      await expect(page.getByRole('heading', { level: 1, name: 'Check your email' })).toBeVisible()
      texts.push((await page.getByRole('main').innerText()).replaceAll(email, '<email>'))
    }
    expect(texts[0]).toBe(texts[1])

    // Act 2: open the mail link, set a new password
    const [mail] = await mailFor(user.email)
    await page.goto(emailLink(mail!))
    await expect(page).toHaveURL(/\/auth\/reset-password$/)
    await page.getByLabel('New password', { exact: true }).fill('correct-horse-2')
    await page.getByLabel('Confirm new password', { exact: true }).fill('correct-horse-2')
    await page.getByRole('button', { name: 'Save password' }).click()

    // Assert
    await signedInOk(page)
    expectNoSecretsIn(await historyUrls(page), [PASSWORD, 'correct-horse-2', user.email, encodeURIComponent(user.email)])
    await page.goto('/stocks')
    await signOutViaMenu(page)
    await signInUI(page, user.email, PASSWORD)
    await expect(page.getByRole('alert')).toHaveText('Email or password is incorrect.')
    await fillSignIn(page, user.email, 'correct-horse-2')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await signedInOk(page)
  })

  test('TC-E-308: temporary password hand-over, change it on the account page', async ({ page }) => {
    // Arrange
    const user = await adminCreateUser(newEmail('e2e-308'), { password: 'Temp-pass-1' })

    // Act 1: sign in with the temporary password and change it
    await signInUI(page, user.email, 'Temp-pass-1')
    await signedInOk(page)
    await accountMenu(page).click()
    await page.getByRole('menuitem', { name: 'Account' }).click()
    await expect(page).toHaveURL(/\/account$/)
    await page.getByLabel('Current password', { exact: true }).fill('Temp-pass-1')
    await page.getByLabel('New password', { exact: true }).fill('correct-horse-3')
    await page.getByLabel('Confirm new password', { exact: true }).fill('correct-horse-3')
    await page.getByRole('button', { name: 'Change password' }).click()
    await expect(page.getByText('Password changed.')).toBeVisible()

    // Act 2: sign out, sign in with the new one, then try the temporary one
    await signOutViaMenu(page)
    await signInUI(page, user.email, 'correct-horse-3')
    await signedInOk(page)
    await signOutViaMenu(page)
    await signInUI(page, user.email, 'Temp-pass-1')

    // Assert
    await expect(page.getByRole('alert')).toHaveText('Email or password is incorrect.')
  })

  test('TC-E-309: an unconfirmed admin-created user resends and confirms', async ({ page }) => {
    // Arrange
    const user = await adminCreateUser(newEmail('e2e-309'), { confirmed: false })
    const sendsToEmail = (url: string) => url.includes('/auth/v1/signup') || url.includes('/auth/v1/resend')

    // Act 1: right password, unconfirmed
    await signInUI(page, user.email)
    await expect(page.getByRole('alert')).toContainText(`Confirm your email first. We sent a link to ${user.email}.`)
    const resend = page.getByRole('button', { name: 'Resend' })
    await expect(resend).toBeVisible()
    const resendCall = page.waitForRequest((r) => sendsToEmail(r.url()))
    await resend.click()

    // Assert 1: check-email with the address in state only, exactly one mail
    await expect(page.getByRole('heading', { level: 1, name: 'Check your email' })).toBeVisible()
    expect((await resendCall).url()).toContain('/auth/v1/resend')
    expect(page.url()).not.toContain(encodeURIComponent(user.email))
    expect(page.url()).not.toContain(user.email)
    const mails = await mailFor(user.email)
    expect(mails).toHaveLength(1)

    // Act 2 and Assert 2: the link signs in and shows the toast
    await page.goto(emailLink(mails[0]!))
    await signedInOk(page)
    await expect(page.getByText('Email confirmed. Welcome to Investhesis.')).toBeVisible()
    expect(psql(`select email_confirmed_at is not null from auth.users where email = '${user.email}';`).out).toBe('t')
  })

  test('TC-E-310: guest-only redirects and the protected-route return, without sign-up', async ({ page }) => {
    // Arrange
    const user = await makeUser('e2e-310')
    await openSignedIn(page, user)

    // Assert 1: guest pages bounce a signed-in user
    for (const guest of ['/auth/sign-in', '/auth/forgot-password']) {
      await page.goto(guest)
      await signedInOk(page)
    }

    // Act 2: sign out, then open a protected page and a guest page
    await signOutViaMenu(page)
    await page.goto('/lists')
    await expect(page).toHaveURL(/\/auth\/sign-in\?next=%2Flists$/)
    await fillSignIn(page, user.email, PASSWORD)
    await page.getByRole('button', { name: 'Sign in' }).click()

    // Assert 2
    await expect(page).toHaveURL(/\/lists$/)
    await signOutViaMenu(page)
    await page.goto('/auth/forgot-password')
    await expect(page.getByRole('heading', { level: 1, name: 'Reset your password' })).toBeVisible()
  })

  test('TC-E-311: the session survives a reload and sign-out ends it in every tab', async ({ page, context, request }) => {
    // Arrange
    const user = await makeUser('e2e-311')
    await signInUI(page, user.email)
    await signedInOk(page)

    // Act 1: reload
    await page.reload()
    await signedInOk(page)
    await expect(accountMenu(page)).toContainText(user.email)

    // Act 2: a second tab, then sign out in the first
    const other = await context.newPage()
    await other.goto('/stocks')
    await expect(accountMenu(other)).toContainText(user.email)
    await signOutViaMenu(page)

    // Assert
    await expect(other).toHaveURL(/\/auth\/sign-in/)
    const me = await request.get('/api/me')
    expect(me.status()).toBe(401)
  })
})
