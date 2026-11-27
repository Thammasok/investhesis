import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const srcRoot = join(import.meta.dirname, '..')
const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : /\.tsx?$/.test(e.name) ? [join(dir, e.name)] : [],
  )

describe('i18next stays behind src/i18n', () => {
  it('TC-U-1027: only files under src/i18n/ import i18next (the oxlint rule says the same)', () => {
    const importers = walk(srcRoot)
      .filter((file) => /from ['"]i18next['"]|import\(['"]i18next['"]\)/.test(readFileSync(file, 'utf8')))
      .map((file) => relative(srcRoot, file))
    expect(importers.filter((f) => !f.startsWith('i18n/'))).toEqual([])
  })
})
