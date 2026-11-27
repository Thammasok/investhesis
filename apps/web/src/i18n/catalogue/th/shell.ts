import type { Catalogue } from '../../catalogue-types'
import type { shell } from '../en/shell'

export const shell_th: Catalogue<typeof shell> = {
  portfolio: 'พอร์ตการลงทุน',
  mainNav: 'เมนูหลัก',
  accountMenu: 'เมนูบัญชี',
  signOut: 'ออกจากระบบ',
  loading: 'กำลังโหลด',
  breadcrumb: 'เส้นทางหน้า',
  close: 'ปิด',
  more: 'เพิ่มเติม',
  toggleSidebar: 'เปิดหรือปิดแถบด้านข้าง',
  sidebar: 'แถบด้านข้าง',
  sidebarDescription: 'แถบด้านข้างสำหรับมือถือ',
  authPanelTitle: 'หนึ่งเหตุผลการลงทุนสำหรับทุกหุ้นที่คุณถือ',
  authPanelBody: 'หุ้นสหรัฐฯ และไทยบน 10 มุมมองเดียวกัน เห็นการกระจุกตัวของพอร์ตได้ชัดเจน',
  signedInAs: 'เข้าสู่ระบบเป็น {{email}}',
  notFoundTitle: 'ไม่พบหน้า',
  notFoundBody: 'ไม่มีหน้าที่ตรงกับที่อยู่นี้',
  goToStocks: 'ไปที่หุ้น',
  goToLists: 'ไปที่รายการหุ้น',
  routeNotFoundTitle: 'ไม่พบ',
  routeErrorTitle: 'เกิดข้อผิดพลาด',
  routeNotFoundBody: 'ไม่พบหน้าหรือรายการนี้ อาจถูกลบไปแล้ว',
  routeErrorBody: 'เกิดข้อผิดพลาดขณะโหลดหน้านี้',
  reload: 'โหลดใหม่',
}
