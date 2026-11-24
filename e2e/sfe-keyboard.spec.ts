import { expect, test, type Page } from '@playwright/test'
import { pointerUsed, trackPointer } from './lib/hc.ts'
import { openAs, seedFilterDataset, sheet, tableTickers } from './lib/sfe.ts'
import { settled } from './lib/sl.ts'

const focusName = (page: Page) =>
  page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null
    if (!el) return ''
    const labelled = (el as HTMLInputElement).labels?.[0]?.textContent
    return (el.getAttribute('aria-label') ?? labelled ?? el.textContent ?? el.tagName).trim().replace(/\s+/g, ' ').slice(0, 60)
  })

/** Tabs forward until the focused element's name matches, failing with the path walked. */
async function tabTo(page: Page, name: RegExp, max = 40) {
  const walked: string[] = []
  for (let i = 0; i < max; i++) {
    await page.keyboard.press('Tab')
    const now = await focusName(page)
    walked.push(now)
    if (name.test(now)) return
  }
  throw new Error(`never reached ${name}: ${walked.join(' > ')}`)
}
const notOnBody = async (page: Page, where: string) => expect(await page.evaluate(() => document.activeElement === document.body), `focus fell to the page body ${where}`).toBe(false)

test.describe('keyboard-only', () => {
  test.use({ actionTimeout: 15_000 })

  test('TC-E-522: search, filter, export, follow the link, change filters there and back up, without a pointer', async ({ page }) => {
    test.setTimeout(240_000)
    const seed = await seedFilterDataset()
    await trackPointer(page)
    await openAs(page, seed.user)
    await page.getByRole('heading', { level: 1, name: 'Stocks' }).evaluate((h) => (h as HTMLElement).focus())

    // Search: reach the box with Tab and type
    await tabTo(page, /^Search stocks$/)
    await page.keyboard.type('pt')
    await expect.poll(() => tableTickers(page)).toEqual(['PTT', 'PTTEP', 'PTTGC'])
    await tabTo(page, /^Clear search$/)
    await page.keyboard.press('Tab')
    expect(await focusName(page)).toMatch(/^Filters/)

    // The sheet: Enter opens it, focus starts on the first section, Space ticks, Esc returns focus to Filters
    await page.keyboard.press('Enter')
    await expect(sheet(page)).toBeVisible()
    await expect.poll(() => focusName(page)).toMatch(/^Market/)
    await page.keyboard.press('Tab') // the first option of Market: US
    expect(await focusName(page)).toMatch(/^US, /)
    await page.keyboard.press('Tab')
    expect(await focusName(page)).toMatch(/^TH, /)
    await page.keyboard.press('Space')
    await expect(page).toHaveURL(/q=pt&market=TH$/)
    await tabTo(page, /^Economic cycle/)
    await page.keyboard.press('Enter') // opens the section
    await page.keyboard.press('Tab')
    expect(await focusName(page)).toMatch(/^Cyclical, /)
    await page.keyboard.press('Space')
    await expect(page).toHaveURL(/economicCycle=Cyclical$/)
    await expect.poll(() => tableTickers(page)).toEqual(['PTT', 'PTTEP'])
    await page.keyboard.press('Escape')
    await expect(sheet(page)).toHaveCount(0)
    await expect.poll(() => focusName(page)).toMatch(/^Filters 2 active/)

    // Export: Enter opens the menu, arrows move, Esc closes and returns focus to the button
    await page.keyboard.press('Tab')
    expect(await focusName(page)).toBe('Export')
    await page.keyboard.press('Enter')
    await expect(page.getByRole('menu')).toBeVisible()
    await page.keyboard.press('ArrowDown')
    await expect.poll(() => focusName(page)).toMatch(/^Download CSV/)
    await page.keyboard.press('ArrowDown')
    await expect.poll(() => focusName(page)).toMatch(/^Copy as table/)
    await page.keyboard.press('Escape')
    await expect(page.getByRole('menu')).toHaveCount(0)
    await expect.poll(() => focusName(page)).toBe('Export')

    // A badge is removed with Enter and focus moves to the next one
    await tabTo(page, /^Remove filter Market: TH$/)
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/q=pt&economicCycle=Cyclical$/)
    await expect.poll(() => focusName(page)).toMatch(/^Remove filter Economic cycle: Cyclical$/)
    await notOnBody(page, 'after removing a badge')

    // To concentration: the link keeps the filters; change a filter there and come back
    await tabTo(page, /^See concentration$/)
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/\/concentration\?scope=all&lens=gicsSector&measure=count&q=pt&economicCycle=Cyclical$/)
    await expect(page.getByText(/of 12 stocks in scope$/)).toBeVisible()
    await settled(page)
    await page.getByRole('heading', { level: 1, name: 'Concentration' }).evaluate((h) => (h as HTMLElement).focus())
    await tabTo(page, /^Remove search: pt$/)
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/economicCycle=Cyclical$/)
    await notOnBody(page, 'on the concentration page')

    // The backup: reached by keyboard, started with Enter
    await page.goto('/import-export')
    await settled(page)
    await page.getByRole('heading', { level: 1, name: 'Import / export' }).evaluate((h) => (h as HTMLElement).focus())
    await tabTo(page, /^Download JSON$/)
    const [file] = await Promise.all([page.waitForEvent('download'), page.keyboard.press('Enter')])
    expect(file.suggestedFilename()).toMatch(/^investhesis-backup-.*\.json$/)
    await expect(page.getByRole('button', { name: 'Download JSON' })).toBeFocused()

    expect(await pointerUsed(page)).toBe(false)
  })
})
