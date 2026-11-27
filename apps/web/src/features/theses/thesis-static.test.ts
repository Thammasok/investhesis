import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : /\.(ts|tsx)$/.test(e.name) && !/\.test\./.test(e.name) ? [join(dir, e.name)] : [],
  )

const srcRoot = join(import.meta.dirname, '..', '..')
const thesisFiles = walk(import.meta.dirname)
// The stock page pieces that touch entries.
const pageFiles = [
  join(srcRoot, 'views', 'stock-detail.tsx'),
  join(srcRoot, 'features', 'stocks', 'stocks-data.ts'),
  join(srcRoot, 'features', 'stocks', 'components', 'delete-stock-dialog.tsx'),
]
const read = (file: string) => readFileSync(file, 'utf8')

describe('thesis text is never run as markup', () => {
  it('TC-C-713: the thesis and stock page sources never use innerHTML-style APIs, a markdown renderer, a parser or a raw network call, and never log text', () => {
    expect(thesisFiles.length).toBeGreaterThan(3)
    for (const file of [...thesisFiles, ...pageFiles]) {
      const text = read(file)
      expect(text, file).not.toMatch(/dangerouslySetInnerHTML|\.innerHTML|insertAdjacentHTML|DOMParser|['"](react-markdown|marked|dompurify)['"]/i)
      expect(text, file).not.toMatch(/\bconsole\.log\b/)
    }
    // Every request goes through the ApiClient (`api.get`, `api.post`, ...): no fetch or XHR in the thesis code.
    for (const file of thesisFiles) expect(read(file), file).not.toMatch(/(^|[^.\w])fetch\(|XMLHttpRequest/)
  })

  it('TC-C-733: the entry dialog scrolls inside a 90svh box from sm:max-w-lg, and Add entry has an icon and text', () => {
    const dialog = read(join(import.meta.dirname, 'components', 'thesis-dialog.tsx'))
    for (const token of ['sm:max-w-lg', 'max-h-[90svh]', 'overflow-y-auto']) expect(dialog).toContain(token)
    const section = read(join(import.meta.dirname, 'components', 'thesis-section.tsx'))
    expect(section).toMatch(/<PlusIcon aria-hidden="true" \/>\s*Add entry/)
  })
})
