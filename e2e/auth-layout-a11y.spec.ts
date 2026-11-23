import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { makeUser, openSignedIn } from './lib/kit.ts'
import { SCREENS, signedInScreens, signedOutScreens, type Screen } from './lib/screens.ts'

const noHorizontalScroll = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)

async function checkLayout(page: Page, screen: Screen, width: number, height: number, scheme: 'light' | 'dark') {
  const where = `${screen.name} @ ${width}x${height} ${scheme}`
  await screen.visit(page)
  await page.evaluate((dark) => document.documentElement.classList.toggle('dark', dark), scheme === 'dark')
  expect(await noHorizontalScroll(page), `${where}: no sideways scroll`).toBe(true)
  const panel = page.locator('div[aria-hidden="true"].bg-muted')
  await expect(panel, `${where}: decorative panel hidden`).toBeHidden()

  // The auth pages share AuthLayout's `main > div` (max-w-xs); /account uses the app shell instead.
  const box = screen.name === 'account' ? null : await page.locator('main > div').boundingBox()
  if (screen.name !== 'account') expect(box, where).not.toBeNull()
  if (box) {
    expect(box.x, `${where}: left padding`).toBeGreaterThanOrEqual(16 - 0.5)
    expect(box.x + box.width, `${where}: right padding`).toBeLessThanOrEqual(width - 16 + 0.5)
  }

  if (screen.submit) {
    const button = page.getByRole('button', { name: screen.submit, exact: true })
    await button.scrollIntoViewIfNeeded()
    const b = await button.boundingBox()
    expect(b, `${where}: ${screen.submit} box`).not.toBeNull()
    if (b) {
      expect(b.x, `${where}: button left`).toBeGreaterThanOrEqual(0)
      expect(b.x + b.width, `${where}: button right`).toBeLessThanOrEqual(width + 0.5)
      expect(b.y + b.height, `${where}: button reachable`).toBeLessThanOrEqual(height + 0.5)
    }
  }
  // Nothing is clipped sideways inside the main content.
  const clipped = await page.evaluate(() =>
    [...document.querySelectorAll('main *')]
      .filter((el) => {
        const css = getComputedStyle(el)
        return css.overflowX !== 'visible' && el.scrollWidth > el.clientWidth + 1 && css.textOverflow === 'ellipsis'
      })
      .map((el) => el.tagName),
  )
  expect(clipped, `${where}: truncated text`).toEqual([])
}

test.describe('360 px layout', () => {
  for (const [width, height] of [
    [360, 640],
    [320, 568],
    [360, 360],
  ] as const) {
    for (const scheme of ['light', 'dark'] as const) {
      test(`TC-E-026 / TC-E-313: every auth screen fits at ${width}x${height} in ${scheme} mode`, async ({ page }) => {
        await page.setViewportSize({ width, height })
        await page.emulateMedia({ colorScheme: scheme })
        for (const screen of signedOutScreens) await checkLayout(page, screen, width, height, scheme)
        await openSignedIn(page, await makeUser('e2e-26'))
        for (const screen of signedInScreens) await checkLayout(page, screen, width, height, scheme)
      })
    }
  }

  test('TC-E-026: the Account card is full width and its submit fills it at 360 px', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 640 })
    await openSignedIn(page, await makeUser('e2e-26a'), '/account')
    const card = page.getByRole('region', { name: 'Change password' }).or(page.locator('form').filter({ hasText: 'Change password' })).first()
    const cardBox = await card.boundingBox()
    const button = await page.getByRole('button', { name: 'Change password' }).boundingBox()

    expect(cardBox?.width).toBeGreaterThanOrEqual(360 - 64)
    expect(button?.width).toBeGreaterThanOrEqual((cardBox?.width ?? 0) * 0.8)
    expect(await noHorizontalScroll(page)).toBe(true)
  })

  test('TC-E-026: at 1280x800 the decorative panel is visible', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/auth/sign-in')

    await expect(page.locator('div[aria-hidden="true"].bg-muted')).toBeVisible()
  })

  test('TC-E-026: focusing the last field at 360x360 keeps the submit reachable', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 360 })
    await page.goto('/auth/sign-in')
    await page.getByLabel('Password', { exact: true }).focus()

    const button = page.getByRole('button', { name: 'Sign in' })
    await button.scrollIntoViewIfNeeded()
    const box = await button.boundingBox()

    expect(box && box.y + box.height <= 360.5 && box.y >= 0).toBe(true)
    expect(await noHorizontalScroll(page)).toBe(true)
  })
})

test.describe('accessibility (axe)', () => {
  for (const scheme of ['light', 'dark'] as const) {
    test(`TC-E-027 / TC-E-313: no axe violations on any auth screen in ${scheme} mode`, async ({ page }) => {
      // The app has no theme switch yet: dark tokens apply through the `.dark` class, so set it as
      // well as the media preference.
      await page.emulateMedia({ colorScheme: scheme })

      const findings: string[] = []
      const scan = async (screen: Screen) => {
        await screen.visit(page)
        await page.evaluate((dark) => document.documentElement.classList.toggle('dark', dark), scheme === 'dark')
        await page.waitForTimeout(300) // let transitions settle before measuring colours
        expect(await page.evaluate(() => document.documentElement.classList.contains('dark'))).toBe(scheme === 'dark')
        const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()
        for (const v of result.violations) findings.push(`${screen.name}: ${v.id} (${v.nodes.length}): ${v.nodes[0]?.target.join(' ')} ${JSON.stringify(v.nodes[0]?.any[0]?.data ?? {})}`)
      }
      for (const screen of signedOutScreens) await scan(screen)
      await openSignedIn(page, await makeUser('e2e-27'))
      for (const screen of signedInScreens) await scan(screen)

      expect(findings).toEqual([])
      // Ten screens since sign-up was removed (v1.2); none of them is a registration screen.
      expect(SCREENS.map((screen) => screen.name)).toHaveLength(10)
      expect(SCREENS.some((screen) => /sign-?up/i.test(screen.name))).toBe(false)
    })
  }
})
