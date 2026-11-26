import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { apiOf, chainRegion, laneOf, openChains, vcA } from './cases-helpers'

vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }), Toaster: () => null }))

const SRC = join(import.meta.dirname, '../..')
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f)
    return statSync(p).isDirectory() ? walk(p) : [p]
  })
const sources = (dir: string) => walk(dir).filter((f) => /\.(ts|tsx)$/.test(f) && !/\.test\./.test(f) && !/cases-helpers/.test(f))
const CHAIN_FILES = sources(join(SRC, 'features/chains'))
const CHANGED = [
  'features/concentration/components/controls.tsx',
  'features/concentration/components/group-table.tsx',
  'features/concentration/concentration-data.ts',
  'features/concentration/concentration-model.ts',
  'features/stock-filters/use-filter-state.ts',
  'features/stock-filters/portfolio.ts',
  'features/stock-filters/scope.ts',
  'features/stock-filters/scope-select.tsx',
  'views/chains.tsx',
  'views/concentration.tsx',
].map((f) => join(SRC, f))
const SCANNED = [...CHAIN_FILES, ...CHANGED]
const text = (f: string) => readFileSync(f, 'utf8')
const nameOf = (f: string) => relative(SRC, f)

describe('static rules of the slice', () => {
  it('TC-C-927 no raw HTML, no network of its own, no console, no float maths on money, no supabase import', () => {
    expect(CHAIN_FILES.length).toBeGreaterThanOrEqual(8)
    const banned: [string, RegExp][] = [
      ['dangerouslySetInnerHTML', /dangerouslySetInnerHTML/],
      ['innerHTML', /\binnerHTML\b/],
      ['insertAdjacentHTML', /insertAdjacentHTML/],
      ['DOMParser', /DOMParser/],
      ['markdown library', /from '(react-markdown|marked|markdown-it|remark[\w-]*|rehype[\w-]*|showdown)'/],
      ['fetch', /\bfetch\s*\(/],
      ['XMLHttpRequest', /XMLHttpRequest/],
      ['sendBeacon', /sendBeacon/],
      ['console', /\bconsole\.\w+/],
      ['parseFloat', /\bparseFloat\b/],
      ['parseInt', /\bparseInt\b/],
      ['Number(', /\bNumber\s*\(/],
      ['toFixed', /\.toFixed\b/],
      ['Math.round', /Math\.round/],
      ['multiplying a holding', /\b(shares|averageCost)\s*\*|\*\s*(shares|averageCost)\b/],
      ['supabase import', /@supabase\/supabase-js/],
    ]
    for (const file of SCANNED) for (const [label, re] of banned) expect(re.test(text(file)), `${nameOf(file)}: ${label}`).toBe(false)
  })

  it('TC-C-928 the lanes are a three column grid from md, with Integrated and No position full width after them', async () => {
    await openChains('/chains', apiOf([...vcA()]))

    const ai = chainRegion('AI & Semis')
    const grid = ai.querySelector('[class~="md:grid-cols-3"]') as HTMLElement
    expect(grid.className).toContain('grid')
    expect(grid.className).toContain('gap-4')
    expect(grid.className).toContain('md:grid-cols-3')
    const lanes = within(grid).getAllByRole('region')
    expect(lanes.map((l) => l.querySelector('h3')?.textContent)).toEqual(['Upstream', 'Midstream', 'Downstream'])
    for (const lane of lanes) {
      expect(lane.className).toContain('md:rounded-lg')
      expect(lane.className).toContain('md:border')
      expect(lane.className).toContain('md:p-3')
      expect(lane.className).not.toMatch(/(^|\s)(border|p-3|rounded-lg)(\s|$)/)
    }
    const order = within(ai).getAllByRole('region').map((l) => l.querySelector('h3')?.textContent)
    expect(order).toEqual(['Upstream', 'Midstream', 'Downstream', 'Integrated (spans every stage)'])
    expect(grid.contains(laneOf(ai, /^Integrated/))).toBe(false)
    for (const sep of ai.querySelectorAll('[data-slot="separator"]')) expect(sep.className).toContain('md:hidden')
    expect(ai.querySelector('[data-slot="card-action"]')?.className).toMatch(/flex flex-wrap gap-2/)
    expect(document.querySelector('.flex.flex-wrap.items-end.gap-4')).not.toBeNull()
    const oil = within(chainRegion('Oil & Gas')).getAllByRole('region').map((l) => l.querySelector('h3')?.textContent)
    expect(oil.slice(-1)).toEqual(['No position'])
  })

  it('TC-C-928 the folder uses no horizontal scroll, minimum width, fixed pixel width or no-wrap class', () => {
    for (const file of CHAIN_FILES) {
      const source = text(file)
      expect(source, nameOf(file)).not.toMatch(/overflow-x-|min-w-\[|whitespace-nowrap/)
      for (const m of source.matchAll(/(?<![\w-:])w-\[(\d+)px\]/g)) expect(Number(m[1]), `${nameOf(file)} ${m[0]}`).toBeLessThanOrEqual(320)
    }
  })

  it('TC-C-929 every spinner and transition in the folder has its reduced-motion pair', () => {
    for (const file of CHAIN_FILES) {
      const source = text(file)
      const spinners = [...source.matchAll(/<\w+[^>]*animate-spin[^>]*>/g)].map((m) => m[0])
      for (const spinner of spinners) expect(spinner, nameOf(file)).toContain('motion-reduce:animate-none')
      const transitions = (source.match(/(?<![:\w-])transition(-\w+)?\b/g) ?? []).length
      const paired = (source.match(/motion-reduce:transition-none/g) ?? []).length
      expect(transitions, nameOf(file)).toBeLessThanOrEqual(paired)
    }
    expect(CHAIN_FILES.some((f) => text(f).includes('animate-spin'))).toBe(true)
  })
})
