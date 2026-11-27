import { ALL_EXCHANGES, ALL_INDEXES, LENS_VALUES, MARKETS, type Market } from './vocabulary.ts'
import { MESSAGES } from './messages.ts'
import { StockInput } from './stock-schema.ts'

export type TemplateColumn = {
  header: string
  /** The StockInput key this column fills (for TH rows `thField`, when present, replaces it). */
  field: keyof StockInput
  thField?: keyof StockInput
  kind: 'single' | 'multi'
}

/** FR-015: the template, the parser and the preview all read this one list, in this order. */
export const TEMPLATE_COLUMNS = [
  { header: 'ticker', field: 'ticker', kind: 'single' },
  { header: 'market', field: 'market', kind: 'single' },
  { header: 'exchange', field: 'exchange', kind: 'single' },
  { header: 'name', field: 'name', kind: 'single' },
  { header: 'index_membership', field: 'indexMembership', kind: 'multi' },
  { header: 'sector', field: 'gicsSector', thField: 'setIndustryGroup', kind: 'single' },
  { header: 'gics_sector', field: 'gicsSector', kind: 'single' },
  { header: 'value_chain', field: 'valueChain', kind: 'single' },
  { header: 'value_chain_position', field: 'valueChainPosition', kind: 'single' },
  { header: 'size', field: 'size', kind: 'single' },
  { header: 'style', field: 'style', kind: 'single' },
  { header: 'economic_cycle', field: 'economicCycle', kind: 'single' },
  { header: 'lynch_type', field: 'lynchType', kind: 'single' },
  { header: 'life_cycle', field: 'lifeCycle', kind: 'single' },
  { header: 'customers', field: 'customers', kind: 'multi' },
  { header: 'revenue_types', field: 'revenueTypes', kind: 'multi' },
  { header: 'moat', field: 'moat', kind: 'single' },
  { header: 'themes', field: 'themes', kind: 'multi' },
  { header: 'volatility', field: 'volatility', kind: 'single' },
] as const satisfies readonly TemplateColumn[]

export type FieldError = {
  /** The StockInput key that failed. */
  path: string
  /** The template column to point at in a preview or an error file. */
  column: string
  message: string
}

export type RowResult = { ok: true; input: StockInput } | { ok: false; errors: FieldError[] }

/** Value lists used to put a cell into its canonical spelling, by StockInput key. */
const CANONICAL: Partial<Record<keyof StockInput, readonly string[]>> = {
  market: MARKETS,
  exchange: ALL_EXCHANGES,
  indexMembership: ALL_INDEXES,
  gicsSector: LENS_VALUES.gicsSector,
  setIndustryGroup: LENS_VALUES.setIndustryGroup,
  valueChainPosition: LENS_VALUES.valueChainPosition,
  size: LENS_VALUES.size,
  style: LENS_VALUES.style,
  economicCycle: LENS_VALUES.economicCycle,
  lynchType: LENS_VALUES.lynchType,
  lifeCycle: LENS_VALUES.lifeCycle,
  customers: LENS_VALUES.customers,
  revenueTypes: LENS_VALUES.revenueTypes,
  moat: LENS_VALUES.moat,
  volatility: LENS_VALUES.volatility,
}

/** Case-insensitive match to the canonical spelling; an unknown value is returned as typed. */
function canonical(field: keyof StockInput, value: string): string {
  const wanted = value.toLowerCase()
  return CANONICAL[field]?.find((v) => v.toLowerCase() === wanted) ?? value
}

function isMarket(value: string): value is Market {
  return (MARKETS as readonly string[]).includes(value)
}

function columnFor(path: string, market: unknown): string {
  if (path === 'gicsSector') return market === 'TH' ? 'gics_sector' : 'sector'
  if (path === 'setIndustryGroup') return 'sector'
  return TEMPLATE_COLUMNS.find((c) => c.field === path)?.header ?? path
}

/**
 * Turns one file row (cells keyed by template header) into a validated StockInput, reporting
 * every failed field. FR-017 to FR-019, per row; the file-level checks (headers, duplicates in
 * the file, size) belong to the caller.
 */
export function canonicaliseRow(cells: Readonly<Record<string, string>>): RowResult {
  const cell = (header: string) => (cells[header] ?? '').trim()
  const market = canonical('market', cell('market'))
  const raw: Record<string, unknown> = {}

  for (const column of TEMPLATE_COLUMNS) {
    const text = cell(column.header)
    if (column.header === 'sector') {
      if (!isMarket(market)) continue
      const target = market === 'TH' ? column.thField : column.field
      raw[target] = text === '' ? null : canonical(target, text)
    } else if (column.header === 'gics_sector') {
      if (market !== 'TH') continue
      raw[column.field] = text === '' ? null : canonical(column.field, text)
    } else if (column.kind === 'multi') {
      raw[column.field] = text
        .split(';')
        .map((s) => s.trim())
        .filter((s) => s !== '')
        .map((s) => canonical(column.field, s))
    } else {
      raw[column.field] = text === '' ? null : canonical(column.field, text)
    }
  }
  raw.market = market === '' ? undefined : market
  // Required text fields: an empty cell is a missing value, not null.
  for (const key of ['ticker', 'name', 'market', 'exchange']) if (raw[key] === null) raw[key] = undefined

  const parsed = StockInput.safeParse(raw)
  if (parsed.success) return { ok: true, input: parsed.data }

  const errors: FieldError[] = []
  const seen = new Set<string>()
  for (const issue of parsed.error.issues) {
    const path = String(issue.path[0] ?? '')
    const message = issue.message || MESSAGES.rowBadValue
    const key = `${path}\u0000${message}`
    if (seen.has(key)) continue
    seen.add(key)
    errors.push({ path, column: columnFor(path, market), message })
  }
  return { ok: false, errors }
}
