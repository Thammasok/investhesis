import type { Catalogue } from '../../catalogue-types'
import type { lists } from '../en/lists'

export const lists_th: Catalogue<typeof lists> = {
  count_other: '{{n}} รายการ',
  stockCount_other: '{{n}} หุ้น',
  empty: {
    title: 'ยังไม่มีรายการหุ้น',
    hint: 'รายการหุ้นใช้จัดกลุ่มหุ้น เช่น "หุ้นหลัก"',
  },
  newList: 'สร้างรายการ',
  table: {
    caption: 'รายการหุ้นของคุณ เรียงตามชื่อจากน้อยไปมาก',
    name: 'ชื่อ',
    stocks: 'หุ้น',
    actions: 'การดำเนินการ',
  },
  row: {
    actionsFor: 'การดำเนินการของ {{name}}',
    rename: 'เปลี่ยนชื่อ…',
    delete: 'ลบ…',
  },
  nameDialog: {
    createTitle: 'สร้างรายการ',
    renameTitle: 'เปลี่ยนชื่อรายการ',
    label: 'ชื่อ',
    create: 'สร้าง',
    creating: 'กำลังสร้าง…',
    saving: 'กำลังบันทึก…',
  },
  nameCheck: {
    enterName: 'กรอกชื่อรายการ',
    length: 'ใช้ 1 ถึง {{max}} ตัวอักษร',
  },
  deleteDialog: {
    title: 'ลบ {{name}} หรือไม่?',
    noStocks: 'รายการนี้ไม่มีหุ้น',
    staysSaved_other: 'หุ้น {{n}} ตัวในรายการนี้ยังคงบันทึกไว้',
    deleting: 'กำลังลบ…',
  },
  picker: {
    addStock: 'เพิ่มหุ้น',
    noSavedStocks: 'ยังไม่มีหุ้นที่บันทึกไว้',
    addAStock: 'เพิ่มหุ้น',
    allInList: 'หุ้นที่บันทึกไว้อยู่ในรายการนี้ครบแล้ว',
    search: 'ค้นหาสัญลักษณ์หุ้นหรือชื่อ',
    noMatch: 'ไม่พบหุ้นที่ตรงกัน',
  },
  page: {
    importInto: 'นำเข้าลงรายการนี้',
    moreActions: 'การดำเนินการเพิ่มเติม',
    emptyTitle: 'รายการนี้ยังว่างอยู่',
    or: 'หรือ',
    caption: 'หุ้นใน {{name}}',
    remove: 'นำ {{ticker}} ออกจาก {{name}}',
  },
  toast: {
    deleted: 'ลบ {{name}} แล้ว',
    created: 'สร้างรายการแล้ว',
    renamed: 'เปลี่ยนชื่อรายการแล้ว',
    removed: 'นำ {{ticker}} ออกจาก {{name}} แล้ว',
    added: 'เพิ่ม {{ticker}} ใน {{name}} แล้ว',
  },
  problem: {
    nameTaken: 'มีรายการชื่อนี้อยู่แล้ว',
    gone: 'ไม่มีรายการนี้แล้ว หน้านี้โหลดใหม่แล้ว',
    createFailed: 'สร้างรายการไม่สำเร็จ ลองอีกครั้ง',
    renameFailed: 'เปลี่ยนชื่อรายการไม่สำเร็จ ลองอีกครั้ง',
    deleteFailed: 'ลบ {{name}} ไม่สำเร็จ ลองอีกครั้ง',
    undoFailed: 'เลิกทำไม่สำเร็จ เพิ่ม {{ticker}} ในรายการอีกครั้ง',
    alreadyIn: '{{ticker}} อยู่ใน {{name}} แล้ว หน้านี้โหลดใหม่แล้ว',
    noLongerExists: 'ไม่มี {{ticker}} หรือ {{name}} แล้ว หน้านี้โหลดใหม่แล้ว',
    addFailed: 'เพิ่ม {{ticker}} ใน {{name}} ไม่สำเร็จ ลองอีกครั้ง',
    alreadyRemoved: 'นำ {{ticker}} ออกจาก {{name}} แล้ว หน้านี้โหลดใหม่แล้ว',
    removeFailed: 'นำ {{ticker}} ออกจาก {{name}} ไม่สำเร็จ ลองอีกครั้ง',
  },
}
