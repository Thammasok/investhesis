import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Locator, type Page } from '@playwright/test'
import { measureContrast, focusRingContrast } from './lib/contrast.ts'
import { applyScheme, SCHEMES } from './lib/hc.ts'
import { closeSheet, openAs, openSheet, searchBox, section, seedFilterDataset, sheet, type SfeSeed } from './lib/sfe.ts'
import { openSignedIn, pickFile, settled } from './lib/sl.ts'

type State = {
  name: string
  /** A state in front of a scrim: the page behind it cannot be judged, so the overlay is checked by itself. */
  overlay?: boolean
  run: (page: Page, seed: SfeSeed, csv: string) => Promise<void>
}
const go = (path: (seed: SfeSeed) => string) => async (page: Page, seed: SfeSeed) => {
  await page.goto(path(seed))
  await settled(page)
}

const STATES: State[] = [
  { name: 'stocks-filtered', run: go(() => '/stocks?q=ptt&market=TH&economicCycle=Cyclical&economicCycle=') },
  {
    name: 'stocks-sheet-open',
    overlay: true,
    run: async (page, seed) => {
      await go(() => '/stocks?economicCycle=Cyclical&themes=ai')(page, seed)
      await openSheet(page)
      await section(page, 'Economic cycle')
      await section(page, 'Value chain position')
      await section(page, 'Themes')
    },
  },
  { name: 'stocks-no-match', run: go(() => '/stocks?q=zzz') },
  { name: 'stocks-address-note', run: go(() => '/stocks?market=Bitcoin&sort=price&q=a&q=b') },
  {
    name: 'stocks-export-menu',
    overlay: true,
    run: async (page, seed) => {
      await go(() => '/stocks?market=TH')(page, seed)
      await page.getByRole('button', { name: 'Export' }).click()
      await expect(page.getByRole('menu')).toBeVisible()
    },
  },
  { name: 'list-filtered', run: go((s) => `/lists/${s.core.id}?held=yes`) },
  { name: 'concentration-filtered', run: go(() => '/concentration?scope=all&lens=gicsSector&measure=count&market=TH') },
  { name: 'concentration-no-match', run: go(() => '/concentration?scope=all&q=zzz') },
  { name: 'import-export-card', run: go(() => '/import-export') },
  {
    name: 'import-export-error',
    run: async (page, seed) => {
      await page.route('**/api/exports/backup.csv', (route) => route.fulfill({ status: 503, contentType: 'application/problem+json', body: JSON.stringify({ code: 'db_unavailable', status: 503, title: 'Unavailable', type: 'about:blank' }) }))
      await go(() => '/import-export')(page, seed)
      await page.getByRole('button', { name: 'Download CSV' }).click()
      await expect(page.getByRole('alert').filter({ hasText: "Couldn't download the backup" })).toBeVisible()
    },
  },
  {
    name: 'import-review-ignored-note',
    overlay: true,
    run: async (page, seed, csv) => {
      await page.goto('/import-export/import')
      await settled(page)
      await pickFile(page, 'investhesis-stocks.csv', csv, 'text/csv')
      await expect(page.getByText(/Lists and holdings columns are not imported/)).toBeVisible()
    },
  },
]

test.describe('axe on every search, filter and export state', () => {
  let seed: SfeSeed
  let csv: string
  test.beforeAll(async () => {
    seed = await seedFilterDataset()
    const api = await (await import('./lib/sl.ts')).apiAs(seed.user)
    csv = (await api.backup('csv')).text
  })

  for (const scheme of SCHEMES) {
    test(`TC-E-519: no axe violations on any search, filter or export state in ${scheme} mode`, async ({ page }) => {
      test.setTimeout(420_000)
      await openSignedIn(page, seed.user, '/stocks')
      const findings: string[] = []
      const unresolved: string[] = []
      for (const state of STATES) {
        await page.unroute('**/api/exports/backup.csv').catch(() => {})
        await page.setViewportSize({ width: 1280, height: 900 })
        await state.run(page, seed, csv)
        await applyScheme(page, scheme)
        // Finding F-5 (app shell, not this slice): the account menu's aria-label does not contain its visible text.
        // A modal sheet or menu hides the page behind it and traps focus (Radix); axe's `aria-hidden-focus` reads that
        // hidden page as focusable content and cannot know the trap, so it is not asked of an overlay state.
        const rules = new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).exclude('[aria-label="Account menu"]')
        const result = await (state.overlay ? rules.disableRules(['aria-hidden-focus']) : rules).analyze()
        for (const v of result.violations) findings.push(`${state.name}: ${v.id} (${v.nodes.length}): ${v.nodes[0]?.target.join(' ')} ${JSON.stringify(v.nodes[0]?.any[0]?.data ?? {})}`)
        const undecided = state.overlay
          ? (await new AxeBuilder({ page }).withTags(['wcag2aa']).include('[data-slot="sheet-content"], [data-slot="dropdown-menu-content"], [data-slot="dialog-content"]').analyze()).incomplete
          : result.incomplete
        for (const v of undecided.filter((i) => i.id === 'color-contrast')) for (const n of v.nodes) unresolved.push(`${state.name}: ${n.target.join(' ')}`)
        const ids = await page.evaluate(() => {
          const all = [...document.querySelectorAll('[id]')].map((e) => e.id)
          return all.filter((id, i) => all.indexOf(id) !== i)
        })
        if (ids.length > 0) findings.push(`${state.name}: duplicate ids ${ids.join(', ')}`)
        await page.keyboard.press('Escape')
      }
      expect(findings).toEqual([])
      expect(unresolved).toEqual([])
    })
  }
})

type Probe = {
  label: string
  /** Puts the page in the state the probe measures. */
  prepare: (page: Page, seed: SfeSeed) => Promise<void>
  find: (page: Page) => Locator
  min: 4.5 | 3
  property?: 'color' | 'borderTopColor'
}
const sheetOpen = async (page: Page, seed: SfeSeed) => {
  await page.goto('/stocks?q=ptt&market=TH&economicCycle=Cyclical')
  await settled(page)
  void seed
  await openSheet(page)
  await section(page, 'Economic cycle')
  await section(page, 'Themes')
}
const toolbar = async (page: Page) => {
  await page.goto('/stocks?q=ptt&market=TH&economicCycle=Cyclical')
  await settled(page)
}

const PROBES: Probe[] = [
  { label: 'the sheet title and count', prepare: sheetOpen, min: 4.5, find: (p) => sheet(p).getByText(/ of 12 stocks$/) },
  { label: 'a section title in the sheet', prepare: sheetOpen, min: 4.5, find: (p) => sheet(p).getByRole('button', { name: /^Economic cycle/ }) },
  { label: 'an option label in the sheet', prepare: sheetOpen, min: 4.5, find: (p) => sheet(p).getByText('Cyclical', { exact: true }).first() },
  { label: 'the "Not set" option label (italic)', prepare: sheetOpen, min: 4.5, find: (p) => sheet(p).getByRole('group', { name: 'Economic cycle' }).getByText('Not set', { exact: true }) },
  { label: 'a count of zero (muted) in the sheet', prepare: async (p, s) => { await sheetOpen(p, s); await section(p, 'Lynch type') }, min: 4.5, find: (p) => sheet(p).getByRole('group', { name: 'Lynch type' }).locator('span[aria-hidden="true"]', { hasText: /^0$/ }).first() },
  { label: 'the checkbox border in the sheet', prepare: sheetOpen, min: 3, property: 'borderTopColor', find: (p) => sheet(p).getByRole('checkbox', { name: /^Defensive, / }) },
  { label: 'the active-filter badge text', prepare: toolbar, min: 4.5, find: (p) => p.locator('[data-slot="badge"]', { hasText: 'Market: TH' }) },
  { label: 'the result count', prepare: toolbar, min: 4.5, find: (p) => p.locator('p[role="status"]').first() },
  { label: 'the Clear all link', prepare: toolbar, min: 4.5, find: (p) => p.getByRole('button', { name: 'Clear all' }) },
  { label: 'the See concentration link', prepare: toolbar, min: 4.5, find: (p) => p.getByRole('link', { name: 'See concentration' }) },
  { label: 'the Export card notes', prepare: async (p) => { await p.goto('/import-export'); await settled(p) }, min: 4.5, find: (p) => p.getByText('These files include your shares and costs. Keep them private.') },
]

test.describe('measured contrast of the filter and export controls', () => {
  let seed: SfeSeed
  const measured: Record<string, number> = {}
  test.beforeAll(async () => {
    seed = await seedFilterDataset()
  })
  test.afterAll(() => {
    writeFileSync(join(__dirname, '.output/sfe-contrast.json'), JSON.stringify(measured, null, 2))
  })

  for (const probe of PROBES) {
    for (const scheme of SCHEMES) {
      test(`TC-E-520: ${probe.label} is at least ${probe.min}:1 in ${scheme} mode`, async ({ page }) => {
        await openSignedIn(page, seed.user, '/stocks')
        await probe.prepare(page, seed)
        await applyScheme(page, scheme)
        const target = probe.find(page).first()
        await expect(target).toBeVisible()
        const result = await measureContrast(target, probe.property)
        measured[`${scheme} | ${probe.label}`] = result.ratio
        console.log(`TC-E-520 ${scheme} ${probe.label}: ${result.ratio}:1 (${result.fg} on ${result.bg}) "${result.text}"`)
        expect(result.ratio).toBeGreaterThanOrEqual(probe.min)
      })
    }
  }

  for (const scheme of SCHEMES) {
    test(`TC-E-520: the focus ring of a badge's remove button is at least 3:1 in ${scheme} mode`, async ({ page }) => {
      await openSignedIn(page, seed.user, '/stocks')
      await toolbar(page)
      await applyScheme(page, scheme)
      const remove = page.getByRole('button', { name: 'Remove filter Market: TH' })
      await remove.focus()
      await page.keyboard.press('Shift+Tab') // focus-visible only shows for keyboard focus
      await page.keyboard.press('Tab')
      await expect(remove).toBeFocused()
      await page.waitForTimeout(400)
      const ring = await focusRingContrast(remove)
      console.log(`TC-E-520 ${scheme} badge remove focus: ${ring?.all}`)
      expect(ring, 'the remove button draws a focus indicator').not.toBeNull()
      expect(ring?.ratio ?? 0).toBeGreaterThanOrEqual(3)
    })
  }
  void searchBox
  void closeSheet
  void openAs
})
