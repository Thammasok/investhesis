import type { Catalogue } from '../../catalogue-types.ts'

export const common = {
  stockCount: { other: '{count} หุ้น' },
  listCount: { other: '{count} รายการ' },
  notSet: 'ยังไม่ระบุ',
} as const satisfies Catalogue['common']
