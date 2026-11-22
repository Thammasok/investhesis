import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Locator, type Page } from '@playwright/test'
import { measureContrast } from './lib/contrast.ts'
import { apiAs, newUser, openSignedIn, settled, us } from './lib/sl.ts'
import { enter, seedForScreens, STATES, type Ctx } from './lib/states.ts'

const SCHEMES = ['light', 'dark'] as const
type Scheme = (typeof SCHEMES)[number]

/** The app has no theme switch yet: dark tokens apply through the `.dark` class, so set it with the media preference. */
async function applyScheme(page: Page, scheme: Scheme) {
  await page.emulateMedia({ colorScheme: scheme })
  await page.evaluate((dark) => document.documentElement.classList.toggle('dark', dark), scheme === 'dark')
  await page.waitForTimeout(350) // transitions settle before colours are measured
  expect(await page.evaluate(() => document.documentElement.classList.contains('dark'))).toBe(scheme === 'dark')
}

let ctx: Ctx
test.beforeAll(async () => {
  ctx = { ...(await seedForScreens()), empty: await newUser('e2e-sl-empty') }
})

const stateNamed = (name: string) => STATES.find((s) => s.name === name)!

/**
 * Findings F-2 (light) and F-3 (dark): the delete confirm buttons are the one place axe reports a
 * contrast failure, so they are pinned below and left out of the general scan. Anything else fails it.
 */
const isDeleteConfirm = (html: string) => html.includes('data-slot="alert-dialog-action"')

test.describe('axe on every screen and state', () => {
  for (const scheme of SCHEMES) {
    test(`TC-E-124: no axe violations on any stock-lists screen or state in ${scheme} mode`, async ({ page }) => {
      test.setTimeout(240_000)
      const findings: string[] = []
      const unresolved: string[] = []
      for (const state of STATES) {
        await enter(page, state, ctx)
        await applyScheme(page, scheme)
        const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()
        for (const v of result.violations) {
          const nodes = v.nodes.filter((n) => !(v.id === 'color-contrast' && isDeleteConfirm(n.html)))
          if (nodes.length > 0) findings.push(`${state.name}: ${v.id} (${nodes.length}): ${nodes[0]?.target.join(' ')} ${JSON.stringify(nodes[0]?.any[0]?.data ?? {})}`)
        }
        // A contrast result axe could not decide must not hide a tinted control. Behind a dialog scrim axe cannot
        // decide for the page, so for overlay states only the overlay itself is checked (and must be decided).
        const overlay = /dialog|popover/.test(state.name)
        const undecided = overlay
          ? (await new AxeBuilder({ page }).withTags(['wcag2aa']).include('[data-slot="alert-dialog-content"], [data-slot="dialog-content"], [data-slot="popover-content"]').analyze()).incomplete
          : result.incomplete
        for (const v of undecided.filter((i) => i.id === 'color-contrast')) {
          for (const n of v.nodes) unresolved.push(`${state.name}: ${n.target.join(' ')}`)
        }
      }

      expect(findings).toEqual([])
      expect(unresolved).toEqual([])
    })
  }

  // Findings F-2 (light) and F-3 (dark); the matching TC-E-125 cases hold the measured ratios.
  for (const scheme of SCHEMES) {
    test.fail(`TC-E-124 [${scheme === 'light' ? 'F-2' : 'F-3'}]: the delete confirm buttons have no axe contrast violation in ${scheme} mode`, async ({ page }) => {
      const violations: string[] = []
      for (const name of ['stock-delete-dialog', 'list-delete-dialog']) {
        await enter(page, stateNamed(name), ctx)
        await applyScheme(page, scheme)
        const result = await new AxeBuilder({ page }).withTags(['wcag2aa']).include('[data-slot="alert-dialog-content"]').analyze()
        violations.push(...result.violations.map((v) => `${name}: ${v.id}`))
      }

      expect(violations).toEqual([])
    })
  }
})

type Probe = {
  label: string
  state: string
  find: (page: Page) => Locator
  /** Extra steps before measuring: hover, focus. */
  act?: (page: Page, target: Locator) => Promise<void>
  /** Expected-failure finding and the ratio measured when it was pinned, per theme. */
  known?: Partial<Record<Scheme, string>>
}

const dialogDelete = (page: Page) => page.getByRole('alertdialog').getByRole('button', { name: 'Delete' })
const hover = async (_page: Page, target: Locator) => target.hover()
const focusVisible = async (page: Page, target: Locator) => {
  await page.mouse.move(0, 0)
  for (let i = 0; i < 5 && !(await target.evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press('Tab')
}

const PROBES: Probe[] = [
  { label: 'delete-stock confirm button (rest)', state: 'stock-delete-dialog', find: dialogDelete, known: { light: 'F-2: 1.25:1', dark: 'F-3: 4.26:1' } },
  { label: 'delete-stock confirm button (hover)', state: 'stock-delete-dialog', find: dialogDelete, act: hover, known: { dark: 'F-3: 3.55:1' } },
  {
    label: 'delete-stock confirm button (focus-visible)',
    state: 'stock-delete-dialog',
    find: dialogDelete,
    act: focusVisible,
    known: { light: 'F-2: 1.25:1', dark: 'F-3: 4.26:1' },
  },
  { label: 'delete-list confirm button (rest)', state: 'list-delete-dialog', find: dialogDelete, known: { light: 'F-2: 1.25:1', dark: 'F-3: 4.26:1' } },
  { label: 'delete-list confirm button (hover)', state: 'list-delete-dialog', find: dialogDelete, act: hover, known: { dark: 'F-3: 3.55:1' } },
  {
    label: 'delete-list confirm button (focus-visible)',
    state: 'list-delete-dialog',
    find: dialogDelete,
    act: focusVisible,
    known: { light: 'F-2: 1.25:1', dark: 'F-3: 4.26:1' },
  },
  {
    label: 'destructive menu item (highlighted)',
    state: 'stock-detail-default-badge',
    find: (page) => page.getByRole('menuitem', { name: 'Delete' }),
    act: async (page) => {
      await page.getByRole('button', { name: 'More actions' }).focus()
      await page.keyboard.press('Enter')
      await page.getByRole('menuitem', { name: 'Delete' }).focus()
    },
    known: { light: 'F-4: 4.28:1' },
  },
  { label: 'error status badge in a preview row', state: 'import-step2-all-statuses', find: (p) => p.locator('tbody [data-slot="badge"]', { hasText: 'Error' }).first() },
  { label: 'error count badge in the preview', state: 'import-step2-all-statuses', find: (p) => p.locator('[data-slot="badge"]', { hasText: /^1 error$/ }) },
  { label: 'error row text on its tint', state: 'import-step2-all-statuses', find: (p) => p.locator('tbody tr', { hasText: 'BAD' }).locator('td').nth(1) },
  { label: 'error row detail on its tint', state: 'import-step2-all-statuses', find: (p) => p.locator('tbody tr', { hasText: 'BAD' }).locator('td').last().locator('li').first() },
  { label: 'destructive Alert text (duplicate stock)', state: 'stock-new-409-alert', find: (p) => p.getByRole('alert') },
  { label: 'destructive Alert text (file error)', state: 'import-step1-file-error', find: (p) => p.getByRole('alert').locator('[data-slot="alert-description"]') },
  { label: 'field error text on a card', state: 'stock-new-field-errors', find: (p) => p.locator('#stock-ticker-error') },
  { label: 'muted-foreground hint on a card (import limits)', state: 'import-step1-clean', find: (p) => p.locator('#import-limits') },
  { label: 'muted-foreground hint on a card (index membership)', state: 'stock-new-clean', find: (p) => p.getByText('Choose a market to see its indexes.') },
]

test.describe('measured contrast of tinted destructive controls', () => {
  for (const probe of PROBES) {
    for (const scheme of SCHEMES) {
      const known = probe.known?.[scheme]
      const run = known ? test.fail : test
      const tag = known ? ` [${known.split(':')[0]}]` : ''
      const note = known ? ` (measured ${known.split(': ')[1]})` : ''
      run(`TC-E-125${tag}: ${probe.label} is at least 4.5:1 in ${scheme} mode${note}`, async ({ page }) => {
        // Arrange
        await enter(page, stateNamed(probe.state), ctx)
        await applyScheme(page, scheme)
        const target = probe.find(page).first()

        // Act
        await probe.act?.(page, target)
        await expect(target).toBeVisible()
        await page.waitForTimeout(350)
        const measured = await measureContrast(target)
        console.log(`TC-E-125 ${scheme} ${probe.label}: ${measured.ratio}:1 (${measured.fg} on ${measured.bg}) "${measured.text}"`)

        // Assert
        expect(measured.ratio).toBeGreaterThanOrEqual(4.5)
      })
    }
  }
})

test.describe('stocks table with 200 stocks', () => {
  test('TC-E-126: renders and re-sorts 200 stocks within 200 ms (median of 5, no CPU throttling)', async ({ page }) => {
    test.setTimeout(180_000)
    // Arrange: 200 stocks through the API
    const user = await newUser()
    const api = await apiAs(user)
    for (let from = 0; from < 200; from += 10) {
      await Promise.all(
        Array.from({ length: 10 }, (_, i) => {
          const n = from + i
          return api.stock(us(`T${String(n).padStart(3, '0')}`, { name: `Company ${(n * 7919) % 200}`, gicsSector: n % 3 === 0 ? 'Energy' : n % 3 === 1 ? 'Financials' : null }))
        }),
      )
    }
    await page.addInitScript(() => {
      const w = window as unknown as { __lastApi: number; __rowsAt: number; __long: number[] }
      w.__lastApi = 0
      w.__rowsAt = 0
      w.__long = []
      const nativeFetch = window.fetch
      window.fetch = async (...args) => {
        const res = await nativeFetch(...args)
        if (String(args[0]).includes('/api/')) w.__lastApi = performance.now()
        return res
      }
      new PerformanceObserver((list) => list.getEntries().forEach((e) => w.__long.push(e.duration))).observe({ entryTypes: ['longtask'] })
      new MutationObserver(() => {
        if (!w.__rowsAt && document.querySelectorAll('tbody tr').length >= 200) w.__rowsAt = performance.now()
      }).observe(document, { childList: true, subtree: true })
    })
    await openSignedIn(page, user, '/stocks')
    await page.waitForFunction(() => (window as unknown as { __rowsAt: number }).__rowsAt > 0)

    // Act: render time after the data arrived, then alternate sorts
    const render = await page.evaluate(() => {
      const w = window as unknown as { __lastApi: number; __rowsAt: number }
      return w.__rowsAt - w.__lastApi
    })
    const sorts: number[] = []
    for (let i = 0; i < 5; i++) {
      for (const column of ['Name', 'Sector']) {
        const ms = await page.evaluate(
          (label) =>
            new Promise<number>((resolve) => {
              const button = document.querySelector<HTMLButtonElement>(`button[aria-label="Sort by ${label}"]`)!
              const t0 = performance.now()
              button.click()
              requestAnimationFrame(() => requestAnimationFrame(() => resolve(performance.now() - t0)))
            }),
          column,
        )
        sorts.push(ms)
      }
    }
    const longTasks = await page.evaluate(() => (window as unknown as { __long: number[] }).__long)
    const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!
    console.log(`TC-E-126 render ${Math.round(render)} ms, sort median ${Math.round(median(sorts))} ms, max ${Math.round(Math.max(...sorts))} ms, long tasks ${JSON.stringify(longTasks.map(Math.round))}`)

    // Assert
    await settled(page)
    await expect(page.locator('tbody tr')).toHaveCount(200)
    expect(render).toBeLessThan(200)
    expect(median(sorts)).toBeLessThan(200)
    expect(longTasks.filter((d) => d > 200)).toEqual([])
  })
})
