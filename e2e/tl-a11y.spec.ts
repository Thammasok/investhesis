import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Locator, type Page } from '@playwright/test'
import { focusRingContrast, measureContrast } from './lib/contrast.ts'
import { applyScheme, SCHEMES } from './lib/hc.ts'
import { enterTl, seedForTheses, TL_STATES, type TlCtx } from './lib/states.ts'
import { ADVICE, entryCards, entryDialog, noteBox, sectionCard, ZONE } from './lib/tl.ts'
import { settled } from './lib/sl.ts'

test.use({ timezoneId: ZONE })

test.describe('axe on every thesis state', () => {
  let ctx: TlCtx
  test.beforeAll(async () => {
    ctx = await seedForTheses()
  })
  test.afterEach(async ({ page }) => page.unrouteAll({ behavior: 'ignoreErrors' }))

  for (const scheme of SCHEMES) {
    test(`TC-E-712: no axe violations on any thesis state in ${scheme} mode`, async ({ page }) => {
      test.setTimeout(240_000)
      const findings: string[] = []
      const unresolved: string[] = []
      for (const state of TL_STATES) {
        await page.setViewportSize({ width: 1280, height: 900 })
        await enterTl(page, state, ctx)
        await applyScheme(page, scheme)
        // Finding F-5 (app shell, not this slice): the account menu's aria-label does not contain its visible text,
        // which wcag21a `label-content-name-mismatch` reports on every signed-in page.
        const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).exclude('[aria-label="Account menu"]').analyze()
        // Known finding F-2 (stock-lists report; the solid destructive confirm is tinted, white text on bg-destructive/10 =
        // 1.24:1): it now shows on the thesis delete confirms too. Only that node is left out here; see the owner's decision.
        const knownF2 = (v: { id: string; nodes: { target: unknown[] }[] }) => scheme === 'light' && /confirm$/.test(state.name) && v.id === 'color-contrast' && v.nodes.every((n) => n.target.join(' ').includes('bg-destructive'))
        for (const v of result.violations.filter((v) => !knownF2(v))) findings.push(`${state.name}: ${v.id} (${v.nodes.length}): ${v.nodes[0]?.target.join(' ')} ${JSON.stringify(v.nodes[0]?.any[0]?.data ?? {})}`)
        // Behind a dialog's scrim axe cannot decide the page's contrast, so overlay states check the overlay itself.
        const overlay = /dialog|confirm/.test(state.name)
        const undecided = overlay
          ? (await new AxeBuilder({ page }).withTags(['wcag2aa']).include('[data-slot="dialog-content"], [data-slot="alert-dialog-content"]').analyze()).incomplete
          : result.incomplete
        for (const v of undecided.filter((i) => i.id === 'color-contrast')) for (const n of v.nodes) unresolved.push(`${state.name}: ${n.target.join(' ')}`)
        const ids = await page.evaluate(() => {
          const all = [...document.querySelectorAll('[id]')].map((e) => e.id)
          return all.filter((id, i) => all.indexOf(id) !== i)
        })
        if (ids.length > 0) findings.push(`${state.name}: duplicate ids ${ids.join(', ')}`)
      }

      expect(findings).toEqual([])
      expect(unresolved).toEqual([])
    })
  }
})

type Probe = { label: string; state: string; find: (page: Page) => Locator; min: 4.5 | 3; /** Known finding F-2: the destructive confirm in light mode. */ skipIn?: ('light' | 'dark')[] }
const badge = (type: string) => (p: Page) => sectionCard(p).locator('[data-slot="badge"]', { hasText: new RegExp(`^${type}$`) })
const PROBES: Probe[] = [
  { label: 'Buy badge text', state: 'section-filled', min: 4.5, find: badge('Buy') },
  { label: 'Sell badge text', state: 'section-filled', min: 4.5, find: badge('Sell') },
  { label: 'Update badge text', state: 'section-filled', min: 4.5, find: badge('Update') },
  { label: 'Review badge text', state: 'section-filled', min: 4.5, find: badge('Review') },
  { label: 'entry count', state: 'section-filled', min: 4.5, find: (p) => sectionCard(p).getByText('4 entries', { exact: true }) },
  { label: 'advice note', state: 'section-filled', min: 4.5, find: (p) => sectionCard(p).getByText(ADVICE) },
  { label: 'Edited text', state: 'section-filled', min: 4.5, find: (p) => sectionCard(p).getByText(/^Edited /).first() },
  { label: 'target price label (dt)', state: 'section-filled', min: 4.5, find: (p) => sectionCard(p).locator('dt', { hasText: 'Target price' }) },
  { label: 'invalidation label (dt)', state: 'section-filled', min: 4.5, find: (p) => sectionCard(p).locator('dt', { hasText: 'Invalidation' }) },
  { label: 'empty-state text', state: 'section-empty', min: 4.5, find: (p) => sectionCard(p).getByText(/^Write down why you hold or watch this stock/) },
  { label: 'dialog counter (within limit)', state: 'add-dialog-clean', min: 4.5, find: (p) => entryDialog(p).locator('#thesis-note-count') },
  { label: 'delete confirm text on its fill (rest)', state: 'delete-confirm', min: 4.5, skipIn: ['light'], find: (p) => p.getByRole('alertdialog').getByRole('button', { name: 'Delete' }) },
  { label: 'stock delete confirm text on its fill (rest)', state: 'stock-delete-confirm', min: 4.5, skipIn: ['light'], find: (p) => p.getByRole('alertdialog').getByRole('button', { name: 'Delete' }) },
]

test.describe('measured contrast of the thesis section and dialogs', () => {
  let ctx: TlCtx
  test.beforeAll(async () => {
    ctx = await seedForTheses()
  })
  test.afterEach(async ({ page }) => page.unrouteAll({ behavior: 'ignoreErrors' }))

  for (const scheme of SCHEMES) {
    test(`TC-E-713: text on the thesis section and the confirms measures at least 4.5:1 in ${scheme} mode`, async ({ page }) => {
      test.setTimeout(240_000)
      const measured: Record<string, number> = {}
      const failures: string[] = []
      let current = ''
      for (const probe of PROBES) {
        if (probe.state !== current) {
          current = probe.state
          const state = TL_STATES.find((s) => s.name === probe.state)!
          await enterTl(page, state, ctx)
          await applyScheme(page, scheme)
        }
        if (probe.skipIn?.includes(scheme)) continue
        const target = probe.find(page)
        await expect(target.first(), probe.label).toBeVisible()
        const result = await measureContrast(target.first())
        measured[probe.label] = result.ratio
        if (result.ratio < probe.min) failures.push(`${probe.label}: ${result.ratio}:1 < ${probe.min}:1 (${result.fg} on ${result.bg})`)
      }
      console.log(`TC-E-713 ${scheme}: ${JSON.stringify(measured)}`)
      expect(failures).toEqual([])
    })

    test(`TC-E-713: the over-limit counter is told apart by weight and text, and measures at least 4.5:1, in ${scheme} mode`, async ({ page }) => {
      await enterTl(page, TL_STATES.find((s) => s.name === 'add-dialog-clean')!, ctx)
      await applyScheme(page, scheme)

      await noteBox(page).fill('x'.repeat(10_001))
      const counter = entryDialog(page).locator('#thesis-note-count')
      await expect(counter).toHaveText('10,001 / 10,000')
      await entryDialog(page).getByRole('button', { name: 'Add entry' }).click()
      await expect(entryDialog(page).getByText(/^Thesis must be 1-10,000 characters/)).toBeVisible()

      const weight = await counter.evaluate((el) => Number(getComputedStyle(el).fontWeight))
      const withinWeight = await entryDialog(page).locator('#thesis-invalidation-count').evaluate((el) => Number(getComputedStyle(el).fontWeight))
      expect(weight).toBeGreaterThanOrEqual(500)
      expect(weight).toBeGreaterThan(withinWeight)
      const colours = await counter.evaluate((el) => ({ own: getComputedStyle(el).color, foreground: getComputedStyle(document.body).color }))
      expect(colours.own, 'not told apart by a red colour').toBe(colours.foreground)
      expect((await measureContrast(counter)).ratio).toBeGreaterThanOrEqual(4.5)
    })

    test(`TC-E-713: the solid destructive confirm keeps 4.5:1 where it can in ${scheme} mode`, async ({ page }) => {
      await enterTl(page, TL_STATES.find((s) => s.name === 'delete-confirm')!, ctx)
      await applyScheme(page, scheme)
      const confirm = page.getByRole('alertdialog').getByRole('button', { name: 'Delete' })
      const measure = async () => (await measureContrast(confirm)).ratio

      // Known findings, measured here too (stock-lists report): F-2 the confirm is tinted, not solid, in light mode
      // (rest, hover and focus all about 1.26:1), and F-3 its hover in dark mode is about 3.8:1. Those are left out.
      if (scheme === 'dark') {
        expect(await measure(), 'rest').toBeGreaterThanOrEqual(4.5)
        await confirm.hover()
        await page.waitForTimeout(300)
        console.log(`TC-E-713 dark hover (finding F-3): ${await measure()}:1`)
        await page.mouse.move(0, 0)
      } else {
        console.log(`TC-E-713 light rest (finding F-2): ${await measure()}:1`)
      }
      // The dialog opens with focus on Cancel; Tab reaches the confirm the way a keyboard user does (:focus-visible).
      await page.keyboard.press('Tab')
      await expect(confirm).toBeFocused()
      await page.waitForTimeout(400)
      if (scheme === 'dark') expect(await measure(), 'focus').toBeGreaterThanOrEqual(4.5)
      // Not part of the case, but measured for the owner: the destructive variant's ring is the faint ring-destructive/20.
      const ring = await focusRingContrast(confirm)
      console.log(`TC-E-713 ${scheme} confirm focus ring (finding F-6, new): ${ring ? `${ring.ratio}:1 ${ring.kind}` : 'none drawn'}`)
      expect(ring, 'a focus indicator is drawn').not.toBeNull()
    })
  }
})

test.describe('reduced motion in dark mode', () => {
  test.use({ reducedMotion: 'reduce', colorScheme: 'dark' })
  let ctx: TlCtx
  test.beforeAll(async () => {
    ctx = await seedForTheses()
  })
  test.afterEach(async ({ page }) => page.unrouteAll({ behavior: 'ignoreErrors' }))

  test('TC-E-720: the skeleton, the Retry spinner and the saving spinner do not animate, and the section reads in dark mode', async ({ page }) => {
    const running = (loc: Locator) => loc.evaluateAll((els) => els.filter((el) => getComputedStyle(el).animationName !== 'none').length)

    // Loading skeleton
    await enterTl(page, TL_STATES.find((s) => s.name === 'section-loading')!, ctx)
    await applyScheme(page, 'dark')
    const skeleton = sectionCard(page).locator('[data-slot="skeleton"]')
    expect(await skeleton.count()).toBeGreaterThan(0)
    expect(await running(skeleton)).toBe(0)

    // Retry spinner: the second read is held, so Retry shows its spinner
    await page.unrouteAll({ behavior: 'ignoreErrors' })
    await page.route(`**/api/stocks/${ctx.nvda.id}/theses`, (route) => route.fulfill({ status: 500, contentType: 'application/problem+json', body: JSON.stringify({ code: 'internal', status: 500, title: 'x', type: 'about:blank' }) }))
    await page.goto(`/stocks/${ctx.nvda.id}`)
    await expect(page.getByRole('alert').filter({ hasText: "Couldn't load" })).toBeVisible()
    await page.unrouteAll({ behavior: 'ignoreErrors' })
    await page.route(`**/api/stocks/${ctx.nvda.id}/theses`, () => {}) // held
    await page.getByRole('button', { name: 'Retry' }).click()
    const spinner = page.getByRole('alert').locator('svg.animate-spin, svg[class*="animate-spin"]')
    await expect(spinner).toBeVisible()
    expect(await running(spinner)).toBe(0)

    // Saving spinner in the dialog
    await page.unrouteAll({ behavior: 'ignoreErrors' })
    await page.goto(`/stocks/${ctx.aapl.id}`)
    await settled(page)
    await page.route(`**/api/stocks/${ctx.aapl.id}/theses`, async (route) => {
      if (route.request().method() === 'POST') return // held
      await route.continue()
    })
    await page.getByRole('button', { name: 'Add first entry' }).click()
    await entryDialog(page).getByRole('radio', { name: 'Buy' }).click()
    await noteBox(page).fill('Held while saving')
    await entryDialog(page).getByRole('button', { name: 'Add entry' }).click()
    const saving = entryDialog(page).locator('button[type="submit"] svg[class*="animate-spin"]')
    await expect(saving).toBeVisible()
    expect(await running(saving)).toBe(0)
    await page.unrouteAll({ behavior: 'ignoreErrors' })

    // Dark mode is on and the filled section is readable
    await enterTl(page, TL_STATES.find((s) => s.name === 'section-filled')!, ctx)
    expect(await page.evaluate(() => document.documentElement.classList.contains('dark') || matchMedia('(prefers-color-scheme: dark)').matches)).toBe(true)
    await expect(entryCards(page)).toHaveCount(4)
    const ratio = (await measureContrast(entryCards(page).first().locator('p').first())).ratio
    expect(ratio).toBeGreaterThanOrEqual(4.5)
  })
})
