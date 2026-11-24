import { z } from 'zod'
import type { FilterableStock } from './filters.ts'
import { rejectUnknownKeys } from './stock-schema.ts'
import { THESIS_TYPES } from './theses.ts'
import { TEMPLATE_COLUMNS } from './template.ts'

/** Columns written by the export that the import recognises and skips (FR-014). */
export const EXPORT_ONLY_HEADERS = ['lists', 'held', 'shares', 'average_cost', 'cost_currency'] as const

/** FR-012: the template columns in template order, then the export-only ones. */
export const EXPORT_COLUMNS: readonly string[] = [...TEMPLATE_COLUMNS.map((c) => c.header), ...EXPORT_ONLY_HEADERS]

/** The part of a stored stock that an export row reads. Structural, so API and web rows both fit. */
export interface ExportableStock extends FilterableStock {
  listIds: readonly string[]
}

const collator = new Intl.Collator('en')

/**
 * One CSV row in EXPORT_COLUMNS order. `sector` holds GICS for US and the SET industry group for
 * TH; multi-value cells join with `;`; decimals are written as stored; nothing is escaped.
 */
export function exportRow(stock: ExportableStock, listNamesById: ReadonlyMap<string, string>): string[] {
  const cells = TEMPLATE_COLUMNS.map((column) => {
    if (column.header === 'sector') return (stock.market === 'TH' ? stock.setIndustryGroup : stock.gicsSector) ?? ''
    if (column.header === 'gics_sector') return stock.market === 'TH' ? (stock.gicsSector ?? '') : ''
    const value = stock[column.field as keyof ExportableStock]
    if (Array.isArray(value)) return value.join(';')
    return typeof value === 'string' ? value : ''
  })
  const names = stock.listIds
    .map((id) => listNamesById.get(id))
    .filter((n): n is string => n !== undefined)
    .sort(collator.compare)
  const h = stock.holding
  return [
    ...cells,
    names.join(';'),
    h ? 'yes' : 'no',
    h?.shares ?? '',
    h?.averageCost ?? '',
    h ? h.costCurrency : '',
  ]
}

const needsQuotes = (field: string, separator: string) =>
  field.includes(separator) || field.includes('"') || field.includes('\r') || field.includes('\n')

/** RFC 4180 quoting for the given separator, CRLF line ends, no BOM. */
export function toDelimited(rows: readonly (readonly string[])[], separator: ',' | '\t'): string {
  return rows
    .map(
      (row) =>
        row.map((f) => (needsQuotes(f, separator) ? `"${f.replaceAll('"', '""')}"` : f)).join(separator) +
        '\r\n',
    )
    .join('')
}

export const BACKUP_FORMAT = 'investhesis-backup'

const text = z.string().nullable()
const decimal = z.string().nullable()
const iso = z.iso.datetime()

const backupStockShape = {
  id: z.uuid(),
  market: z.enum(['US', 'TH']),
  ticker: z.string(),
  exchange: z.string(),
  currency: z.enum(['USD', 'THB']),
  name: z.string(),
  indexMembership: z.array(z.string()),
  gicsSector: text,
  setIndustryGroup: text,
  valueChain: text,
  valueChainPosition: text,
  size: text,
  style: text,
  economicCycle: text,
  lynchType: text,
  lifeCycle: text,
  customers: z.array(z.string()),
  revenueTypes: z.array(z.string()),
  moat: text,
  themes: z.array(z.string()),
  volatility: text,
  lensSources: z.record(z.string(), z.enum(['manual', 'default'])),
  holding: z.strictObject({ shares: decimal, averageCost: decimal, costCurrency: z.enum(['USD', 'THB']) }).nullable(),
  createdAt: iso,
  updatedAt: iso,
}
// Unknown keys fail with the key as the path, as StockInput does (so `stocks.0.listIds`).
const BackupStock = z.looseObject(backupStockShape).superRefine((v, ctx) => {
  rejectUnknownKeys(v, Object.keys(backupStockShape), ctx)
})

const backupLists = z.array(
  z.strictObject({
    id: z.uuid(),
    name: z.string(),
    createdAt: iso,
    updatedAt: iso,
    stockIds: z.array(z.uuid()),
  }),
)
const backupSettings = z.strictObject({
  concentrationThreshold: z.number().int().min(1).max(100),
  usdThbRate: decimal,
  usdThbRateUpdatedAt: iso.nullable(),
})

/** FR-016: the documented format of the JSON backup (format version 1). */
export const BackupV1 = z.strictObject({
  format: z.literal(BACKUP_FORMAT),
  formatVersion: z.literal(1),
  exportedAt: iso,
  stocks: z.array(BackupStock),
  lists: backupLists,
  settings: backupSettings,
})
export type BackupV1 = z.output<typeof BackupV1>

const backupThesisShape = {
  id: z.uuid(),
  stockId: z.uuid(),
  type: z.enum(THESIS_TYPES),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  note: z.string(),
  targetPrice: decimal,
  invalidation: text,
  createdAt: iso,
  updatedAt: iso,
}
// Unknown keys fail with the key as the path (`theses.0.userId`).
const BackupThesis = z.looseObject(backupThesisShape).superRefine((v, ctx) => {
  rejectUnknownKeys(v, Object.keys(backupThesisShape), ctx)
})

/** Thesis Log ADR-006: format version 2 is version 1 plus the thesis entries. */
export const BackupV2 = z.strictObject({
  format: z.literal(BACKUP_FORMAT),
  formatVersion: z.literal(2),
  exportedAt: iso,
  stocks: z.array(BackupStock),
  lists: backupLists,
  settings: backupSettings,
  theses: z.array(BackupThesis),
})
export type BackupV2 = z.output<typeof BackupV2>

/** The current backup version. */
export const Backup = BackupV2
export type Backup = BackupV2
