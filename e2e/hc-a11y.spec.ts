import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Locator, type Page } from '@playwright/test'
import { applyScheme, groupRow, SCHEMES } from './lib/hc.ts'
import { measureContrast } from './lib/contrast.ts'
import { enterHc, HC_STATES, seedForHoldings, type HcCtx, type HcState } from './lib/states.ts'

const named = (name: string): HcState => HC_STATES.find((s) => s.name === name) as HcState

test.describe('axe on every holdings and concentration state', () => {
  let ctx: HcCtx
  test.beforeAll(async () => {
    ctx = await seedForHoldings()
  })

  for (const scheme of SCHEMES) {
    test(`TC-E-415: no axe violations on any holdings or concentration state in ${scheme} mode`, async ({ page }) => {
      test.setTimeout(420_000)
      const findings: string[] = []
      const unresolved: string[] = []
      for (const state of HC_STATES) {
        // Dialogs scroll inside; axe cannot decide contrast for text clipped by the scroll area, so the
        // form states are taken in a viewport tall enough to show everything.
        await page.setViewportSize(/^(stock-new-|stock-edit)/.test(state.name) ? { width: 1280, height: 2600 } : { width: 1280, height: 800 })
        await enterHc(page, state, ctx)
        await applyScheme(page, scheme)
        // Finding F-5 (app shell, not this slice): the account-menu trigger's aria-label ("Account menu") does not contain
        // its visible text (the email), which wcag21a `label-content-name-mismatch` reports on every signed-in page.
        const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).exclude('[aria-label="Account menu"]').analyze()
        for (const v of result.violations) findings.push(`${state.name}: ${v.id} (${v.nodes.length}): ${v.nodes[0]?.target.join(' ')} ${JSON.stringify(v.nodes[0]?.any[0]?.data ?? {})}`)
        // A contrast result axe could not decide must not hide a tinted control; behind a dialog scrim it cannot
        // decide for the page, so overlay states check the overlay itself.
        const overlay = /dialog|^stock-new-/.test(state.name)
        const undecided = overlay
          ? (await new AxeBuilder({ page }).withTags(['wcag2aa']).include('[data-slot="dialog-content"]').analyze()).incomplete
          : result.incomplete
        for (const v of undecided.filter((i) => i.id === 'color-contrast')) for (const n of v.nodes) unresolved.push(`${state.name}: ${n.target.join(' ')}`)
        // Landmarks, a table caption on the concentration table, unique ids.
        if (state.name.startsWith('concentration-') && (await page.getByRole('table').count()) > 0) {
          await expect(page.getByRole('table')).toHaveAccessibleName(/^Stocks grouped by /)
        }
        const ids = await page.evaluate(() => {
          const all = [...document.querySelectorAll('[id]')].map((e) => e.id)
          return all.filter((id, i) => all.indexOf(id) !== i)
        })
        if (ids.length > 0) findings.push(`${state.name}: duplicate ids ${ids.join(', ')}`)
        // Finding F-6 (app shell): SidebarInset and AppLayout both render a <main>, so there are two; not counted here.
        if ((await page.locator('main').count()) === 0) findings.push(`${state.name}: no main landmark`)
      }

      expect(findings).toEqual([])
      expect(unresolved).toEqual([])
    })
  }
})

type Probe = {
  label: string
  state: string
  find: (page: Page) => Locator
  /** Text needs 4.5:1; an icon or a border needs 3:1 (WCAG 1.4.11). */
  min: 4.5 | 3
  property?: 'color' | 'borderTopColor'
}

const THRESHOLD_LINE = (p: Page) => p.getByText(/^Threshold \d+% · /)
const PROBES: Probe[] = [
  { label: 'flag icon against the badge background', state: 'concentration-count-flagged', min: 3, find: (p) => groupRow(p, 'Information Technology').locator('[data-slot="badge"] svg') },
  { label: 'outline badge border against the page background', state: 'concentration-count-flagged', min: 3, property: 'borderTopColor', find: (p) => groupRow(p, 'Information Technology').locator('[data-slot="badge"]') },
  { label: 'flag text Over 40% against the badge', state: 'concentration-count-flagged', min: 4.5, find: (p) => groupRow(p, 'Information Technology').locator('[data-slot="badge"]') },
  { label: 'summary Alert icon (flagged)', state: 'concentration-count-flagged', min: 3, find: (p) => p.getByRole('status').locator('svg').first() },
  { label: 'summary Alert title (flagged)', state: 'concentration-count-flagged', min: 4.5, find: (p) => p.getByRole('status').locator('[data-slot="alert-title"]') },
  { label: 'summary Alert title (none flagged)', state: 'concentration-count-none-flagged', min: 4.5, find: (p) => p.getByRole('status').locator('[data-slot="alert-title"]') },
  { label: 'summary footer (settings line)', state: 'concentration-count-flagged', min: 4.5, find: THRESHOLD_LINE },
  { label: 'multi-value note', state: 'concentration-multi-note', min: 4.5, find: (p) => p.getByText(/counts in each of them/) },
  { label: 'advice note', state: 'concentration-count-flagged', min: 4.5, find: (p) => p.getByText('These groupings and costs are your own classifications, not advice.') },
  { label: 'left-out note', state: 'concentration-value-flagged-left-out', min: 4.5, find: (p) => p.getByText(/^Not in the value:/) },
  { label: 'fallback note', state: 'concentration-fallback-note', min: 4.5, find: (p) => p.getByRole('status').first().locator('[data-slot="alert-description"]') },
  { label: 'Held badge text', state: 'stocks-held-column', min: 4.5, find: (p) => p.locator('tbody [data-slot="badge"]', { hasText: 'Held' }).first() },
  { label: 'shares text next to the Held badge', state: 'stocks-held-column', min: 4.5, find: (p) => p.locator('tbody td span.tabular-nums.text-muted-foreground').first() },
  { label: 'Set rate link button', state: 'concentration-value-flagged-left-out', min: 4.5, find: (p) => p.getByRole('button', { name: 'Set rate' }).first() },
  { label: 'settings dialog threshold hint', state: 'settings-dialog-no-rate', min: 4.5, find: (p) => p.getByText('Flag any group at this share or more (1–100).') },
  { label: 'settings dialog rate hint', state: 'settings-dialog-no-rate', min: 4.5, find: (p) => p.getByText(/^No rate saved\./) },
  { label: 'holding form hint', state: 'stock-new-holding-ticked', min: 4.5, find: (p) => p.getByText("Leave shares or cost empty if you don't want to track the amount.") },
]

test.describe('measured contrast of the new tinted elements', () => {
  let ctx: HcCtx
  const measured: Record<string, number> = {}
  test.beforeAll(async () => {
    ctx = await seedForHoldings()
  })
  test.afterAll(() => {
    writeFileSync(join(__dirname, '.output/hc-contrast.json'), JSON.stringify(measured, null, 2))
  })

  for (const probe of PROBES) {
    for (const scheme of SCHEMES) {
      test(`TC-E-416: ${probe.label} is at least ${probe.min}:1 in ${scheme} mode`, async ({ page }) => {
        // Arrange
        await enterHc(page, named(probe.state), ctx)
        await applyScheme(page, scheme)
        const target = probe.find(page).first()
        await expect(target).toBeVisible()

        // Act
        const result = await measureContrast(target, probe.property)
        measured[`${scheme} | ${probe.label}`] = result.ratio
        console.log(`TC-E-416 ${scheme} ${probe.label}: ${result.ratio}:1 (${result.fg} on ${result.bg}) "${result.text}"`)

        // Assert
        expect(result.ratio).toBeGreaterThanOrEqual(probe.min)
      })
    }
  }
})
