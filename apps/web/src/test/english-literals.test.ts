import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ENGLISH_LITERAL_ALLOW_LIST } from './english-literal-allow-list'
import { scanSource } from './english-literals'

const SRC = join(import.meta.dirname, '..')

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return name === 'test' ? [] : sourceFiles(path)
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : []
  })
}

describe('English literals', () => {
  it('TC-U-1034: the scan reports JSX text and attribute literals and passes translated text', () => {
    const bad = `export const A = () => <p>Hello</p>\nexport const B = () => <button aria-label="Close" />`
    const good = `export const C = ({ t }) => <p data-testid="y" title={t('x')}>{t('x')} Investhesis</p>`
    expect(scanSource('bad.tsx', bad)).toEqual([
      { file: 'bad.tsx', line: 1, text: 'Hello' },
      { file: 'bad.tsx', line: 2, text: 'Close' },
    ])
    expect(scanSource('good.tsx', good)).toEqual([])
  })

  it('TC-U-1034: only allow-listed files hold English literals, and no entry is stale', () => {
    const found = new Set<string>()
    for (const path of sourceFiles(SRC)) {
      const relative = path.slice(SRC.length + 1)
      if (scanSource(relative, readFileSync(path, 'utf8')).length > 0) found.add(relative)
    }
    const listed = new Set(ENGLISH_LITERAL_ALLOW_LIST)
    expect([...found].filter((f) => !listed.has(f))).toEqual([])
    expect([...listed].filter((f) => !found.has(f))).toEqual([])
  })

  it('i18next is imported only under src/i18n/', () => {
    const offenders = sourceFiles(SRC).filter((path) => {
      const relative = path.slice(SRC.length + 1)
      if (relative.startsWith('i18n/') || relative === 'routers/route-handle.ts') return false
      return /from ['"]i18next['"]/.test(readFileSync(path, 'utf8')) && !/import type/.test(readFileSync(path, 'utf8').match(/.*from ['"]i18next['"]/)?.[0] ?? '')
    })
    expect(offenders).toEqual([])
  })
})
