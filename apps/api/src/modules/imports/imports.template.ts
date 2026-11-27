import {
  ALL_EXCHANGES,
  ALL_INDEXES,
  LENS_VALUES,
  MARKETS,
  TEMPLATE_COLUMNS,
  lensValueLabel,
  type Language,
} from '@investhesis/domain'
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

type Header = (typeof TEMPLATE_COLUMNS)[number]['header']

/** What a column takes, per language. Thai wording is for the owner to review (T-003 report). */
const WHAT: Record<Header, { en: string; th: string }> = {
  ticker: { en: 'Stock symbol, 1-12 characters of A-Z, 0-9, . or -', th: 'สัญลักษณ์หุ้น 1-12 ตัว ใช้ A-Z 0-9 . หรือ -' },
  market: { en: 'Market', th: 'ตลาด' },
  exchange: { en: 'Exchange; must belong to the market', th: 'ตลาดหลักทรัพย์ ต้องตรงกับตลาด' },
  name: { en: 'Company name', th: 'ชื่อบริษัท' },
  index_membership: { en: 'Indexes the stock belongs to, separated by ;', th: 'ดัชนีที่หุ้นอยู่ คั่นด้วย ;' },
  sector: {
    en: 'Sector: GICS sector for US stocks, SET industry group for TH stocks',
    th: 'กลุ่มธุรกิจ: GICS สำหรับหุ้นสหรัฐฯ กลุ่มอุตสาหกรรม SET สำหรับหุ้นไทย',
  },
  gics_sector: { en: 'GICS sector, TH stocks only', th: 'กลุ่มธุรกิจ GICS เฉพาะหุ้นไทย' },
  value_chain: { en: 'Name of the value chain', th: 'ชื่อห่วงโซ่คุณค่า' },
  value_chain_position: { en: 'Position in the value chain', th: 'ตำแหน่งในห่วงโซ่คุณค่า' },
  size: { en: 'Size bucket', th: 'ขนาดบริษัท' },
  style: { en: 'Investment style', th: 'สไตล์การลงทุน' },
  economic_cycle: { en: 'Economic cycle', th: 'วัฏจักรเศรษฐกิจ' },
  lynch_type: { en: 'Peter Lynch type', th: 'ประเภทหุ้นตามแนวปีเตอร์ ลินช์' },
  life_cycle: { en: 'Company life cycle', th: 'วงจรชีวิตของบริษัท' },
  customers: { en: 'Customer types, separated by ;', th: 'ประเภทลูกค้า คั่นด้วย ;' },
  revenue_types: { en: 'Revenue types, separated by ;', th: 'ประเภทรายได้ คั่นด้วย ;' },
  moat: { en: 'Competitive moat', th: 'ความได้เปรียบทางการแข่งขัน' },
  themes: { en: 'Themes, separated by ;', th: 'ธีม คั่นด้วย ;' },
  volatility: { en: 'Volatility', th: 'ความผันผวน' },
}

const TEXT = {
  en: {
    sheet: 'Instructions',
    head: ['Column', 'Required', 'What it takes', 'Allowed values'],
    yes: 'Yes',
    no: 'No',
    free: 'Free text',
    us: 'US',
    th: 'TH',
    note: 'Type the English value (the one before the dash) in the file; the Thai labels are only a guide.',
  },
  th: {
    sheet: 'คำแนะนำ',
    head: ['คอลัมน์', 'จำเป็น', 'ใส่อะไร', 'ค่าที่ใช้ได้ (ค่าในไฟล์ — ความหมาย)'],
    yes: 'ใช่',
    no: 'ไม่',
    free: 'ข้อความอิสระ',
    us: 'สหรัฐฯ',
    th: 'ไทย',
    note: 'ใส่ค่าในไฟล์เป็นภาษาอังกฤษตามที่อยู่หน้าเครื่องหมาย — เท่านั้น ป้ายภาษาไทยเป็นเพียงคำอธิบาย',
  },
} as const satisfies Record<Language, unknown>

const REQUIRED: readonly Header[] = ['ticker', 'market', 'exchange', 'name']

const list = (lens: string, values: readonly string[], lang: Language) =>
  values
    .map((v) => {
      const label = lang === 'th' ? lensValueLabel(lens, v, lang) : v
      return label === v ? v : `${v} — ${label}`
    })
    .join('; ')

function allowed(header: Header, lang: Language): string {
  const T = TEXT[lang]
  switch (header) {
    case 'market':
      return list('market', MARKETS, lang)
    case 'exchange':
      return list('exchange', ALL_EXCHANGES, lang)
    case 'index_membership':
      return list('indexMembership', ALL_INDEXES, lang)
    case 'sector':
      return `${T.us}: ${list('gicsSector', LENS_VALUES.gicsSector, lang)} | ${T.th}: ${list('setIndustryGroup', LENS_VALUES.setIndustryGroup, lang)}`
    case 'gics_sector':
      return list('gicsSector', LENS_VALUES.gicsSector, lang)
    case 'value_chain_position':
      return list('valueChainPosition', LENS_VALUES.valueChainPosition, lang)
    case 'size':
    case 'style':
    case 'moat':
    case 'volatility':
      return list(header, LENS_VALUES[header], lang)
    case 'economic_cycle':
      return list('economicCycle', LENS_VALUES.economicCycle, lang)
    case 'lynch_type':
      return list('lynchType', LENS_VALUES.lynchType, lang)
    case 'life_cycle':
      return list('lifeCycle', LENS_VALUES.lifeCycle, lang)
    case 'customers':
      return list('customers', LENS_VALUES.customers, lang)
    case 'revenue_types':
      return list('revenueTypes', LENS_VALUES.revenueTypes, lang)
    default:
      return T.free
  }
}

/** FR-012: the Stocks sheet is the same in both languages; only Instructions changes. */
export async function templateXlsx(lang: Language = 'en'): Promise<Buffer> {
  const T = TEXT[lang]
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Stocks')
  sheet.addRow(headers).font = { bold: true }
  for (const row of rows) sheet.addRow(row)

  const guide = workbook.addWorksheet(T.sheet, { views: [{ state: 'frozen', ySplit: 1 }] })
  guide.addRow(T.head).font = { bold: true }
  for (const { header } of TEMPLATE_COLUMNS) {
    guide.addRow([header, REQUIRED.includes(header) ? T.yes : T.no, WHAT[header][lang], allowed(header, lang)])
  }
  guide.addRow([])
  guide.addRow([T.note])
  guide.columns = [{ width: 24 }, { width: 12 }, { width: 48 }, { width: 80 }]
  guide.getColumn(3).alignment = { wrapText: true, vertical: 'top' }
  guide.getColumn(4).alignment = { wrapText: true, vertical: 'top' }
  guide.getRow(guide.rowCount).getCell(1).alignment = { wrapText: false }
  return Buffer.from(await workbook.xlsx.writeBuffer())
}
