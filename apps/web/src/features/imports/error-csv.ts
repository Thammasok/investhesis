import type { ErrorRow } from './types'

const BOM = '﻿'

/** RFC 4180: a field with a comma, quote or line break is quoted, and its quotes are doubled. */
function field(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value
}

/**
 * The error-rows report (FR-023): `row`, the file's own columns (the union over the rows, first-seen
 * order), then `errors` as `field: message; field: message`. UTF-8 with a BOM so Excel reads Thai text.
 * Cells are written as they came (NFR-009: byte-for-byte), so a cell starting with `=` is not escaped.
 */
export function buildErrorCsv(rows: readonly ErrorRow[]): string {
  const columns = [...new Set(rows.flatMap((r) => Object.keys(r.cells)))]
  const lines = [
    ['row', ...columns, 'errors'],
    ...rows.map((r) => [
      String(r.rowNumber),
      ...columns.map((c) => r.cells[c] ?? ''),
      r.errors.map((e) => `${e.path}: ${e.message}`).join('; '),
    ]),
  ]
  return BOM + lines.map((cells) => cells.map(field).join(',')).join('\r\n') + '\r\n'
}
