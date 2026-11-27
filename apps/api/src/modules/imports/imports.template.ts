import { TEMPLATE_COLUMNS } from '@investhesis/domain'
import ExcelJS from 'exceljs'

/** FR-015: one example per market; both must pass canonicaliseRow. */
const EXAMPLES: Record<(typeof TEMPLATE_COLUMNS)[number]['header'], string>[] = [
  {
    ticker: 'NVDA', market: 'US', exchange: 'NASDAQ', name: 'NVIDIA Corporation', index_membership: 'S&P 500;Nasdaq-100',
    sector: 'Information Technology', gics_sector: '', value_chain: 'AI chips', value_chain_position: 'Midstream', size: 'Mega',
    style: 'Growth', economic_cycle: 'Sensitive', lynch_type: 'Fast Grower', life_cycle: 'Growth', customers: 'B2B',
    revenue_types: 'Product sale', moat: 'Intangibles', themes: 'AI;Semiconductors', volatility: 'High',
  },
  {
    ticker: 'PTTEP', market: 'TH', exchange: 'SET', name: 'บริษัท ปตท. สำรวจและผลิตปิโตรเลียม จำกัด (มหาชน)', index_membership: 'SET50',
    sector: 'Resources', gics_sector: 'Energy', value_chain: 'Oil and gas', value_chain_position: 'Upstream', size: 'Large',
    style: 'Dividend', economic_cycle: 'Cyclical', lynch_type: 'Stalwart', life_cycle: 'Mature', customers: 'B2B',
    revenue_types: 'Product sale', moat: 'Cost advantage', themes: 'Energy', volatility: 'Mid',
  },
]

const headers = TEMPLATE_COLUMNS.map((c) => c.header)
const rows = EXAMPLES.map((e) => headers.map((h) => e[h]))

const quote = (cell: string) => (/[",\r\n]/.test(cell) ? `"${cell.replaceAll('"', '""')}"` : cell)

/** UTF-8 with a byte-order mark so Excel shows Thai text correctly (NFR-009). */
export function templateCsv(): Buffer {
  const lines = [headers, ...rows].map((l) => l.map(quote).join(','))
  return Buffer.from(`﻿${lines.join('\r\n')}\r\n`, 'utf8')
}

export async function templateXlsx(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Stocks')
  sheet.addRow(headers).font = { bold: true }
  for (const row of rows) sheet.addRow(row)
  return Buffer.from(await workbook.xlsx.writeBuffer())
}
