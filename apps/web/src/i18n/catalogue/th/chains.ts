import type { Catalogue } from '../../catalogue-types'
import type { chains } from '../en/chains'

export const chains_th: Catalogue<typeof chains> = {
  description: 'หุ้นของคุณตามห่วงโซ่ จากต้นน้ำถึงปลายน้ำ',
  seeConcentration: 'ดูการกระจุกตัว',
  stockCount_other: '{{n}} หุ้น',
  counts: {
    noneHeld: 'ไม่มีที่ถืออยู่',
    held: 'ถืออยู่ {{n}}',
  },
  leftOut: {
    amount_other: 'หุ้นที่ถืออยู่ {{n}} ตัวไม่มีจำนวนหุ้นหรือต้นทุน',
    usd_other: 'หุ้นที่ถือเป็น USD {{n}} ตัวต้องมีอัตราแลกเปลี่ยน',
    needs_other: '{{n}} ตัวต้องมีอัตราแลกเปลี่ยน',
    single_other: '{{what}} จึงไม่รวมในมูลค่า',
    both: '{{amount}} และ{{needs}} จึงไม่รวมในมูลค่า',
  },
  section: {
    stocks: 'หุ้น',
    alsoSpelled: 'สะกดอีกแบบ: {{names}}',
  },
  lane: {
    integrated: 'ครบวงจร (ครอบคลุมทุกขั้น)',
    noPosition: 'ไม่ระบุตำแหน่ง',
    noStocks: 'ไม่มีหุ้น',
  },
  entry: {
    held: 'ถืออยู่',
    setPosition: 'ระบุตำแหน่ง',
    setPositionOf: 'ระบุตำแหน่งของ {{ticker}}',
  },
  notes: {
    noChain_other: '{{stocks}}ในมุมมองนี้ไม่มีห่วงโซ่คุณค่า',
    showThem: 'แสดงหุ้นเหล่านั้น',
    rate: 'หุ้นที่ถือเป็น USD จะไม่รวมในมูลค่าจนกว่าจะบันทึกอัตราแลกเปลี่ยน',
    setRate: 'ตั้งอัตราที่หน้าการกระจุกตัว',
    advice: 'ห่วงโซ่คุณค่าและต้นทุนเหล่านี้เป็นการจัดประเภทของคุณเอง ไม่ใช่คำแนะนำ',
  },
  empty: {
    noStocksTitle: 'ยังไม่มีห่วงโซ่คุณค่า',
    noStocksHint: 'เพิ่มหุ้น แล้วระบุห่วงโซ่คุณค่าและตำแหน่งของแต่ละตัว',
    addStock: 'เพิ่มหุ้น',
    import: 'นำเข้า',
    noChainsTitle: 'ไม่มีห่วงโซ่คุณค่าในมุมมองนี้',
    noChainsHint: 'ระบุชื่อห่วงโซ่คุณค่าและตำแหน่ง (ต้นน้ำ กลางน้ำ ปลายน้ำ) ของหุ้นในหน้าแก้ไข',
    showNoChain_other: 'แสดง {{n}} หุ้นที่ไม่มีห่วงโซ่',
  },
  rename: {
    title: 'เปลี่ยนชื่อห่วงโซ่',
    goneHint: 'ห่วงโซ่นี้ถูกเปลี่ยนจากที่อื่น',
    goneTitle: 'ไม่มีห่วงโซ่นี้แล้ว',
    goneBody: 'อาจถูกเปลี่ยนชื่อจากที่อื่น',
    close: 'ปิด',
    mergeTitle: 'รวมเข้ากับ "{{name}}" หรือไม่?',
    mergeBody: '"{{from}}" ({{fromStocks}}) และ "{{other}}" ({{otherStocks}}) จะรวมเป็นห่วงโซ่เดียวชื่อ "{{to}}" และแยกกลับอัตโนมัติไม่ได้',
    back: 'ย้อนกลับ',
    merge: 'รวม {{stocks}}',
    body: 'เปลี่ยนชื่อใน {{stocks}} รวมถึงที่อยู่นอกมุมมองนี้',
    label: 'ชื่อห่วงโซ่',
    nameError: 'กรอกชื่อยาว 1 ถึง 60 ตัวอักษร',
    noChanges: 'ไม่มีการเปลี่ยนแปลงที่ต้องบันทึก',
  },
  action: {
    unknown: 'ไม่รู้จักการดำเนินการนี้',
    failed: 'เปลี่ยนชื่อห่วงโซ่ไม่สำเร็จ ลองอีกครั้ง',
    renamed: 'เปลี่ยนชื่อเป็น {{name}} แล้ว · เปลี่ยน {{stocks}}',
    merged: 'รวมเข้ากับ {{name}} แล้ว · {{stocks}}',
  },
}
