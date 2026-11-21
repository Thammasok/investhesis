import { expect, test } from '@playwright/test'
import {
  accountMenu,
  client,
  fillSignIn,
  makeUser,
  meFromPage,
  NEW_PASSWORD,
  openSignedIn,
  PASSWORD,
  signedIn,
  signOutViaMenu,
} from './lib/kit.ts'

test.describe('account and API identity', () => {
  test('TC-E-019: change the password on the account page', async ({ page }) => {
    // Arrange
    const user = await makeUser('e2e-19')
    await openSignedIn(page, user)
    await accountMenu(page).click()
    await page.getByRole('menuitem', { name: 'Account' }).click()
    await expect(page).toHaveURL(/\/account$/)
    const current = page.getByLabel('Current password', { exact: true })
    const next = page.getByLabel('New password', { exact: true })
    const confirm = page.getByLabel('Confirm new password', { exact: true })

    // Act 1: wrong current password
    await current.fill('wrong')
    await next.fill(NEW_PASSWORD)
    await confirm.fill(NEW_PASSWORD)
    await page.getByRole('button', { name: 'Change password' }).click()

    // Assert 1
    await expect(page.getByText('Current password is incorrect.')).toBeVisible()
    await expect(current).toHaveValue('')

    // Act 2: right current password
    await current.fill(PASSWORD)
    await next.fill(NEW_PASSWORD)
    await confirm.fill(NEW_PASSWORD)
    await page.getByRole('button', { name: 'Change password' }).click()

    // Assert 2
    await expect(page.getByText('Password changed.')).toBeVisible()
    for (const field of [current, next, confirm]) await expect(field).toHaveValue('')

    // The new password signs in, the old one does not
    await signOutViaMenu(page)
    await page.goto('/auth/sign-in')
    await fillSignIn(page, user.email, NEW_PASSWORD)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page).toHaveURL(/\/stocks$/)
    const old = await client().auth.signInWithPassword({ email: user.email, password: PASSWORD })
    expect(old.error?.code).toBe('invalid_credentials')
  })

  test('TC-E-020: two investors see only their own identity', async ({ browser }) => {
    const base = test.info().project.use.baseURL as string
    const [u1, u2] = [await makeUser('e2e-20a'), await makeUser('e2e-20b')]
    const [c1, c2] = [await browser.newContext({ baseURL: base }), await browser.newContext({ baseURL: base })]
    const [p1, p2] = [await c1.newPage(), await c2.newPage()]
    const [s1] = await Promise.all([openSignedIn(p1, u1), openSignedIn(p2, u2)])

    const [me1, me2] = [await meFromPage(p1), await meFromPage(p2)]

    expect(me1.body.email).toBe(u1.email)
    expect(me2.body.email).toBe(u2.email)
    expect(me1.body.id).not.toBe(me2.body.id)
    await expect(accountMenu(p1)).toContainText(u1.email)
    await expect(accountMenu(p2)).toContainText(u2.email)

    const forged = await p1.request.get('/api/me', { headers: { authorization: `Bearer ${s1.access_token}`, 'x-user-id': me2.body.id } })
    expect((await forged.json()).id).toBe(me1.body.id)
    await c1.close()
    await c2.close()
  })

  test('TC-E-021: the API rejects requests without a valid token through the proxy', async ({ request }) => {
    const user = await makeUser('e2e-21')
    const { session } = await signedIn(user.email)
    const [head, payload, signature] = session.access_token.split('.') as [string, string, string]
    const flipped = signature.slice(0, 10) + (signature[10] === 'A' ? 'B' : 'A') + signature.slice(11)

    const none = await request.get('/api/me')
    const tampered = await request.get('/api/me', { headers: { authorization: `Bearer ${head}.${payload}.${flipped}` } })
    const valid = await request.get('/api/me', { headers: { authorization: `Bearer ${session.access_token}` } })
    const health = await request.get('/api/health')

    expect(none.status()).toBe(401)
    expect(none.headers()['content-type']).toContain('application/problem+json')
    expect(tampered.status()).toBe(401)
    expect(valid.status()).toBe(200)
    expect((await valid.json()).email).toBe(user.email)
    expect(health.status()).toBe(200)
  })
})
