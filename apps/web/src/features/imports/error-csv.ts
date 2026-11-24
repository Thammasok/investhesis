import { toDelimited } from '@investhesis/domain'
import type { ErrorRow } from './types'

const BOM = '\uFEFF'

/**
 * The error-rows report (FR-023): `row`, the file's own columns (the union over the rows, first-seen
 * order), then `errors` as `field: message; field: message`. UTF-8 with a BOM so Excel reads Thai text.
 * Cells are written as they came (NFR-009: byte-for-byte), so a cell starting with `=` is not escaped.
 * Quoting is the domain's one RFC 4180 rule.
 */
export function buildErrorCsv(rows: readonly ErrorRow[]): string {
  const columns = [...new Set(rows.flatMap((r) => Object.keys(r.cells)))]
  return (
    BOM +
    toDelimited(
      [
        ['row', ...columns, 'errors'],
        ...rows.map((r) => [
          String(r.rowNumber),
          ...columns.map((c) => r.cells[c] ?? ''),
          r.errors.map((e) => `${e.path}: ${e.message}`).join('; '),
        ]),
      ],
      ',',
    )
  )
}
