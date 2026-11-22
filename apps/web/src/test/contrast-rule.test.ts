import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = path.resolve(import.meta.dirname, '..')

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name)
    return statSync(full).isDirectory() ? walk(full) : [full]
  })
}

// shadcn's own components (components/ui) are generated; the rule covers what we write.
const sources = walk(SRC).filter(
  (f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f) && !f.includes(`${path.sep}components${path.sep}ui${path.sep}`),
)

/** Every quoted string of a file with its line, to look at one class list at a time. */
function classLists(file: string): { line: number; text: string }[] {
  const text = readFileSync(file, 'utf8')
  const found: { line: number; text: string }[] = []
  for (const match of text.matchAll(/"([^"\n]*)"|'([^'\n]*)'|`([^`]*)`/g)) {
    const line = text.slice(0, match.index).split('\n').length
    found.push({ line, text: match[1] ?? match[2] ?? match[3] ?? '' })
  }
  return found
}

describe('contrast rule (ux-design.md §Shared patterns)', () => {
  it('TC-C-180: text-muted-foreground is never on bg-muted', () => {
    const offenders = sources.flatMap((file) =>
      classLists(file)
        .filter(({ text }) => /(?<![\w:/-])text-muted-foreground\b/.test(text) && /(?<![\w:/-])bg-muted(?![\w/-])/.test(text))
        .map(({ line }) => `${path.relative(SRC, file)}:${line}`),
    )
    expect(offenders).toEqual([])
  })

  it('TC-C-180: table headers of the stock table sit on bg-background', () => {
    const file = path.join(SRC, 'features/stocks/components/stock-table.tsx')
    const text = readFileSync(file, 'utf8')
    const heads = [...text.matchAll(/<(?:TableHead|SortHead)\b[^>]*>/g)].map((m) => m[0])
    expect(heads.length).toBeGreaterThan(0)
    // SortHead and the plain heads each end up with bg-background (SortHead adds it itself).
    expect(text.match(/bg-background/g)?.length).toBeGreaterThanOrEqual(2)
    for (const head of heads.filter((h) => h.startsWith('<TableHead'))) expect(head).toContain('bg-background')
    expect(text).not.toMatch(/bg-muted(?![\w/-])/)
  })
})
