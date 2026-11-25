import { expect, test } from '@playwright/test'
import { dateBox, entryCards, latestInstantAt, localToday, openAdd, openStock, seedStockOnly, shown } from './lib/tl.ts'
import { toast } from './lib/sl.ts'

const CASES = [
  { zone: 'Asia/Bangkok', hour: 6, minute: 30, why: 'early morning in Bangkok, still the previous day in UTC' },
  { zone: 'Pacific/Kiritimati', hour: 23, minute: 30, why: 'UTC+14 just before its midnight, the latest date anywhere' },
  { zone: 'America/Los_Angeles', hour: 21, minute: 30, why: 'late evening in Los Angeles, already tomorrow in UTC' },
] as const

for (const { zone, hour, minute, why } of CASES) {
  test.describe(zone, () => {
    test.use({ timezoneId: zone })

    test(`TC-E-716: ${zone} at ${hour}:${minute} local (${why}): the default date is the local day, the API accepts it and the list shows it unshifted`, async ({ page }) => {
      const seed = await seedStockOnly()
      await openStock(page, seed)
      // Past, never ahead of the server's clock, so the local day cannot pass the API's UTC+14 bound by more than it allows.
      const instant = latestInstantAt(zone, hour, minute)
      await page.clock.setFixedTime(instant)
      const day = localToday(zone, instant)

      await openAdd(page)
      await expect(dateBox(page)).toHaveValue(day)
      await expect(dateBox(page)).toHaveAttribute('max', day)
      await dateBox(page).evaluate((el) => el.closest('[role="dialog"]')?.querySelector('textarea')?.focus())
      await page.keyboard.type('Added at the edge of the day')
      await page.getByRole('dialog').getByRole('radio', { name: 'Buy' }).click()
      await page.getByRole('dialog').getByRole('button', { name: 'Add entry' }).click()

      await expect(toast(page, 'Entry added')).toBeVisible()
      const [saved] = await seed.api.theses(seed.nvda.id)
      expect(saved?.date).toBe(day)
      await expect(entryCards(page).first().locator('time')).toHaveText(shown(day))
      await expect(entryCards(page).first().locator('time')).toHaveAttribute('datetime', day)
    })
  })
}

