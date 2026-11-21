import { expect, test } from '@playwright/test'

const MOCK_WEB = `http://localhost:${process.env.E2E_MOCK_WEB_PORT ?? '5273'}`

test.describe('mock mode', () => {
  test.use({ baseURL: MOCK_WEB })

  test('TC-E-028: /stocks loads, sign-in redirects, and /api/me answers without a token', async ({ page, request }) => {
    await page.goto('/stocks')
    await expect(page).toHaveURL(/\/stocks$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Stocks' })).toBeVisible()

    await page.goto('/auth/sign-in')
    await expect(page).toHaveURL(/\/stocks$/)

    const me = await request.get('/api/me')
    expect(me.status()).toBe(200)
    expect(await me.json()).toMatchObject({ email: 'mock@example.test' })
  })
})
