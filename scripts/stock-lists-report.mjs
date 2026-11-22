// Builds the pass/fail-per-TC table of docs/features/stock-lists/v1.0/test-report.md from real runs.
//   node scripts/stock-lists-report.mjs            reads e2e/.output/vitest/*.json and e2e/.output/report.json
// Produce the inputs with (repo root):
//   pnpm test:report:unit   (Vitest JSON for domain, api, web)  and  pnpm test:e2e  (Playwright JSON)
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = join(import.meta.dirname, '..')
const out = join(root, 'e2e/.output')
const feature = join(root, 'docs/features/stock-lists/v1.0')

// The ids this feature owns: every case heading of test-cases.md and every dev-plan case.
const ids = new Set()
for (const [file, re] of [
  [join(feature, 'test-cases.md'), /^### (TC-[UACE]-\d+)/gm],
  [join(feature, 'dev-plan.md'), /^\s*- id: (TC-U-\d+)/gm],
]) for (const m of readFileSync(file, 'utf8').matchAll(re)) ids.add(m[1])

// User Auth owns TC-U-001..042, TC-A-001..032, TC-C-001..051, TC-E-001..028 (test-cases G-1). A result counts for
// this feature only when it comes from one of its files; the auth-owned api-client tests are not among them.
const OURS = [
  /packages\/domain\//, /apps\/api\/src\/db\/(stock-lists|schema)/, /apps\/api\/test\/db\.test/, /apps\/api\/src\/modules\/(stocks|lists|imports)\//,
  /apps\/web\/src\/features\/(stocks|lists|imports)\//, /apps\/web\/src\/routers\//, /apps\/web\/src\/test\/contrast-rule/,
  /apps\/web\/src\/lib\/api-client\.test/, /scripts\/stock-lists-integration/, /e2e\/sl-/,
]
const ours = (file, id) => OURS.some((r) => r.test(file)) && !(/api-client\.test/.test(file) && ['TC-U-017', 'TC-U-018'].includes(id) )

/** @type {Map<string, {file:string,title:string,status:'pass'|'fail'|'expected-fail'}[]>} */
const results = new Map()
const add = (file, title, status) => {
  for (const id of new Set(title.match(/TC-[UACE]-\d+/g) ?? [])) {
    if (!ids.has(id) || !ours(file, id)) continue
    results.set(id, [...(results.get(id) ?? []), { file, title, status }])
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
const rows = [...ids].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).map((id) => {
  const list = results.get(id) ?? []
  const worst = list.reduce((w, r) => (rank[r.status] > rank[w] ? r.status : w), 'pass')
  const where = [...new Set(list.map((r) => r.file.replace(/^.*\/(src|e2e|test|packages)\//, '$1/')))].join(', ')
  const verdict = list.length === 0 ? 'NOT AUTOMATED' : worst === 'fail' ? 'FAIL' : worst === 'skip' ? 'SKIPPED' : worst === 'expected-fail' ? 'pass + expected failure' : 'pass'
  return `| ${id} | ${list.length} | ${verdict} | ${where} |`
})
const counts = { total: ids.size, automated: [...ids].filter((i) => results.has(i)).length }
console.log(`Automated ${counts.automated} of ${counts.total} ids\n`)
console.log('| TC | tests | result | files |\n|---|---|---|---|')
console.log(rows.join('\n'))
