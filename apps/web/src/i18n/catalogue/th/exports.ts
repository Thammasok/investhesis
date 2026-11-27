import type { Catalogue } from '../../catalogue-types'
import type { exports } from '../en/exports'

export const exports_th: Catalogue<typeof exports> = {
  menu: {
    trigger: 'ส่งออก',
    none: 'ไม่มีหุ้นให้ส่งออก',
    downloadCsv: 'ดาวน์โหลด CSV',
    copyTable: 'คัดลอกเป็นตาราง',
    backup: 'สำรองข้อมูลทั้งหมด…',
    stockCount_other: '{{n}} หุ้น',
    rowCount_other: '{{n}} แถว',
    copied: 'คัดลอก {{rows}} แล้ว',
    copyRefused: 'คัดลอกไม่ได้ เบราว์เซอร์ปิดกั้นคลิปบอร์ด ใช้ดาวน์โหลด CSV แทน',
  },
  backup: {
    title: 'ส่งออก',
    description: 'ดาวน์โหลดทุกอย่าง ได้แก่ หุ้นพร้อมการจัดกลุ่มและการถือครอง รายการหุ้น และการตั้งค่าการกระจุกตัว',
    downloadJson: 'ดาวน์โหลด JSON',
    downloadCsv: 'ดาวน์โหลด CSV',
    preparing: 'กำลังเตรียม…',
    failed: 'ดาวน์โหลดไฟล์สำรองไม่สำเร็จ ตรวจสอบการเชื่อมต่อแล้วลองอีกครั้ง',
    noteFormats: 'JSON คือไฟล์สำรองฉบับสมบูรณ์ ส่วน CSV มีหนึ่งแถวต่อหุ้นพร้อมรายการและการถือครอง และนำเข้ากลับที่นี่ได้',
    notePrivate: 'ไฟล์เหล่านี้มีจำนวนหุ้นและต้นทุนของคุณ เก็บเป็นความลับ',
    noteSome: 'หากต้องการส่งออกเฉพาะบางหุ้น ให้กรองในหน้าหุ้นแล้วใช้ส่งออกที่นั่น',
  },
}
