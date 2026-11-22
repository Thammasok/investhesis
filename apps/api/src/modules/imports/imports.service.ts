import { canonicaliseRow, TEMPLATE_COLUMNS, type FieldError } from '@investhesis/domain'
import type { Db } from '../../db/client.ts'
import { AppError } from '../../lib/app-error.ts'
import * as stocks from '../stocks/stocks.repository.ts'
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

/** Validates every row and compares it with the user's saved stocks. Reads only; nothing is written (NFR-005). */
export async function previewImport(db: Db, userId: string, fileName: string, bytes: Buffer): Promise<Preview> {
  const file = await readImportFile(fileName, bytes)
  const { index, warnings } = mapHeaders(file.header)
  if (file.rows.length === 0) throw new AppError({ status: 422, code: 'file_empty', detail: 'The file has no data rows' })

  const parsed = file.rows.map((row) => {
    const cells = cellsOf(row, index)
    return { row, cells, result: canonicaliseRow(cells) }
  })
  const valid = parsed.flatMap((p) => (p.result.ok ? [p.result.input] : []))
  const saved = new Map(
    (await stocks.findByMarketTickers(db, userId, valid)).map((s) => [`${s.market}/${s.ticker}`, s.id]),
  )

  const firstSeen = new Map<string, number>()
  const counts = { new: 0, duplicate: 0, error: 0 }
  const rows = parsed.map(({ row, cells, result }): PreviewRow => {
    const base = { rowNumber: row.rowNumber, ticker: (cells['ticker'] ?? '').trim(), market: (cells['market'] ?? '').trim(), name: (cells['name'] ?? '').trim() }
    if (!result.ok) {
      counts.error++
      return { ...base, status: 'error', errors: result.errors.map(({ path, message }) => ({ path, message })) }
    }
    const { ticker, market, name } = result.input
    const key = `${market}/${ticker}`
    const earlier = firstSeen.get(key)
    if (earlier !== undefined) {
      counts.error++
      return { ...base, ticker, market, name, status: 'error', errors: [{ path: 'ticker', message: `repeats row ${earlier} in this file` }] }
    }
    firstSeen.set(key, row.rowNumber)
    const existingStockId = saved.get(key)
    if (existingStockId) {
      counts.duplicate++
      return { ...base, ticker, market, name, status: 'duplicate', existingStockId, errors: [] }
    }
    counts.new++
    return { ...base, ticker, market, name, status: 'new', errors: [] }
  })

  return { fileName, format: file.format, counts, headerWarnings: warnings, rows }
}
