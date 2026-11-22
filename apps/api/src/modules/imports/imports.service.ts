import { canonicaliseRow, resolveEconomicCycle, TEMPLATE_COLUMNS, type FieldError, type StockInput } from '@investhesis/domain'
import type { Db } from '../../db/client.ts'
import { AppError } from '../../lib/app-error.ts'
import { uuidv7 } from '../../lib/ids.ts'
import * as listRepo from '../lists/lists.repository.ts'
import * as stocks from '../stocks/stocks.repository.ts'
import { sourcesFor, toNewStock } from '../stocks/stocks.service.ts'
import { readImportFile, type FileRow } from './file-reader.ts'

const REQUIRED = ['ticker', 'market', 'exchange', 'name']
const KNOWN = new Set<string>(TEMPLATE_COLUMNS.map((c) => c.header))

export type PreviewRow = {
  rowNumber: number
  ticker: string
  market: string
  name: string
  status: 'new' | 'duplicate' | 'error'
  existingStockId?: string
  errors: Pick<FieldError, 'path' | 'message'>[]
}

export type Preview = {
  fileName: string
  format: 'csv' | 'xlsx'
  counts: { new: number; duplicate: number; error: number }
  headerWarnings: string[]
  rows: PreviewRow[]
}

/** Template header → column index. First of a repeated header wins. */
export function mapHeaders(header: readonly string[]): { index: Map<string, number>; warnings: string[] } {
  const index = new Map<string, number>()
  const warnings: string[] = []
  header.forEach((raw, i) => {
    const name = raw.trim()
    if (name === '') return
    const key = name.toLowerCase()
    if (!KNOWN.has(key)) warnings.push(`Unknown column "${name}" ignored`)
    else if (index.has(key)) warnings.push(`Duplicate column "${name}" ignored`)
    else index.set(key, i)
  })
  const missing = REQUIRED.filter((h) => !index.has(h))
  if (missing.length > 0) {
    throw new AppError({
      status: 422,
      code: 'file_missing_headers',
      detail: `Missing columns: ${missing.join(', ')}`,
      errors: missing.map((path) => ({ path, message: 'column is missing' })),
    })
  }
  return { index, warnings }
}

export const cellsOf = (row: FileRow, index: ReadonlyMap<string, number>): Record<string, string> =>
  Object.fromEntries([...index].map(([header, i]) => [header, row.cells[i] ?? '']))

type RowError = Pick<FieldError, 'path' | 'message'>
type Analysed = { row: FileRow; cells: Record<string, string>; input?: StockInput; errors: RowError[] }

/** Reads the file and validates every row, including repeats of an earlier row's (market, ticker) (FR-016..FR-019). */
async function analyseFile(fileName: string, bytes: Buffer) {
  const file = await readImportFile(fileName, bytes)
  const { index, warnings } = mapHeaders(file.header)
  if (file.rows.length === 0) throw new AppError({ status: 422, code: 'file_empty', detail: 'The file has no data rows' })
  const firstSeen = new Map<string, number>()
  const rows = file.rows.map((row): Analysed => {
    const cells = cellsOf(row, index)
    const result = canonicaliseRow(cells)
    if (!result.ok) return { row, cells, errors: result.errors.map(({ path, message }) => ({ path, message })) }
    const key = `${result.input.market}/${result.input.ticker}`
    const earlier = firstSeen.get(key)
    if (earlier !== undefined) return { row, cells, errors: [{ path: 'ticker', message: `repeats row ${earlier} in this file` }] }
    firstSeen.set(key, row.rowNumber)
    return { row, cells, input: result.input, errors: [] }
  })
  return { file, warnings, rows }
}

/** Validates every row and compares it with the user's saved stocks. Reads only; nothing is written (NFR-005). */
export async function previewImport(db: Db, userId: string, fileName: string, bytes: Buffer): Promise<Preview> {
  const { file, warnings, rows: analysed } = await analyseFile(fileName, bytes)
  const saved = new Map(
    (await stocks.findByMarketTickers(db, userId, analysed.flatMap((a) => (a.input ? [a.input] : [])))).map((s) => [`${s.market}/${s.ticker}`, s.id]),
  )
  const counts = { new: 0, duplicate: 0, error: 0 }
  const rows = analysed.map(({ row, cells, input, errors }): PreviewRow => {
    if (!input) {
      counts.error++
      const trimmed = (h: string) => (cells[h] ?? '').trim()
      return { rowNumber: row.rowNumber, ticker: trimmed('ticker'), market: trimmed('market'), name: trimmed('name'), status: 'error', errors }
    }
    const { ticker, market, name } = input
    const base = { rowNumber: row.rowNumber, ticker, market, name, errors: [] }
    const existingStockId = saved.get(`${market}/${ticker}`)
    if (existingStockId) {
      counts.duplicate++
      return { ...base, status: 'duplicate', existingStockId }
    }
    counts.new++
    return { ...base, status: 'new' }
  })
  return { fileName, format: file.format, counts, headerWarnings: warnings, rows }
}

export type ImportOptions = { duplicateMode: 'skip' | 'update'; listId: string } | { duplicateMode: 'skip' | 'update'; newListName: string }

export type ImportResult = {
  targetList: { id: string; name: string }
  created: number
  updated: number
  skipped: number
  failed: number
  addedToList: number
  errorRows: { rowNumber: number; cells: Record<string, string>; errors: RowError[] }[]
}

/** The repository calls the confirm transaction makes; tests replace them to inject failures (NFR-006). */
export type ImportRepo = {
  insertMany: typeof stocks.insertMany
  updateStock: typeof stocks.updateStock
  addMemberships: typeof listRepo.addMemberships
}
export const importRepo: ImportRepo = { insertMany: stocks.insertMany, updateStock: stocks.updateStock, addMemberships: listRepo.addMemberships }

const BATCH = 200
const SCALARS = ['exchange', 'name', 'gicsSector', 'setIndustryGroup', 'valueChain', 'valueChainPosition', 'size', 'style', 'lynchType', 'lifeCycle', 'moat', 'volatility'] as const
const MULTI = ['indexMembership', 'customers', 'revenueTypes', 'themes'] as const
const isSet = (v: unknown) => (Array.isArray(v) ? v.length > 0 : v !== null && v !== undefined)

const sortedSources = (m: Record<string, string>) => JSON.stringify(Object.entries(m).sort(([a], [b]) => a.localeCompare(b)))

/**
 * Update mode (FR-021, FR-024): a row's non-empty cells replace the saved value (a multi-value cell replaces the
 * whole list) and become manual; empty cells keep it. Returns undefined when nothing would change.
 */
function mergeUpdate(saved: stocks.StockRow, input: StockInput): stocks.StockChanges | undefined {
  const merged: Record<string, unknown> = { ...saved }
  const touched = new Set<string>()
  for (const key of [...SCALARS, ...MULTI]) {
    if (isSet(input[key])) {
      merged[key] = input[key]
      touched.add(key)
    }
  }
  const cycle = resolveEconomicCycle({
    gicsSector: merged['gicsSector'] as StockInput['gicsSector'],
    input: input.economicCycle ?? undefined,
    current: { economicCycle: saved.economicCycle as never, source: saved.lensSources['economicCycle'] },
  })
  merged['economicCycle'] = cycle.economicCycle
  const lensSources = sourcesFor(merged as never, cycle.source, saved.lensSources, touched)

  const changes: stocks.StockChanges = { lensSources }
  let changed = sortedSources(lensSources) !== sortedSources(saved.lensSources)
  for (const key of [...SCALARS, ...MULTI, 'economicCycle'] as const) {
    ;(changes as Record<string, unknown>)[key] = merged[key]
    if (JSON.stringify(merged[key]) !== JSON.stringify(saved[key])) changed = true
  }
  return changed ? changes : undefined
}

const chunks = <T>(xs: readonly T[], n: number): T[][] => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, (i + 1) * n))

/** FR-021..FR-024: the whole confirm is one transaction; any failure writes nothing (NFR-006). */
export async function confirmImport(
  db: Db,
  userId: string,
  fileName: string,
  bytes: Buffer,
  options: ImportOptions,
  repo: ImportRepo = importRepo,
): Promise<ImportResult> {
  const { rows } = await analyseFile(fileName, bytes)
  const errorRows = rows.flatMap((r) => (r.input ? [] : [{ rowNumber: r.row.rowNumber, cells: r.cells, errors: r.errors }]))
  const valid = rows.flatMap((r) => (r.input ? [r.input] : []))
  if (valid.length === 0) throw new AppError({ status: 422, code: 'nothing_to_import', detail: 'Every row has an error, so nothing was imported' })
  const key = (s: { market: string; ticker: string }) => `${s.market}/${s.ticker}`

  return await db.transaction(async (tx) => {
    let targetList: { id: string; name: string }
    if ('listId' in options) {
      const found = await listRepo.findOwnedList(tx, userId, options.listId)
      if (!found) throw new AppError({ status: 404, code: 'not_found' })
      targetList = { id: found.id, name: found.name }
    } else {
      targetList = { id: uuidv7(), name: options.newListName }
      try {
        await listRepo.createList(tx, userId, targetList.id, targetList.name)
      } catch (e) {
        if (listRepo.pgError(e)?.constraint === listRepo.LIST_NAME_UNIQUE) {
          throw new AppError({ status: 409, code: 'list_name_taken', detail: 'You already have a list with this name' })
        }
        throw e
      }
    }

    const saved = new Map((await stocks.findByMarketTickers(tx, userId, valid, { lock: true })).map((s) => [key(s), s]))
    const fresh = valid.filter((v) => !saved.has(key(v)))
    const created = new Set<string>()
    const memberIds: string[] = []
    for (const batch of chunks(fresh, BATCH)) {
      for (const row of await repo.insertMany(tx, userId, batch.map(toNewStock))) {
        created.add(key(row))
        memberIds.push(row.id)
      }
    }
    // Saved between preview and confirm: the insert skipped them, so they are duplicates now.
    const late = fresh.filter((v) => !created.has(key(v)))
    for (const s of await stocks.findByMarketTickers(tx, userId, late, { lock: true })) saved.set(key(s), s)

    let updated = 0
    let skipped = 0
    for (const input of valid) {
      const existing = created.has(key(input)) ? undefined : saved.get(key(input))
      if (!existing) continue
      memberIds.push(existing.id)
      if (options.duplicateMode === 'skip') {
        skipped++
        continue
      }
      const changes = mergeUpdate(existing, input)
      if (changes && !(await repo.updateStock(tx, userId, existing.id, changes))) throw new Error('stock vanished under lock')
      updated++
    }

    const addedToList = await repo.addMemberships(tx, userId, targetList.id, memberIds)
    return { targetList, created: created.size, updated, skipped, failed: errorRows.length, addedToList, errorRows }
  })
}
