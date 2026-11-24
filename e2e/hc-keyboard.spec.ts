import { expect, test, type Page } from '@playwright/test'
import { focusRingContrast } from './lib/contrast.ts'
import { applyScheme, holdingCard, pointerUsed, SCHEMES, seedHoldingsDataset, trackPointer } from './lib/hc.ts'
import { arrow, openSignedIn, saveStock, settled, toast } from './lib/sl.ts'

const focused = (page: Page) => page.locator(':focus')
/** The accessible label of the focused element (aria-label, then text). */
const focusLabel = (page: Page) =>
  page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null
    const labelled = (el as HTMLButtonElement | null)?.labels?.[0]?.textContent
    return el ? (el.getAttribute('aria-label') ?? labelled ?? el.textContent ?? el.tagName).trim().slice(0, 40) : ''
  })

/** Every focused element must show a ring or outline, at least 3:1 (WCAG 1.4.11). */
async function expectVisibleFocus(page: Page, where: string, ratios: number[]) {
  // The ring fades in with a transition: measure once two samples twenty frames apart agree.
  const frames = () => page.evaluate(() => new Promise<void>((resolve) => { let n = 0; const tick = () => (++n >= 20 ? resolve() : requestAnimationFrame(tick)); tick() }))
  let result = await focusRingContrast(focused(page))
  for (let i = 0; i < 6; i++) {
    await frames()
    const again = await focusRingContrast(focused(page))
    const same = again?.ratio === result?.ratio
    result = again
    if (same) break
  }
  expect(result, `${where}: ${await focusLabel(page)} has no focus indicator`).not.toBeNull()
  ratios.push(result?.ratio ?? 0)
}

test.describe('keyboard-only journeys', () => {
  test.use({ actionTimeout: 15_000 })
  test('TC-E-418: (a) add a stock with a holding, (b) the dialog, (c) the concentration page, (d) settings, (e) reverse', async ({ page }) => {
    test.setTimeout(180_000)
    // Arrange: HC-A, and no pointer of any kind from here on
    await trackPointer(page)
    const { user, api, stocks } = await seedHoldingsDataset()
    const ratios: number[] = []
    await openSignedIn(page, user, '/stocks/new')
    await settled(page)

    // (a) Add stock with a holding from the form
    await page.getByRole('radio', { name: 'US', exact: true }).focus()
    await page.keyboard.press('Space')
    await page.locator('#stock-ticker').focus()
    await page.keyboard.type('kbd')
    await page.locator('#stock-exchange').focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('option', { name: 'NASDAQ', exact: true })).toBeVisible()
    for (let i = 0; i < 6 && !/^NASDAQ/.test((await page.locator('[role="option"]:focus').textContent().catch(() => '')) ?? ''); i++) await page.keyboard.press('ArrowDown')
    await expect(page.locator('[role="option"]:focus')).toHaveText(/^NASDAQ/)
    await page.keyboard.press('Enter')
    await expect(page.getByRole('listbox')).toHaveCount(0)
    await expect(page.locator('#stock-exchange')).toHaveText('NASDAQ')
    // Radix returns focus to the trigger on a later tick; typing before that would go to the select.
    await expect(page.locator('#stock-exchange')).toBeFocused()
    await page.locator('#stock-name').focus()
    await page.keyboard.type('Keyboard Inc')
    await page.getByRole('checkbox', { name: 'I hold this stock' }).focus()
    await expectVisibleFocus(page, 'Held checkbox', ratios)
    await page.keyboard.press('Space')
    await page.keyboard.press('Tab')
    await expect(page.locator('#stock-holdingShares')).toBeFocused()
    await page.keyboard.type('12.5')
    await page.keyboard.press('Tab')
    await page.keyboard.type('80')
    await saveStock(page).focus()
    await page.keyboard.press('Enter')
    await expect(toast(page, 'KBD added')).toBeVisible()
    expect((await api.stocks()).find((s) => s.ticker === 'KBD')?.holding).toEqual({ shares: '12.5000', averageCost: '80.0000', costCurrency: 'USD' })

    // (b) The stock page dialog: opens from the keyboard, traps focus, Esc returns focus to the opener
    await page.goto(`/stocks/${stocks.JNJ.id}`)
    await settled(page)
    const mark = holdingCard(page).getByRole('button', { name: 'Mark as held' })
    await mark.focus()
    await expectVisibleFocus(page, 'Mark as held', ratios)
    await page.keyboard.press('Enter')
    const dialog = page.getByRole('dialog', { name: /Holding · JNJ/ })
    await expect(dialog).toBeVisible()
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press('Tab')
      expect(await dialog.evaluate((d) => d.contains(document.activeElement)), `Tab ${i + 1} stays in the dialog`).toBe(true)
    }
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(mark).toBeFocused()

    // (c) The concentration page: tab order, then operate every control
    await page.goto('/concentration')
    await settled(page)
    await page.getByRole('heading', { level: 1, name: 'Concentration' }).evaluate((h) => (h as HTMLElement).focus())
    const order: string[] = []
    for (let i = 0; i < 14; i++) {
      await page.keyboard.press('Tab')
      order.push(await focusLabel(page))
      if (i < 4) await expectVisibleFocus(page, `tab ${i + 1}`, ratios)
    }
    const at = (needle: string | RegExp) => order.findIndex((l) => (typeof needle === 'string' ? l.includes(needle) : needle.test(l)))
    expect(at('Settings'), order.join(' > ')).toBeGreaterThanOrEqual(0)
    expect(at('Settings'), order.join(' > ')).toBeLessThan(at('Scope'))
    expect(at('Scope'), order.join(' > ')).toBeLessThan(at('Group by'))
    expect(at('Group by'), order.join(' > ')).toBeLessThan(at('Count'))
    expect(at('Count'), order.join(' > ')).toBeLessThan(at('Show stocks in'))

    const scope = page.getByRole('combobox', { name: 'Scope' })
    await scope.focus()
    await page.keyboard.press('Enter')
    await expect(page.locator('[role="option"]:focus')).toBeVisible()
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Enter')
    await expect(scope).toHaveText(/^Held stocks/)
    await expect(scope).toBeFocused()
    const lens = page.getByRole('combobox', { name: 'Group by' })
    await lens.focus()
    await page.keyboard.type('Mo')
    await expect(lens).toHaveText('Moat')
    await expect(lens).toBeFocused()
    await page.getByRole('radio', { name: 'Count' }).focus()
    await arrow(page, 'ArrowRight')
    await expect(page.getByRole('radio', { name: 'Value at cost' })).toBeChecked()
    await expect(page.getByRole('radio', { name: 'Value at cost' })).toBeFocused()
    await lens.focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('option', { name: 'Sector (GICS)' })).toBeVisible()
    await expect(page.locator('[role="option"]:focus')).toBeVisible()
    await page.keyboard.press('Home')
    await expect(page.locator('[role="option"]:focus')).toHaveText('Sector (GICS)')
    await page.keyboard.press('Enter')
    await expect(lens).toHaveText('Sector (GICS)')
    await expect(lens).toBeFocused()
    const expand = page.getByRole('button', { name: 'Show stocks in Information Technology' })
    await expand.focus()
    await page.keyboard.press('Space')
    await expect(expand).toHaveAttribute('aria-expanded', 'true')
    const before = page.url()
    await page.getByRole('table').getByRole('link', { name: 'NVDA', exact: true }).focus()
    await expectVisibleFocus(page, 'ticker link', ratios)
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(`/stocks/${stocks.NVDA.id}`)
    await page.goBack()
    await expect(page).toHaveURL(before)

    // (d) Settings dialog: set a rate and Save with the keyboard; focus returns to the opener; Esc on a second opening
    const settings = page.getByRole('button', { name: 'Settings' })
    await settings.focus()
    await page.keyboard.press('Enter')
    const settingsDialog = page.getByRole('dialog', { name: 'Concentration settings' })
    await expect(settingsDialog.getByLabel('Warning threshold')).toBeFocused()
    await page.keyboard.press('Tab')
    await page.keyboard.type('36.25')
    await page.keyboard.press('Enter')
    await expect(toast(page, 'Settings saved')).toBeVisible()
    await expect(settingsDialog).toHaveCount(0)
    await expect(settings).toBeFocused()
    expect((await api.settings()).usdThbRate).toBe('36.250000')
    await page.keyboard.press('Enter')
    await expect(settingsDialog).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(settingsDialog).toHaveCount(0)
    await expect(settings).toBeFocused()

    // (e) Shift+Tab backwards through the page: focus keeps moving and never gets stuck
    const seen = new Set<string>()
    for (let i = 0; i < 15; i++) {
      await page.keyboard.press('Shift+Tab')
      seen.add(await page.evaluate(() => `${document.activeElement?.tagName}:${(document.activeElement as HTMLElement | null)?.getAttribute('aria-label') ?? document.activeElement?.textContent?.slice(0, 20)}`))
    }
    expect(seen.size).toBeGreaterThan(5)

    // Assert: every focus stop drew an indicator (its contrast is TC-E-418 below), and no pointer was used
    console.log(`TC-E-418 focus indicator contrast samples (light): ${ratios.join(', ')}`)
    expect(await pointerUsed(page)).toBe(false)
  })

  for (const scheme of SCHEMES) {
    test(`TC-E-418: the focus indicator of the concentration page controls is at least 3:1 in ${scheme} mode`, async ({ page }) => {
      // Arrange
      const { user } = await seedHoldingsDataset()
      await openSignedIn(page, user, '/concentration')
      await settled(page)
      await applyScheme(page, scheme)
      await page.getByRole('heading', { level: 1, name: 'Concentration' }).evaluate((h) => (h as HTMLElement).focus())

      // Act: the first four stops are Settings, Scope, Group by and Measure
      const measured: string[] = []
      const ratios: number[] = []
      for (let i = 0; i < 4; i++) {
        await page.keyboard.press('Tab')
        await expectVisibleFocus(page, `tab ${i + 1}`, ratios)
        measured.push(`${await focusLabel(page)} ${ratios.at(-1)}:1`)
      }
      console.log(`TC-E-418 ${scheme} focus indicator: ${measured.join(' | ')}`)

      // Assert
      expect(Math.min(...ratios)).toBeGreaterThanOrEqual(3)
    })
  }
})

