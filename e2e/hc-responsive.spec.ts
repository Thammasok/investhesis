import { expect, test, type Page } from '@playwright/test'
import { groupRow } from './lib/hc.ts'
import { enterHc, HC_STATES, seedForHoldings, type HcCtx } from './lib/states.ts'
import { noHorizontalScroll, openSignedIn, settled, th } from './lib/sl.ts'

const PHONE = { width: 360, height: 740 }

/** Elements whose right edge passes the viewport, outside a table's own scroll container (the one allowed horizontal scroll). */
const overflowing = (page: Page) =>
  page.evaluate(() => {
    const limit = window.innerWidth
    return [...document.querySelectorAll('body *')]
      .filter((el) => {
        if (el.closest('[data-slot="table-container"], [data-sonner-toaster], [aria-hidden="true"]')) return false
        const box = el.getBoundingClientRect()
        const style = getComputedStyle(el)
        return box.width > 0 && box.height > 0 && style.position !== 'fixed' && box.right > limit + 1
      })
      .map((el) => `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 60)} right=${Math.round(el.getBoundingClientRect().right)}`)
  })

test.describe('360 px layout of holdings and concentration', () => {
  test.use({ viewport: PHONE, hasTouch: true })
  let ctx: HcCtx
  test.beforeAll(async () => {
    ctx = await seedForHoldings()
  })

  test('TC-E-417: no page-level horizontal scroll and nothing past the viewport in any state', async ({ page }) => {
    test.setTimeout(300_000)
    const wide: string[] = []
    for (const state of HC_STATES) {
      await enterHc(page, state, ctx)
      if (!(await noHorizontalScroll(page))) wide.push(`${state.name}: page scrolls`)
      const past = await overflowing(page)
      if (past.length > 0) wide.push(`${state.name}: ${past.slice(0, 3).join(' | ')}`)
    }

    expect(wide).toEqual([])
  })

  test('TC-E-417: the concentration layout rules: stacked full-width controls, folded columns, badge under the share', async ({ page }) => {
    // Arrange
    await openSignedIn(page, ctx.user, '/concentration?scope=held')
    await settled(page)

    // Assert: Scope, Group by and Settings fill the width
    for (const box of await Promise.all([page.getByRole('combobox', { name: 'Scope' }), page.getByRole('combobox', { name: 'Group by' }), page.getByRole('button', { name: 'Settings' })].map((l) => l.boundingBox()))) {
      expect(box?.width ?? 0).toBeGreaterThan(PHONE.width - 48)
    }
    const scope = await page.getByRole('combobox', { name: 'Scope' }).boundingBox()
    const lens = await page.getByRole('combobox', { name: 'Group by' }).boundingBox()
    expect((lens?.y ?? 0) > (scope?.y ?? 0) + (scope?.height ?? 0) - 1).toBe(true)

    // Assert: the Stocks column is folded into the Group cell, the flag badge sits under the share
    await expect(page.getByRole('columnheader', { name: 'Stocks' })).toBeHidden()
    await expect(groupRow(page, 'Information Technology')).toContainText('3 stocks')

    // Act + Assert: the value view folds the value and the count into the Group cell, and the flag sits under the share
    await page.goto('/concentration?scope=held&measure=value')
    await settled(page)
    await expect(page.getByRole('columnheader', { name: 'Value (THB)' })).toBeHidden()
    const energy = groupRow(page, 'Energy')
    await expect(energy).toContainText('฿20,500.00 · 1 stock')
    await expect(energy.locator('[data-slot="badge"]')).toBeVisible()
    const share = await energy.getByText(/^\d+\.\d%$/).boundingBox()
    const badge = await energy.locator('[data-slot="badge"]').boundingBox()
    expect((badge?.y ?? 0) >= (share?.y ?? 0) + (share?.height ?? 0) - 1).toBe(true)
  })

  test('TC-E-417: the dialogs fit within 360 px and their buttons are reachable', async ({ page }) => {
    // Arrange
    await openSignedIn(page, ctx.user, `/stocks/${ctx.stocks.NVDA.id}`)
    await settled(page)

    // Act + Assert: holding dialog, with an error
    await page.getByRole('button', { name: 'Edit' }).click()
    const holding = page.getByRole('dialog', { name: /Holding · NVDA/ })
    await holding.getByLabel('Shares (optional)').fill('0')
    await holding.getByRole('button', { name: 'Save' }).click()
    await expect(holding.locator('[aria-invalid="true"]').first()).toBeVisible()
    for (const name of ['Stop holding', 'Cancel', 'Save']) {
      const button = holding.getByRole('button', { name })
      await button.scrollIntoViewIfNeeded()
      const box = await button.boundingBox()
      expect(box && box.x >= 0 && box.x + box.width <= PHONE.width, `${name} inside the viewport`).toBe(true)
    }
    const box = await holding.boundingBox()
    expect((box?.x ?? -1) >= 0 && (box?.x ?? 0) + (box?.width ?? 999) <= PHONE.width).toBe(true)
    await page.keyboard.press('Escape')

    // Act + Assert: settings dialog, with errors
    await page.goto('/concentration')
    await settled(page)
    await page.getByRole('button', { name: 'Settings' }).click()
    const settings = page.getByRole('dialog', { name: 'Concentration settings' })
    await settings.getByLabel('Warning threshold').fill('0')
    await settings.getByRole('button', { name: 'Save' }).click()
    await expect(settings.locator('[aria-invalid="true"]').first()).toBeVisible()
    const sbox = await settings.boundingBox()
    expect((sbox?.x ?? -1) >= 0 && (sbox?.x ?? 0) + (sbox?.width ?? 999) <= PHONE.width).toBe(true)
    for (const name of ['Cancel', 'Save']) {
      const b = await settings.getByRole('button', { name }).boundingBox()
      expect(b && b.x >= 0 && b.x + b.width <= PHONE.width, `${name} inside the viewport`).toBe(true)
    }
  })

  test('TC-E-417: the largest holding wraps and nothing is clipped', async ({ page }) => {
    // Arrange
    const big = await ctx.api.stock(th('BIGHOLD', { holding: { shares: '99999999999999.9999', averageCost: '99999999999999.9999', costCurrency: 'THB' } }))

    // Act
    await openSignedIn(page, ctx.user, `/stocks/${big.id}`)
    await settled(page)

    // Assert
    const cost = page.getByText('฿9,999,999,999,999,999,980,000,000,000.00')
    await expect(cost).toBeVisible()
    expect(await overflowing(page)).toEqual([])
    expect(await noHorizontalScroll(page)).toBe(true)
    const box = await cost.boundingBox()
    expect((box?.x ?? 0) + (box?.width ?? 999)).toBeLessThanOrEqual(PHONE.width)
    expect(await cost.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true)
  })
})
