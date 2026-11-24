import { expect, test, type Page } from '@playwright/test'
import { groupRow, lensSelect, measureRadio, pickOption } from './lib/hc.ts'
import { closeSheet, filtersButton, openAs, openSheet, pick, searchBox, seedFilterDataset } from './lib/sfe.ts'
import { settled } from './lib/sl.ts'

/** Every request the page sends to the API (the dev server proxies it under /api). */
function apiRequests(page: Page) {
  const seen: string[] = []
  page.on('request', (r) => {
    const url = new URL(r.url())
    if (url.pathname.startsWith('/api/')) seen.push(`${r.method()} ${url.pathname}`)
  })
  return seen
}

test.describe('search and filters on and into the concentration page', () => {
  test('TC-E-507: searching, picking, removing and sorting send no API request on any of the three pages', async ({ page }) => {
    const seed = await seedFilterDataset()
    await openAs(page, seed.user)
    const seen = apiRequests(page)

    for (const path of ['/stocks', `/lists/${seed.core.id}`, '/concentration']) {
      await page.goto(path)
      await settled(page)
      expect(seen.some((r) => r.includes('/stocks')), `${path}: the recorder saw the first load`).toBe(true)
      seen.length = 0 // the first load reads the data; what follows must not

      await searchBox(page).pressSequentially('pt')
      await openSheet(page)
      await pick(page, 'Market', /^TH, /)
      await closeSheet(page)
      await page.getByRole('button', { name: 'Remove filter Market: TH' }).click()
      await page.getByRole('button', { name: 'Remove search: pt' }).click()
      if (path === '/concentration') {
        await pickOption(page, 'Group by', 'Style')
        await measureRadio(page, 'Value at cost').click()
        await expect(measureRadio(page, 'Value at cost')).toBeChecked()
      } else {
        await page.getByRole('button', { name: 'Sort by Name' }).click()
        await expect(page).toHaveURL(/sort=name/)
      }
      await page.waitForTimeout(400) // a request would have been sent by now
      expect(seen, path).toEqual([])
    }
  })

  test('TC-E-508: a filtered list opens its concentration with the same filters, and they can change there', async ({ page }) => {
    const seed = await seedFilterDataset()
    await openAs(page, seed.user, `/lists/${seed.core.id}`)
    await openSheet(page)
    await pick(page, 'Held', /^Held, /)
    await closeSheet(page)
    await expect(page.locator('p[role="status"]').first()).toHaveText('2 of 3 stocks')

    await page.getByRole('link', { name: 'See concentration' }).click()
    await expect(page).toHaveURL(new RegExp(`/concentration\\?scope=${seed.core.id}&lens=gicsSector&measure=count&held=yes$`))
    await expect(page.getByText('2 of 3 stocks in scope')).toBeVisible()
    await expect(groupRow(page, 'Energy')).toContainText('50.0%')
    await expect(groupRow(page, 'Information Technology')).toContainText('50.0%')
    await expect(filtersButton(page)).toHaveAccessibleName('Filters 1 active')

    const seen: string[] = []
    page.on('request', (r) => {
      if (new URL(r.url()).pathname.startsWith('/api/')) seen.push(r.url())
    })
    await openSheet(page)
    await pick(page, 'Market', /^TH, /)
    await closeSheet(page)
    await expect(page.getByText('1 of 3 stocks in scope')).toBeVisible()
    await expect(groupRow(page, 'Energy')).toContainText('100.0%')
    await expect(page.getByRole('button', { name: 'Show stocks in Information Technology' })).toHaveCount(0)

    await measureRadio(page, 'Value at cost').click()
    await expect(groupRow(page, 'Energy')).toContainText('Over 35%') // the saved threshold
    await expect(page).toHaveURL(/measure=value&market=TH&held=yes$|measure=value&held=yes&market=TH$/)
    await lensSelect(page).click()
    await page.getByRole('option', { name: 'Economic cycle' }).click()
    await expect(page).toHaveURL(/lens=economicCycle&measure=value/)
    expect(page.url()).toContain('market=TH')
    expect(page.url()).toContain('held=yes')
    expect(seen).toEqual([])
  })
})
