import { expect, test, type Page } from '@playwright/test'
import {
  accountMenu,
  adminCreateUser,
  emailLink,
  expectNoSecretsIn,
  fillSignIn,
  historyUrls,
  mailFor,
  makeUser,
  messagesTo,
  newEmail,
  openSignedIn,
  PASSWORD,
  recordRequests,
  signInUI,
  signOutViaMenu,
  trackNavigations,
} from './lib/kit.ts'

const submit = (page: Page) => page.getByRole('button', { name: 'Sign in' }).click()

test.describe('sign-in', () => {
  test('TC-E-005: an unconfirmed sign-in offers Resend and works after confirming', async ({ page }) => {
    // Arrange: created without any email, so Resend is not rate limited
    const user = await adminCreateUser(newEmail('e2e-5'), { confirmed: false })

    // Act: sign in with the right password
    await signInUI(page, user.email)

    // Assert: the alert, then Resend leads to Check your email
    await expect(page.getByRole('alert')).toContainText(`Confirm your email first. We sent a link to ${user.email}.`)
    await page.getByRole('button', { name: 'Resend' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Check your email' })).toBeVisible()
    const mails = await mailFor(user.email)
    expect(mails).toHaveLength(1)

    // Act: open the new link
    await page.goto(emailLink(mails[0]!))

    // Assert: signed in on /stocks, nothing sensitive left in history
    await expect(page).toHaveURL(/\/stocks$/)
    await expect(accountMenu(page)).toContainText(user.email)
    expectNoSecretsIn(await historyUrls(page), [PASSWORD, user.email, encodeURIComponent(user.email)])
  })

  test('TC-E-006: wrong password and unknown email look the same', async ({ page }) => {
    const user = await makeUser('e2e-6')

    for (const email of [user.email, newEmail('e2e-6-unknown')]) {
      await signInUI(page, email, 'Wrong12345')

      await expect(page.getByRole('alert')).toHaveText('Email or password is incorrect.')
      const password = page.getByLabel('Password', { exact: true })
      await expect(password).toHaveValue('')
      await expect(password).toBeFocused()
      expect(new URL(page.url()).pathname + new URL(page.url()).search).toBe('/auth/sign-in')
    }
  })

  test('TC-E-007: a deep link returns after sign-in and a hostile next never leaves the site', async ({ page, context }) => {
    // Arrange
    const user = await makeUser('e2e-7')
    const requests = recordRequests(context)
    const navigations = trackNavigations(page)

    // Act 1: deep link while signed out
    await page.goto('/lists')
    await expect(page).toHaveURL(/\/auth\/sign-in\?next=%2Flists$/)
    await fillSignIn(page, user.email, PASSWORD)
    await submit(page)

    // Assert 1
    await expect(page).toHaveURL(/\/lists$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Lists' })).toBeVisible()

    // Act 2: hostile next values
    for (const hostile of ['//evil.example', 'https://evil.example/']) {
      await signOutViaMenu(page)
      await page.goto(`/auth/sign-in?next=${encodeURIComponent(hostile)}`)
      await fillSignIn(page, user.email, PASSWORD)
      await submit(page)

      // Assert 2
      await expect(page).toHaveURL(/\/stocks$/)
    }
    expect(navigations.filter((u) => new URL(u).hostname !== 'localhost')).toEqual([])
    expect(requests.filter((r) => new URL(r.url()).hostname.includes('evil.example'))).toEqual([])
  })

  test('TC-E-008: a signed-in user is kept off the guest pages', async ({ page }) => {
    const user = await makeUser('e2e-8')
    await openSignedIn(page, user)

    for (const guest of ['/auth/sign-in', '/auth/sign-up', '/auth/forgot-password']) {
      await page.goto(guest)
      await expect(page).toHaveURL(/\/stocks$/)
    }
  })

  test('TC-E-024: keyboard-only sign-in, focus order, rings, menu and sign-out', async ({ page }) => {
    const user = await makeUser('e2e-24')
    await page.goto('/auth/sign-in')
    await expect(page.getByRole('heading', { level: 1, name: 'Sign in to your account' })).toBeFocused()

    const ringVisible = () =>
      page.evaluate(() => {
        const el = document.activeElement as HTMLElement
        const css = getComputedStyle(el)
        return (css.boxShadow !== 'none' && css.boxShadow !== '') || (css.outlineStyle !== 'none' && parseFloat(css.outlineWidth) > 0)
      })

    // Focus order: Email -> Forgot password? -> Password -> toggle -> Sign in -> Sign up
    const order: [string, (p: Page) => ReturnType<Page['locator']>][] = [
      ['Email', (p) => p.getByLabel('Email')],
      ['Forgot password?', (p) => p.getByRole('link', { name: 'Forgot password?' })],
      ['Password', (p) => p.getByLabel('Password', { exact: true })],
      ['Show password', (p) => p.getByRole('button', { name: 'Show password' })],
      ['Sign in', (p) => p.getByRole('button', { name: 'Sign in' })],
      ['Sign up', (p) => p.getByRole('link', { name: 'Sign up' })],
    ]
    for (const [name, locate] of order) {
      await page.keyboard.press('Tab')
      await expect(locate(page), name).toBeFocused()
      expect(await ringVisible(), `${name} shows a focus ring`).toBe(true)
      if (name === 'Email') await page.keyboard.type(user.email)
      if (name === 'Password') await page.keyboard.type(PASSWORD)
      if (name === 'Sign in') break
    }

    // Enter on the focused Sign in button submits; focus lands on the new page's h1
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/\/stocks$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Stocks' })).toBeFocused()

    // Tab to the account menu trigger, open it, Esc returns focus, reopen, ArrowDown to Sign out
    const trigger = accountMenu(page)
    for (let i = 0; i < 40 && !(await trigger.evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press('Tab')
    await expect(trigger).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('menu')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('menu')).toBeHidden()
    await expect(trigger).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('menu')).toBeVisible()
    for (let i = 0; i < 4 && !(await page.getByRole('menuitem', { name: 'Sign out' }).evaluate((el) => el === document.activeElement)); i++) {
      await page.keyboard.press('ArrowDown')
    }
    await expect(page.getByRole('menuitem', { name: 'Sign out' })).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/\/auth\/sign-in/)
  })

  test('TC-E-024: pressing Enter inside the Password field also submits', async ({ page }) => {
    const user = await makeUser('e2e-24b')
    await page.goto('/auth/sign-in')
    await expect(page.getByRole('heading', { level: 1, name: 'Sign in to your account' })).toBeFocused()
    await page.keyboard.press('Tab')
    await page.keyboard.type(user.email)
    await page.keyboard.press('Tab')
    await page.keyboard.press('Tab')
    await page.keyboard.type(PASSWORD)

    await page.keyboard.press('Enter')

    await expect(page).toHaveURL(/\/stocks$/)
  })

  test('TC-E-025: keyboard-only sign-up, error focus and visibility toggle', async ({ page }) => {
    await page.goto('/auth/sign-up')
    await expect(page.getByRole('heading', { level: 1, name: 'Create your account' })).toBeFocused()
    await page.keyboard.press('Tab')
    await page.keyboard.type(newEmail('e2e-25'))
    await page.keyboard.press('Tab')
    await expect(page.getByLabel('Password', { exact: true })).toBeFocused()
    await page.keyboard.type(PASSWORD)
    await page.keyboard.press('Tab') // show/hide toggle of Password
    await page.keyboard.press('Tab')
    await expect(page.getByLabel('Confirm password', { exact: true })).toBeFocused()
    await page.keyboard.type('Different1')

    await page.keyboard.press('Enter')

    const confirm = page.getByLabel('Confirm password', { exact: true })
    await expect(confirm).toBeFocused()
    await expect(confirm).toHaveAttribute('aria-invalid', 'true')
    const describedBy = (await confirm.getAttribute('aria-describedby')) ?? ''
    await expect(page.locator(`#${describedBy.split(' ')[0]}`)).toHaveAttribute('role', 'alert')

    // Fix it, then toggle visibility with Space: focus stays on the toggle and nothing is submitted
    await page.keyboard.press('Control+A')
    await page.keyboard.type(PASSWORD)
    await page.keyboard.press('Tab')
    const toggle = page.getByRole('button', { name: 'Show password' }).last()
    await expect(toggle).toBeFocused()
    await page.keyboard.press('Space')
    await expect(page.getByRole('button', { name: 'Hide password' }).last()).toBeFocused()
    await expect(page).toHaveURL(/\/auth\/sign-up$/)
    await expect(confirm).toHaveAttribute('type', 'text')
    expect(await messagesTo('nobody@example.test')).toHaveLength(0)
  })
})
