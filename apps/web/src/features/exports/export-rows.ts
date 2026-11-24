import { EXPORT_COLUMNS, exportRow, toDelimited, type ExportableStock } from '@investhesis/domain'

const BOM = '﻿'

/** The names of the lists, by id, for the `lists` column. */
export const listNameMap = (lists: readonly { id: string; name: string }[]): Map<string, string> =>
  new Map(lists.map((l) => [l.id, l.name]))

const table = (stocks: readonly ExportableStock[], names: ReadonlyMap<string, string>) => [
  [...EXPORT_COLUMNS],
  ...stocks.map((s) => exportRow(s, names)),
]

/** The CSV of the shown rows in the shown order (FR-012): a BOM, CRLF line ends, RFC 4180 quoting, cells as stored. */
export function csvOfRows(stocks: readonly ExportableStock[], names: ReadonlyMap<string, string>): string {
  return BOM + toDelimited(table(stocks, names), ',')
}

/** The same rows tab-separated, no BOM, so they paste into spreadsheet columns (FR-013). */
export function tableOfRows(stocks: readonly ExportableStock[], names: ReadonlyMap<string, string>): string {
  return toDelimited(table(stocks, names), '\t')
}
