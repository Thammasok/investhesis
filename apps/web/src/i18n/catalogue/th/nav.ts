import type { Catalogue } from '../../catalogue-types.ts'

export const nav = {
  stocks: 'หุ้น',
  newStock: 'หุ้นใหม่',
  edit: 'แก้ไข',
  concentration: 'การกระจุกตัว',
  chains: 'ห่วงโซ่คุณค่า',
  lists: 'รายการหุ้น',
  importExport: 'นำเข้า / ส่งออก',
  import: 'นำเข้า',
  account: 'บัญชี',
  notFound: 'ไม่พบหน้า',
} as const satisfies Catalogue['nav']
