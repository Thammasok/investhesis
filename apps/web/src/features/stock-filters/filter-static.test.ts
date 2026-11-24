import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (dir: string) =>
  readdirSync(dir)
    .filter((f) => /\.(ts|tsx)$/.test(f) && !/\.test\./.test(f))
    .map((f) => [join(dir, f), readFileSync(join(dir, f), 'utf8')] as const)

describe('search, filters and export stay on the device', () => {
  it('TC-C-528 the filter and export code makes no network call of its own and names no third party', () => {
    const web = join(import.meta.dirname, '..')
    const domain = join(import.meta.dirname, '../../../../../packages/domain/src')
    const files = [
      ...read(join(web, 'stock-filters')),
      ...read(join(web, 'exports')),
      ...['filters.ts', 'export.ts'].map((f) => [join(domain, f), readFileSync(join(domain, f), 'utf8')] as const),
    ]
    expect(files.length).toBeGreaterThan(10)
    const banned = [/\bfetch\s*\(/, /XMLHttpRequest/, /sendBeacon/, /WebSocket/, /https?:\/\//, /analytics|gtag|segment|mixpanel|sentry/i]
    for (const [file, text] of files) {
      for (const re of banned) {
        // The one allowed network use is the backup card's bearer-token download through the api client.
        expect(re.test(text) && !file.endsWith('backup-card.tsx'), `${file} matches ${re}`).toBe(false)
      }
    }
    const card = readFileSync(join(web, 'exports/backup-card.tsx'), 'utf8')
    expect(card).toContain("api.download(`/exports/backup.")
    const imports = files.flatMap(([, text]) => [...text.matchAll(/from '([^']+)'/g)].map((m) => m[1] as string))
    expect(imports.filter((i) => !i.startsWith('.') && !i.startsWith('@/'))).toEqual(
      expect.not.arrayContaining(['axios', 'ky', 'got', 'node-fetch']),
    )
  })
})
