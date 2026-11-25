import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : /\.(ts|tsx)$/.test(e.name) && !/\.test\./.test(e.name) ? [join(dir, e.name)] : [],
  )

describe('thesis text is never run as markup', () => {
  it('TC-C-700: features/theses never uses dangerouslySetInnerHTML, innerHTML or a markdown renderer', () => {
    const files = walk(import.meta.dirname)
    expect(files.length).toBeGreaterThan(3)
    for (const file of files) {
      const text = readFileSync(file, 'utf8')
      expect(text, file).not.toMatch(/dangerouslySetInnerHTML|\.innerHTML|insertAdjacentHTML|react-markdown|marked|dompurify/i)
    }
  })
})
