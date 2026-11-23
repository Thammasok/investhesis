import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = path.resolve(import.meta.dirname, '..')
const read = (file: string) => readFileSync(path.join(SRC, file), 'utf8')

describe('motion preferences on the new animations', () => {
  it.each([
    ['holding dialog Save', 'features/stocks/components/holding-dialog.tsx'],
    ['settings dialog Save', 'features/concentration/components/settings-dialog.tsx'],
    ['stock form Save', 'features/stocks/components/stock-form.tsx'],
  ])('TC-C-436: the %s spinner has motion-reduce:animate-none', (_name, file) => {
    const spinners = [...read(file).matchAll(/<Loader2Icon\b[^>]*>/g)].map((m) => m[0])

    expect(spinners.length).toBeGreaterThan(0)
    for (const spinner of spinners) {
      expect(spinner).toContain('animate-spin')
      expect(spinner).toContain('motion-reduce:animate-none')
    }
  })

  it('TC-C-436: the group chevron has motion-reduce:transition-none', () => {
    const chevron = /<ChevronRightIcon\b[^>]*?\/>/s.exec(read('features/concentration/components/group-table.tsx'))?.[0] ?? ''

    expect(chevron).toContain('transition-transform')
    expect(chevron).toContain('motion-reduce:transition-none')
  })

  it('TC-C-436: no animated class in the new files lacks its reduced-motion pair', () => {
    for (const file of ['features/stocks/components/holding-dialog.tsx', 'features/stocks/components/holding-card.tsx', 'features/concentration/components/settings-dialog.tsx', 'features/concentration/components/group-table.tsx']) {
      const text = read(file)
      expect((text.match(/animate-spin/g) ?? []).length, file).toBeLessThanOrEqual((text.match(/motion-reduce:animate-none/g) ?? []).length)
      expect((text.match(/(?<![:\w-])transition-\w+/g) ?? []).length, file).toBeLessThanOrEqual((text.match(/motion-reduce:transition-none/g) ?? []).length)
    }
  })
})
