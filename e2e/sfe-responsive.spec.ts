import { expect, test, type Page } from '@playwright/test'
import { openSheet, seedFilterDataset, sheet, type SfeSeed } from './lib/sfe.ts'
import { noHorizontalScroll, openSignedIn, settled } from './lib/sl.ts'

const PHONE = { width: 360, height: 740 }

/** Elements whose right edge passes the viewport, outside a table's own scroll container (the one allowed horizontal scroll). */
const overflowing = (page: Page) =>
  page.evaluate(() => {
    const limit = window.innerWidth
    return [...document.querySelectorAll('body *')]
      .filter((el) => {
        if (el.closest('[data-slot="table-container"], [data-sonner-toaster], [aria-hidden="true"], [role="region"][aria-label="Rows of the file"]')) return false
        const box = el.getBoundingClientRect()
        const style = getComputedStyle(el)
        return box.width > 0 && box.height > 0 && style.position !== 'fixed' && box.right > limit + 1
      })
      .map((el) => `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 60)} right=${Math.round(el.getBoundingClientRect().right)}`)
  })

test.describe('360 px layout of search, filters and export', () => {
  test.use({ viewport: PHONE, hasTouch: true })
  let seed: SfeSeed
  test.beforeAll(async () => {
    seed = await seedFilterDataset()
    // A long theme, so a badge has to truncate
    await seed.api.patchStock(seed.stocks['PTT']!.id, { themes: ['Dividend', 'Very long theme name that fills a badge!'] })
  })

  const LONG = encodeURIComponent('Very long theme name that fills a badge!')
  const PAGES: [string, string][] = [
    ['stocks filtered with long badges', `/stocks?q=ptt&market=TH&economicCycle=Cyclical&economicCycle=&themes=${LONG}&valueChainPosition=None`],
    ['stocks no match', '/stocks?q=zzz'],
    ['stocks address note', '/stocks?market=Bitcoin&sort=price'],
    ['list filtered', '/lists/CORE?held=yes'],
    ['concentration filtered', `/concentration?scope=all&lens=gicsSector&measure=count&market=TH&themes=${LONG}`],
    ['import / export', '/import-export'],
  ]

  test('TC-E-521: no page-level horizontal scroll and nothing past the viewport; the sheet is a bottom sheet with its footer in view', async ({ page }) => {
    test.setTimeout(240_000)
    await openSignedIn(page, seed.user, '/stocks')
    const wide: string[] = []
    for (const [name, path] of PAGES) {
      await page.goto(path.replace('CORE', seed.core.id))
      await settled(page)
      if (!(await noHorizontalScroll(page))) wide.push(`${name}: page scrolls`)
      const past = await overflowing(page)
      if (past.length > 0) wide.push(`${name}: ${past.slice(0, 3).join(' | ')}`)
    }

    // The sheet from the stocks page: a bottom sheet no taller than 85% of the screen, scrolling inside, footer visible
    await page.goto(PAGES[0]![1])
    await settled(page)
    await openSheet(page)
    const dialog = sheet(page)
    await expect(dialog).toHaveAttribute('data-side', 'bottom')
    const box = (await dialog.boundingBox())!
    if (box.height > PHONE.height * 0.85 + 1) wide.push(`sheet is ${Math.round(box.height)} px tall of ${PHONE.height}`)
    if (box.width > PHONE.width + 1) wide.push(`sheet is ${Math.round(box.width)} px wide`)
    const footer = dialog.getByRole('button', { name: /^Show \d+ stocks?$/ })
    await expect(footer).toBeInViewport({ ratio: 1 }) // waits for the slide-in to finish
    const footerBox = (await footer.boundingBox())!
    if (footerBox.y + footerBox.height > PHONE.height + 1) wide.push('the sheet footer is below the screen')
    if (!(await noHorizontalScroll(page))) wide.push('sheet: page scrolls')
    await dialog.getByRole('button', { name: /^Themes/ }).scrollIntoViewIfNeeded()
    expect(wide).toEqual([])
  })

  test('TC-E-521: the controls a thumb has to hit are at least 24 px (WCAG 2.2) and the toolbar rows wrap as designed', async ({ page }) => {
    await openSignedIn(page, seed.user, '/stocks?q=ptt&market=TH')
    await settled(page)
    const small: string[] = []
    const targets = [
      page.getByRole('searchbox', { name: 'Search stocks' }),
      page.getByRole('button', { name: /^Filters/ }),
      page.getByRole('button', { name: 'Export' }),
      page.getByRole('button', { name: 'Remove search: ptt' }),
      page.getByRole('button', { name: 'Remove filter Market: TH' }),
      page.getByRole('button', { name: 'Clear all' }),
      page.getByRole('link', { name: 'See concentration' }),
    ]
    for (const target of targets) {
      const box = (await target.boundingBox())!
      if (box.width < 23.5 || box.height < 23.5) small.push(`${await target.innerText().catch(() => '?')} ${Math.round(box.width)}x${Math.round(box.height)}`)
    }
    expect(small).toEqual([])
    // Filters and Export share the second toolbar row on a phone
    const filters = (await page.getByRole('button', { name: /^Filters/ }).boundingBox())!
    const exportButton = (await page.getByRole('button', { name: 'Export' }).boundingBox())!
    const search = (await page.getByRole('searchbox', { name: 'Search stocks' }).locator('xpath=..').boundingBox())!
    expect(Math.abs(filters.y - exportButton.y)).toBeLessThan(4)
    expect(filters.y).toBeGreaterThan(search.y + search.height - 1)
    expect(search.width).toBeGreaterThan(PHONE.width - 48)
  })
})
