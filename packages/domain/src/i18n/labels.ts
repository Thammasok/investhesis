import type { Language } from './languages.ts'
import { LENS_VALUES, type Market } from '../vocabulary.ts'

export const LENS_LABEL_KEYS = [
  'gicsSector',
  'setIndustryGroup',
  'valueChainPosition',
  'valueChain',
  'size',
  'style',
  'economicCycle',
  'lynchType',
  'lifeCycle',
  'customers',
  'revenueTypes',
  'moat',
  'themes',
  'volatility',
  'market',
  'indexMembership',
] as const
export type LensLabelKey = (typeof LENS_LABEL_KEYS)[number]

/** Lens names shown in the concentration page, in FR-006 order. */
export const LENS_LABELS_EN = {
  gicsSector: 'Sector (GICS)',
  setIndustryGroup: 'SET industry group',
  valueChainPosition: 'Value chain position',
  valueChain: 'Value chain name',
  size: 'Size',
  style: 'Style',
  economicCycle: 'Economic cycle',
  lynchType: 'Lynch type',
  lifeCycle: 'Life cycle',
  customers: 'Customers',
  revenueTypes: 'Revenue types',
  moat: 'Moat',
  themes: 'Themes',
  volatility: 'Volatility',
  market: 'Market',
  indexMembership: 'Index membership',
} as const satisfies Record<LensLabelKey, string>

export const LENS_LABELS_TH = {
  gicsSector: 'กลุ่มธุรกิจ (GICS)',
  setIndustryGroup: 'กลุ่มอุตสาหกรรม SET',
  valueChainPosition: 'ตำแหน่งในห่วงโซ่คุณค่า',
  valueChain: 'ชื่อห่วงโซ่คุณค่า',
  size: 'ขนาด',
  style: 'สไตล์',
  economicCycle: 'วัฏจักรเศรษฐกิจ',
  lynchType: 'ประเภทหุ้นแบบ Lynch',
  lifeCycle: 'วงจรธุรกิจ',
  customers: 'กลุ่มลูกค้า',
  revenueTypes: 'ประเภทรายได้',
  moat: 'ความได้เปรียบ (Moat)',
  themes: 'ธีม',
  volatility: 'ความผันผวน',
  market: 'ตลาด',
  indexMembership: 'ดัชนีที่เป็นสมาชิก',
} as const satisfies Record<LensLabelKey, string>

export const LENS_LABELS_BY_LANGUAGE: Record<Language, Record<LensLabelKey, string>> = {
  en: LENS_LABELS_EN,
  th: LENS_LABELS_TH,
}

type LensValueKey = keyof typeof LENS_VALUES
export type LensValueLabels = { [K in LensValueKey]: Record<(typeof LENS_VALUES)[K][number], string> }

/** English labels are the canonical values. */
export const LENS_VALUE_LABELS_EN = Object.fromEntries(
  Object.entries(LENS_VALUES).map(([lens, values]) => [lens, Object.fromEntries(values.map((v) => [v, v]))]),
) as LensValueLabels

/** Owner-approved glossary (ux-design.md). A missing value fails typecheck. */
export const LENS_VALUE_LABELS_TH = {
  gicsSector: {
    'Communication Services': 'บริการสื่อสาร',
    'Consumer Discretionary': 'สินค้าฟุ่มเฟือย',
    'Consumer Staples': 'สินค้าจำเป็น',
    Energy: 'พลังงาน',
    Financials: 'การเงิน',
    'Health Care': 'การแพทย์และสุขภาพ',
    Industrials: 'อุตสาหกรรม',
    'Information Technology': 'เทคโนโลยีสารสนเทศ',
    Materials: 'วัสดุ',
    'Real Estate': 'อสังหาริมทรัพย์',
    Utilities: 'สาธารณูปโภค',
  },
  setIndustryGroup: {
    'Agro & Food Industry': 'เกษตรและอุตสาหกรรมอาหาร',
    'Consumer Products': 'สินค้าอุปโภคบริโภค',
    Financials: 'ธุรกิจการเงิน',
    Industrials: 'สินค้าอุตสาหกรรม',
    'Property & Construction': 'อสังหาริมทรัพย์และก่อสร้าง',
    Resources: 'ทรัพยากร',
    Services: 'บริการ',
    Technology: 'เทคโนโลยี',
  },
  valueChainPosition: {
    Upstream: 'ต้นน้ำ',
    Midstream: 'กลางน้ำ',
    Downstream: 'ปลายน้ำ',
    Integrated: 'ครบวงจร',
    None: 'ไม่มี',
  },
  size: { Mega: 'ใหญ่พิเศษ', Large: 'ใหญ่', Mid: 'กลาง', Small: 'เล็ก', Micro: 'เล็กมาก' },
  style: { Growth: 'เติบโต', Value: 'คุณค่า', Dividend: 'ปันผล', Quality: 'คุณภาพ' },
  economicCycle: { Cyclical: 'วัฏจักร', Sensitive: 'อ่อนไหว', Defensive: 'ตั้งรับ' },
  lynchType: {
    'Fast Grower': 'โตเร็ว',
    Stalwart: 'โตมั่นคง',
    'Slow Grower': 'โตช้า',
    Cyclical: 'วัฏจักร',
    Turnaround: 'พลิกฟื้น',
    'Asset Play': 'สินทรัพย์ซ่อนค่า',
  },
  lifeCycle: { Growth: 'เติบโต', Mature: 'อิ่มตัว', Turnaround: 'พลิกฟื้น', Decline: 'ถดถอย' },
  customers: { B2B: 'ธุรกิจ (B2B)', B2C: 'ผู้บริโภค (B2C)', Government: 'ภาครัฐ' },
  revenueTypes: {
    Subscription: 'ค่าสมาชิก',
    'Transaction fee': 'ค่าธรรมเนียมธุรกรรม',
    'Product sale': 'ขายสินค้า',
    Ads: 'โฆษณา',
    Rent: 'ค่าเช่า',
    Interest: 'ดอกเบี้ย',
  },
  moat: {
    Brand: 'แบรนด์',
    'Network effect': 'เครือข่ายผู้ใช้',
    'Switching cost': 'ต้นทุนการเปลี่ยน',
    'Cost advantage': 'ได้เปรียบด้านต้นทุน',
    'Efficient scale': 'ขนาดที่เหมาะสม',
    Intangibles: 'สินทรัพย์ไม่มีตัวตน',
    Unclear: 'ไม่ชัดเจน',
  },
  volatility: { High: 'สูง', Mid: 'กลาง', Low: 'ต่ำ' },
} as const satisfies LensValueLabels

export const LENS_VALUE_LABELS_BY_LANGUAGE: Record<Language, LensValueLabels> = {
  en: LENS_VALUE_LABELS_EN,
  th: LENS_VALUE_LABELS_TH,
}

/** Market labels only; the codes stay US and TH everywhere else. */
export const MARKET_LABELS = {
  en: { US: 'US', TH: 'TH' },
  th: { US: 'สหรัฐฯ', TH: 'ไทย' },
} as const satisfies Record<Language, Record<Market, string>>

export const NOT_SET_LABELS = { en: 'Not set', th: 'ยังไม่ระบุ' } as const satisfies Record<Language, string>

export const THESIS_TYPE_LABELS_EN = { buy: 'Buy', sell: 'Sell', update: 'Update', review: 'Review' } as const
export const THESIS_TYPE_LABELS_TH = {
  buy: 'ซื้อ',
  sell: 'ขาย',
  update: 'อัปเดต',
  review: 'ทบทวน',
} as const satisfies Record<keyof typeof THESIS_TYPE_LABELS_EN, string>

const has = (o: object, k: string) => Object.hasOwn(o, k)

/**
 * The label of one value of a lens. Free text (themes, value chain name), index names and
 * unknown values come back unchanged, in both languages.
 */
export function lensValueLabel(lens: string, value: string, lang: Language): string {
  if (lens === 'market') return has(MARKET_LABELS[lang], value) ? MARKET_LABELS[lang][value as Market] : value
  const lensLabels: Record<string, string> | undefined = has(LENS_VALUE_LABELS_BY_LANGUAGE[lang], lens)
    ? LENS_VALUE_LABELS_BY_LANGUAGE[lang][lens as LensValueKey]
    : undefined
  return lensLabels && has(lensLabels, value) ? (lensLabels[value] ?? value) : value
}
