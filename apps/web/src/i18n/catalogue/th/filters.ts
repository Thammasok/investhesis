import type { Catalogue } from '../../catalogue-types'
import type { filters } from '../en/filters'

export const filters_th: Catalogue<typeof filters> = {
  stockCount_other: '{{n}} หุ้น',
  names: {
    held: 'การถือครอง',
    exchange: 'ตลาดหลักทรัพย์',
  },
  held: {
    yes: 'ถืออยู่',
    no: 'ไม่ได้ถือ',
  },
  result: {
    all: '{{stocks}}{{suffix}}',
    filtered: '{{shown}} จาก {{stocks}}{{suffix}}',
  },
  toolbar: {
    searchLabel: 'ค้นหาหุ้น',
    searchPlaceholder: 'ค้นหาสัญลักษณ์หุ้น ชื่อ หรือธีม',
    clearSearch: 'ล้างการค้นหา',
    searchBadge: 'ค้นหา: {{text}}',
    removeSearch: 'ลบการค้นหา: {{text}}',
    removeFilter: 'ลบตัวกรอง {{text}}',
    clearAll: 'ล้างทั้งหมด',
  },
  sheet: {
    title: 'ตัวกรอง',
    active: 'ที่ใช้อยู่',
    find: 'ค้นหาใน {{filter}}',
    findPlaceholder: 'ค้นหาตัวเลือก',
    noMatch: 'ไม่พบตัวเลือก',
    clearAll: 'ล้างทั้งหมด',
    show: 'แสดง {{stocks}}',
    option: '{{label}}, {{stocks}}',
  },
  noMatches: {
    title: 'ไม่พบหุ้นที่ตรงกัน',
    hint: 'ลองค้นหาด้วยคำอื่นหรือใช้ตัวกรองน้อยลง',
    clearAll: 'ล้างทั้งหมด',
  },
  scope: {
    label: 'ขอบเขต',
    all: 'หุ้นทั้งหมด ({{n}})',
    held: 'หุ้นที่ถืออยู่ ({{n}})',
    lists: 'รายการหุ้น',
    gone: 'ไม่มีรายการนั้นแล้ว แสดงหุ้นทั้งหมด',
    nameAll: 'หุ้นทั้งหมด',
    nameHeld: 'หุ้นที่ถืออยู่',
    nameList: 'รายการ {{name}}',
  },
  notes: {
    emptyValue: 'ค่าว่างของ {{label}} ไม่ถูกต้อง จึงไม่นำมาใช้',
    badValue: '"{{value}}" ไม่ใช่ค่าของ {{label}} จึงไม่นำตัวกรองนี้มาใช้',
    searchTwice: 'มีการระบุคำค้นหามากกว่าหนึ่งครั้ง จึงไม่นำมาใช้',
    sortTwice: 'มีการระบุคอลัมน์เรียงลำดับมากกว่าหนึ่งครั้ง จึงใช้ลำดับเริ่มต้น',
    badSort: '"{{value}}" ไม่ใช่คอลัมน์ที่เรียงลำดับได้ จึงใช้ลำดับเริ่มต้น',
    dirTwice: 'มีการระบุทิศทางการเรียงมากกว่าหนึ่งครั้ง จึงเรียงจากน้อยไปมาก',
    badDir: '"{{value}}" ไม่ใช่ทิศทางการเรียง จึงเรียงจากน้อยไปมาก',
  },
}
