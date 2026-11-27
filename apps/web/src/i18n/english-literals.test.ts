import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ENGLISH_LITERAL_ALLOW_LIST } from '@/test/english-literal-allow-list'
import { scanSource } from '@/test/english-literals'

const srcRoot = join(import.meta.dirname, '..')
const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : e.name.endsWith('.tsx') && !/\.test\./.test(e.name) ? [join(dir, e.name)] : [],
  )

describe('English literals in components', () => {
  it('TC-U-1034: the scan reports JSX text and string attributes, and passes t() calls', () => {
    const bad = `export const A = () => (\n  <div>\n    <p>Hello</p>\n    <button aria-label="Close" />\n  </div>\n)\n`
    const good = `export const B = () => (\n  <div>\n    <p>{t('x')}</p>\n    <span data-testid="y" />\n    <b>Investhesis</b>\n    <i>{count} · 3%</i>\n  </div>\n)\n`
    expect(scanSource(bad)).toEqual([
      { line: 3, text: 'Hello' },
      { line: 4, text: 'aria-label="Close"' },
    ])
    expect(scanSource(good)).toEqual([])
  })

  it('TC-U-1034: only the files on the allow-list hold English literals, and each listed file still does', () => {
    const withFindings = walk(srcRoot)
      .filter((file) => scanSource(readFileSync(file, 'utf8')).length > 0)
      .map((file) => relative(srcRoot, file))
      .sort()
    const listed = [...ENGLISH_LITERAL_ALLOW_LIST].sort()
    expect(withFindings.filter((f) => !listed.includes(f)), 'new English literals (use t)').toEqual([])
    expect(listed.filter((f) => !withFindings.includes(f)), 'translated: remove from the allow-list').toEqual([])
  })
})
