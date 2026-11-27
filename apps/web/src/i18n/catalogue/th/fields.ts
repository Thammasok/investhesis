import type { Catalogue } from '../../catalogue-types.ts'

export const fields = {
  ticker: 'สัญลักษณ์หุ้น',
  name: 'ชื่อบริษัท',
  market: 'ตลาด',
  exchange: 'ตลาดหลักทรัพย์',
  shares: 'จำนวนหุ้น',
  averageCost: 'ต้นทุนเฉลี่ย',
  costCurrency: 'สกุลเงินต้นทุน',
  threshold: 'เกณฑ์',
  usdThbRate: 'อัตราแลกเปลี่ยน USD/THB',
  concentrationThreshold: 'เกณฑ์',
  note: 'บันทึก',
  targetPrice: 'ราคาเป้าหมาย',
  invalidation: 'เงื่อนไขที่ทำให้เหตุผลไม่เป็นจริง',
  date: 'วันที่',
  type: 'ประเภท',
  listName: 'ชื่อรายการ',
  valueChain: 'ชื่อห่วงโซ่คุณค่า',
  email: 'อีเมล',
  password: 'รหัสผ่าน',
  language: 'ภาษา',
} as const satisfies Catalogue['fields']
