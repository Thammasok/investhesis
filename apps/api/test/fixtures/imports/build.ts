import ExcelJS from 'exceljs'
import { TEMPLATE_COLUMNS } from '@investhesis/domain'

export const HEADERS: string[] = TEMPLATE_COLUMNS.map((c) => c.header)
export const BOM = '﻿'

const quote = (cell: string) => (/[",\r\n]/.test(cell) ? `"${cell.replaceAll('"', '""')}"` : cell)

/** One CSV line per row; rows are cell arrays or header-keyed objects. */
export function csv(header: string[], rows: (string[] | Record<string, string>)[], opts: { bom?: boolean; eol?: string } = {}): Buffer {
  const eol = opts.eol ?? '\n'
  const lines = [header, ...rows.map((r) => (Array.isArray(r) ? r : header.map((h) => r[h] ?? '')))]
  return Buffer.from((opts.bom ? BOM : '') + lines.map((l) => l.map(quote).join(',')).join(eol) + eol, 'utf8')
}

const FILLED = { exchange: 'NASDAQ', market: 'US' }
export const usRow = (ticker: string, name = `${ticker} Inc.`, extra: Record<string, string> = {}) => ({ ticker, ...FILLED, name, ...extra })

/** n valid US rows T0001..Tnnnn. */
export const manyRows = (n: number, from = 1) => Array.from({ length: n }, (_, i) => usRow(`T${String(from + i).padStart(4, '0')}`))

export const F = {
  /** F-01 */ templateBom: () =>
    csv(HEADERS, [
      { ticker: 'NVDA', market: 'US', exchange: 'NASDAQ', name: 'NVIDIA Corporation', index_membership: 'S&P 500;Nasdaq-100', sector: 'Information Technology', style: 'Growth' },
      { ticker: 'PTTEP', market: 'TH', exchange: 'SET', name: 'บริษัท ปตท. สำรวจและผลิตปิโตรเลียม จำกัด (มหาชน)', index_membership: 'SET50', sector: 'Resources', gics_sector: 'Energy' },
    ], { bom: true }),
  /** F-02 */ noBom: () => csv(['ticker', 'market', 'exchange', 'name'], [usRow('AAPL', 'Apple Inc.'), usRow('MSFT', 'Microsoft'), usRow('NVDA', 'NVIDIA')]),
  /** F-03 */ thaiNames: () =>
    csv(
      HEADERS,
      [
        { ticker: 'PTT', name: 'บมจ. ปตท.', sector: 'Resources', gics_sector: 'Energy' },
        { ticker: 'AOT', name: 'บมจ. ท่าอากาศยานไทย', sector: 'Services', gics_sector: 'Industrials' },
        { ticker: 'CPALL', name: 'ซีพี ออลล์', sector: 'Services', gics_sector: 'Consumer Staples' },
        { ticker: 'KBANK', name: 'ธนาคารกสิกรไทย', sector: 'Financials', gics_sector: 'Financials' },
        { ticker: 'SCC', name: 'ปูนซิเมนต์ไทย', sector: 'Industrials', gics_sector: 'Materials' },
      ].map((r) => ({ market: 'TH', exchange: 'SET', index_membership: 'SET50', themes: 'พลังงาน;ปันผล', ...r })),
      { bom: true },
    ),
  /** F-04 */ formulaXlsx: () => xlsx([{ rows: [['ticker', 'market', 'exchange', 'name'], ['ADV', 'US', 'NASDAQ', { formula: 'CONCAT("Ad","vanc")', result: 'Advanc' }]] }]),
  /** F-05 */ twoSheets: () =>
    xlsx([
      { rows: [['ticker', 'market', 'exchange', 'name'], ['ONE', 'US', 'NYSE', 'One']] },
      { rows: [['ticker', 'market', 'exchange', 'name'], ...[2, 3, 4, 5, 6].map((i) => [`S${i}`, 'US', 'NYSE', `S${i}`])] },
    ]),
  /** F-06 */ rows1000: () => csv(HEADERS, manyRows(1000)),
  /** F-07 */ rows1001: () => csv(HEADERS, manyRows(1001)),
  /** F-08, F-14 at size+1: padding sits in an unknown column. */ ofSize: (bytes: number) => {
    const base = csv([...HEADERS, 'padding'], [])
    const row = (pad: string) => Buffer.from(`${usRow('PAD').ticker},US,NASDAQ,Pad Inc.${','.repeat(HEADERS.length - 4)}${pad}\n`)
    const fixed = base.length + row('').length
    return Buffer.concat([base, row('x'.repeat(bytes - fixed))])
  },
  /** F-09 */ headerOnly: () => csv(HEADERS, []),
  /** F-10 */ fakeXlsx: () => Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63fcffff3f0005fe02fea7d6c4670000000049454e44ae426082', 'hex'),
  /** F-11 */ latin1: () => Buffer.concat([Buffer.from('ticker,market,exchange,name\nCAFE,US,NYSE,Caf'), Buffer.from([0xe9]), Buffer.from('\n')]),
  /** F-12 */ reportTxt: () => Buffer.from('quarterly report\n'),
  /** F-26 */ legacyXls: () => Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0, 0, 0]),
}

type Cell = ExcelJS.CellValue
export async function xlsx(sheets: { rows: Cell[][] }[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  sheets.forEach((s, i) => {
    const ws = wb.addWorksheet(`Sheet${i + 1}`)
    for (const r of s.rows) ws.addRow(r)
  })
  return Buffer.from(await wb.xlsx.writeBuffer())
}
