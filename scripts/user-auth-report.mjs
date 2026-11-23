// Pass/fail per TC id for a User Auth feature folder, from real runs.
//   node scripts/user-auth-report.mjs [docs/features/user-auth/v1.2]
// Inputs (repo root): `pnpm test:report:unit` (Vitest JSON in e2e/.output/vitest/) and `pnpm test:e2e` (e2e/.output/report.json).
// The ids are the case headings of the folder's test-cases.md. A result counts when its title contains the id, so the ids
// of that folder must be unique across the repo (v1.2 uses the 3xx range). Cases listed in MANUAL are checked by hand.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = join(import.meta.dirname, '..')
const out = join(root, 'e2e/.output')
const feature = join(root, process.argv[2] ?? 'docs/features/user-auth/v1.2')
const MANUAL = new Set(['TC-A-317'])

const ids = new Set([...readFileSync(join(feature, 'test-cases.md'), 'utf8').matchAll(/^### (TC-[UACE]-\d+)/gm)].map((m) => m[1]))

/** @type {Map<string, {file:string,title:string,status:'pass'|'fail'|'expected-fail'|'skip'}[]>} */
const results = new Map()
const add = (file, title, status) => {
  for (const id of new Set(title.match(/TC-[UACE]-\d+/g) ?? [])) {
    if (ids.has(id)) results.set(id, [...(results.get(id) ?? []), { file, title, status }])
  }
}

const vitestDir = join(out, 'vitest')
for (const f of existsSync(vitestDir) ? readdirSync(vitestDir) : []) {
  const json = JSON.parse(readFileSync(join(vitestDir, f), 'utf8'))
  for (const suite of json.testResults)
    for (const t of suite.assertionResults)
      add(suite.name.replace(`${root}/`, ''), t.fullName ?? t.title, t.status === 'passed' ? 'pass' : t.status === 'failed' ? 'fail' : 'skip')
}

const pw = join(out, 'report.json')
if (existsSync(pw)) {
  const walk = (suite, file) => {
    for (const spec of suite.specs ?? [])
      for (const t of spec.tests) {
        const last = t.results.at(-1)?.status
        const status = t.status === 'expected' && t.expectedStatus === 'failed' ? 'expected-fail' : t.status === 'expected' ? 'pass' : t.status === 'skipped' ? 'skip' : 'fail'
        add(`e2e/${spec.file ?? file}`, spec.title, last === undefined ? 'skip' : status)
      }
    for (const s of suite.suites ?? []) walk(s, suite.file ?? file)
  }
  for (const s of JSON.parse(readFileSync(pw, 'utf8')).suites) walk(s, s.file)
}

const rank = { fail: 3, skip: 2, 'expected-fail': 1, pass: 0 }
let automated = 0
let failing = 0
const rows = [...ids].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).map((id) => {
  const list = results.get(id) ?? []
  const worst = list.reduce((w, r) => (rank[r.status] > rank[w] ? r.status : w), 'pass')
  const where = [...new Set(list.map((r) => r.file.replace(/^.*\/(apps|scripts|e2e|packages)\//, '$1/')))].join(', ')
  let verdict
  if (list.length === 0) verdict = MANUAL.has(id) ? 'MANUAL' : 'NOT AUTOMATED'
  else verdict = worst === 'fail' ? 'FAIL' : worst === 'skip' ? 'SKIPPED' : worst === 'expected-fail' ? 'pass + expected failure' : 'pass'
  if (list.length) automated++
  if (['FAIL', 'SKIPPED', 'NOT AUTOMATED'].includes(verdict)) failing++
  return `| ${id} | ${list.length} | ${verdict} | ${where} |`
})
console.log(`Automated ${automated} of ${ids.size} ids (${[...MANUAL].filter((i) => ids.has(i)).length} manual); not passing: ${failing}\n`)
console.log('| TC | tests | result | files |\n|---|---|---|---|')
console.log(rows.join('\n'))
process.exitCode = failing ? 1 : 0
