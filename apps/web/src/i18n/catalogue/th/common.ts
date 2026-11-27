import type { Catalogue } from '../../catalogue-types.ts'

export const common = {
  stockCount_other: '{{count}} หุ้น',
  listCount_other: '{{count}} รายการ',
  notSet: 'ยังไม่ระบุ',
} as const satisfies Catalogue['common']
