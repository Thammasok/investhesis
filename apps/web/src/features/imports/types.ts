import type { RuleParams } from '@investhesis/domain'

/** A row problem: `message` is the API's English text; `rule` and `params` let the web say it in any language. */
export type RowProblem = { path: string; message: string; rule?: string; params?: RuleParams }

export type PreviewStatus = 'new' | 'duplicate' | 'error'

export type PreviewRow = {
  rowNumber: number
  ticker: string
  market: string
  name: string
  status: PreviewStatus
  existingStockId?: string
  errors: RowProblem[]
}

/** `POST /imports/preview` (design.md §API Contracts). */
export type PreviewResponse = {
  fileName: string
  format: 'csv' | 'xlsx'
  counts: Record<PreviewStatus, number>
  headerWarnings: string[]
  /** Export-only columns found in the file (lists, held, ...); they are not imported. */
  ignoredColumns: string[]
  rows: PreviewRow[]
}

export type ErrorRow = { rowNumber: number; cells: Record<string, string>; errors: RowProblem[] }

/** `POST /imports`. */
export type ImportSummary = {
  targetList: { id: string; name: string }
  created: number
  updated: number
  skipped: number
  failed: number
  addedToList: number
  errorRows: ErrorRow[]
}

export type DuplicateMode = 'skip' | 'update'
