import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Locator, type Page } from '@playwright/test'
import { focusRingContrast, measureContrast } from './lib/contrast.ts'
import { applyScheme, SCHEMES } from './lib/hc.ts'
import { enterVc, seedForChains, VC_STATES, type VcCtx } from './lib/states.ts'
import { chainCard, chainSummary, laneIn, ZONE } from './lib/vc.ts'

test.use({ timezoneId: ZONE })

test.describe('axe on every value chains state', () => {
  let ctx: VcCtx
  test.beforeAll(async () => {
    ctx = await seedForChains()
  })
  test.afterEach(async ({ page }) => page.unrouteAll({ behavior: 'ignoreErrors' }))

  for (const scheme of SCHEMES) {
    test(`TC-E-918: no axe violations on any value chains state in ${scheme} mode`, async ({ page }) => {
      test.setTimeout(300_000)
      const findings: string[] = []
      const unresolved: string[] = []
      for (const state of VC_STATES) {
        await enterVc(page, state, ctx)
        await applyScheme(page, scheme)
        // Finding F-5 (app shell, not this slice): the account menu's aria-label does not contain its visible text.
        const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).exclude('[aria-label="Account menu"]').analyze()
        for (const v of result.violations) findings.push(`${state.name}: ${v.id} (${v.nodes.length}): ${v.nodes[0]?.target.join(' ')} ${JSON.stringify(v.nodes[0]?.any[0]?.data ?? {})}`)
        // Behind a dialog's scrim axe cannot decide the page's contrast, so overlay states check the overlay itself.
        const overlay = /dialog|sheet/.test(state.name)
        const undecided = overlay
          ? (await new AxeBuilder({ page }).withTags(['wcag2aa']).include('[data-slot="dialog-content"], [data-slot="sheet-content"]').analyze()).incomplete
          : result.incomplete
        for (const v of undecided.filter((i) => i.id === 'color-contrast')) for (const n of v.nodes) unresolved.push(`${state.name}: ${n.target.join(' ')}`)
        const ids = await page.evaluate(() => {
          const all = [...document.querySelectorAll('[id]')].map((e) => e.id)
          return all.filter((id, i) => all.indexOf(id) !== i)
        })
        if (ids.length > 0) findings.push(`${state.name}: duplicate ids ${ids.join(', ')}`)
        // Every region and list has a name or is a plain list; headings stay in order
        const structure = await page.evaluate(() => {
          const unnamed = [...document.querySelectorAll('section[aria-labelledby], [role="region"]')].filter((el) => {
            const by = el.getAttribute('aria-labelledby')
            return !el.getAttribute('aria-label') && !(by && document.getElementById(by)?.textContent?.trim())
          }).length
          const levels = [...document.querySelectorAll('main h1, main h2, main h3, section h1, section h2, section h3')].map((h) => Number(h.tagName.slice(1)))
          const skipped = levels.some((l, i) => i > 0 && l - (levels[i - 1] as number) > 1)
          return { unnamed, skipped }
        })
        if (structure.unnamed > 0 || structure.skipped) findings.push(`${state.name}: structure ${JSON.stringify(structure)}`)
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
  min: 4.5 | 3
  /** Move the pointer over this locator first (the hover colours). */
  hover?: (page: Page) => Locator
}
const card = (p: Page) => chainCard(p, 'AI & Semis')
const oil = (p: Page) => chainCard(p, 'Oil & Gas')
const dialogOf = (p: Page) => p.getByRole('dialog')

const PROBES: Probe[] = [
  { label: 'Held badge', state: 'page-filled', min: 4.5, find: (p) => card(p).locator('[data-slot="badge"]', { hasText: /^Held$/ }).first() },
  { label: 'lane counts line', state: 'page-filled', min: 4.5, find: (p) => laneIn(card(p), 'Upstream').locator('p').first() },
  { label: 'chain summary', state: 'page-filled', min: 4.5, find: (p) => chainSummary(card(p)) },
  { label: 'Also spelled', state: 'page-filled', min: 4.5, find: (p) => card(p).getByText('Also spelled: ai & semis') },
  { label: 'entry value text', state: 'page-filled', min: 4.5, find: (p) => laneIn(card(p), 'Upstream').getByRole('link', { name: /^ASML/ }).locator('span.tabular-nums') },
  { label: 'No stocks', state: 'page-filled', min: 4.5, find: (p) => laneIn(oil(p), 'Downstream').getByText('No stocks') },
  { label: 'entry name and market', state: 'page-filled', min: 4.5, find: (p) => laneIn(card(p), 'Upstream').getByRole('link', { name: /^ASML/ }).locator('span.text-muted-foreground') },
  {
    label: 'entry name and market on hover',
    state: 'page-filled',
    min: 4.5,
    hover: (p) => laneIn(card(p), 'Upstream').getByRole('link', { name: /^ASML/ }),
    find: (p) => laneIn(card(p), 'Upstream').getByRole('link', { name: /^ASML/ }).locator('span.text-muted-foreground'),
  },
  { label: 'Stocks ghost button', state: 'page-filled', min: 4.5, find: (p) => card(p).getByRole('link', { name: /^Stocks/ }) },
  { label: 'Stocks ghost button on hover', state: 'page-filled', min: 4.5, hover: (p) => card(p).getByRole('link', { name: /^Stocks/ }), find: (p) => card(p).getByRole('link', { name: /^Stocks/ }) },
  { label: 'Rename outline button', state: 'page-filled', min: 4.5, find: (p) => card(p).getByRole('button', { name: 'Rename' }) },
  { label: 'Rename outline button on hover', state: 'page-filled', min: 4.5, hover: (p) => card(p).getByRole('button', { name: 'Rename' }), find: (p) => card(p).getByRole('button', { name: 'Rename' }) },
  { label: 'no-chain note link', state: 'page-filled', min: 4.5, find: (p) => p.getByRole('link', { name: 'Show them' }) },
  { label: 'rate note link', state: 'page-rate-and-left-out-notes', min: 4.5, find: (p) => p.getByRole('link', { name: 'Set rate on Concentration' }) },
  { label: 'left-out line', state: 'page-filled', min: 4.5, find: (p) => oil(p).getByText(/left out of the value/) },
  { label: 'advice note', state: 'page-filled', min: 4.5, find: (p) => p.getByText(/not advice/) },
  { label: 'rename dialog hint', state: 'rename-dialog-name-step', min: 4.5, find: (p) => dialogOf(p).getByText(/^Changes the name on/) },
  { label: 'rename dialog field error', state: 'rename-dialog-field-error', min: 4.5, find: (p) => dialogOf(p).getByText('Enter a name of 1 to 60 characters.') },
  { label: 'rename dialog alert text', state: 'rename-dialog-server-error-alert', min: 4.5, find: (p) => dialogOf(p).getByRole('alert').getByText("Couldn't rename the chain. Try again.") },
  { label: 'gone alert title', state: 'rename-dialog-gone-alert', min: 4.5, find: (p) => dialogOf(p).getByText('This chain no longer exists.') },
  { label: 'merge primary button', state: 'rename-dialog-merge-step', min: 4.5, find: (p) => dialogOf(p).getByRole('button', { name: /^Merge \d+ stocks$/ }) },
]

test.describe('measured contrast of the value chains page and dialog', () => {
  let ctx: VcCtx
  test.beforeAll(async () => {
    ctx = await seedForChains()
  })
  test.afterEach(async ({ page }) => page.unrouteAll({ behavior: 'ignoreErrors' }))

  for (const scheme of SCHEMES) {
    test(`TC-E-919: text on the page and the dialog measures at least 4.5:1 in ${scheme} mode`, async ({ page }) => {
      test.setTimeout(300_000)
      const measured: Record<string, number> = {}
      const failures: string[] = []
      let current = ''
      for (const probe of PROBES) {
        if (probe.state !== current) {
          current = probe.state
          await enterVc(page, VC_STATES.find((s) => s.name === probe.state)!, ctx)
          await applyScheme(page, scheme)
        }
        const target = probe.find(page).first()
        await expect(target, probe.label).toBeVisible()
        if (probe.hover) {
          await probe.hover(page).hover()
          await page.waitForTimeout(350)
        }
        const result = await measureContrast(target)
        if (probe.hover) await page.mouse.move(0, 0)
        measured[probe.label] = result.ratio
        if (result.ratio < probe.min) failures.push(`${probe.label}: ${result.ratio}:1 < ${probe.min}:1 (${result.fg} on ${result.bg})`)
      }
      console.log(`TC-E-919 ${scheme}: ${JSON.stringify(measured)}`)
      expect(failures).toEqual([])
    })

    test(`TC-E-919: the keyboard focus ring of an entry and of the Stocks link reaches 3:1 in ${scheme} mode`, async ({ page }) => {
      test.setTimeout(120_000)
      await enterVc(page, VC_STATES.find((s) => s.name === 'page-filled')!, ctx)
      await applyScheme(page, scheme)
      await page.keyboard.press('Tab') // keyboard modality, so :focus-visible applies
      const results: Record<string, string> = {}
      for (const [label, target] of [
        ['entry', laneIn(card(page), 'Upstream').getByRole('link', { name: /^ASML/ })],
        ['Stocks link', card(page).getByRole('link', { name: /^Stocks/ })],
      ] as const) {
        await target.focus()
        await page.waitForTimeout(250)
        const ring = await focusRingContrast(target)
        results[label] = ring ? `${ring.ratio}:1 ${ring.kind}` : 'none'
        expect(ring, `${label} draws a focus indicator`).not.toBeNull()
        expect(ring?.ratio ?? 0, `${label}: ${ring?.all}`).toBeGreaterThanOrEqual(3)
      }
      console.log(`TC-E-919 ${scheme} focus rings: ${JSON.stringify(results)}`)
    })

    // Finding F-VC-1: the outline Rename button's focus ring is 2.68:1 in dark mode (the outline variant's own dark
    // border wins over focus-visible:border-ring, as on the Settings button of /concentration). Left to the owner.
    const rename = scheme === 'dark' ? test.fail : test
    rename(`TC-E-919: the keyboard focus ring of Rename reaches 3:1 in ${scheme} mode${scheme === 'dark' ? ' [F-VC-1]' : ''}`, async ({ page }) => {
      test.setTimeout(120_000)
      await enterVc(page, VC_STATES.find((s) => s.name === 'page-filled')!, ctx)
      await applyScheme(page, scheme)
      await page.keyboard.press('Tab')
      const target = card(page).getByRole('button', { name: 'Rename' })
      await target.focus()
      await page.waitForTimeout(250)
      const ring = await focusRingContrast(target)
      console.log(`TC-E-919 ${scheme} Rename focus ring: ${ring?.ratio}:1 ${ring?.kind ?? 'none'}`)
      expect(ring, 'a focus indicator is drawn').not.toBeNull()
      expect(ring?.ratio ?? 0).toBeGreaterThanOrEqual(3)
    })
  }
})
