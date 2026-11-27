import type { Catalogue } from '../../catalogue-types.ts'

export const errors = {
  invalidField: '{field} ไม่ถูกต้อง',
} as const satisfies Catalogue['errors']
