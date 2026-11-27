import type { Catalogue } from '../../catalogue-types'
import type { holdings } from '../en/holdings'

export const holdings_th: Catalogue<typeof holdings> = {
  title: 'การถือครอง',
  held: 'ถืออยู่',
  notHeld: 'ไม่ได้ถือ',
  markAsHeld: 'ระบุว่าถืออยู่',
  edit: 'แก้ไข',
  shares: 'จำนวนหุ้น',
  averageCost: 'ต้นทุนเฉลี่ย',
  cost: 'ต้นทุน',
  amountNotEntered: 'ยังไม่ได้กรอกจำนวน',
  addFigures: 'เพิ่มจำนวนหุ้นและต้นทุนเพื่อนำไปคิดน้ำหนักมูลค่า',
  restoreFailed: 'กู้คืนการถือครองไม่สำเร็จ โปรดระบุว่าถืออยู่อีกครั้ง',
  saved: 'บันทึกการถือครองแล้ว',
  markedHeld: 'ระบุว่าถือ {{ticker}} อยู่แล้ว',
  noLongerHeld: 'เลิกถือ {{ticker}} แล้ว',
  dialogTitle: 'การถือครอง · {{ticker}}',
  sharesOptional: 'จำนวนหุ้น (ไม่บังคับ)',
  averageCostOptional: 'ต้นทุนเฉลี่ยต่อหุ้น (ไม่บังคับ)',
  costCurrency: 'สกุลเงินต้นทุน',
  stopHolding: 'เลิกถือ',
  stockGone: 'ไม่มีหุ้นนี้แล้ว',
  saveFailed: 'บันทึกการถือครองไม่สำเร็จ โปรดลองอีกครั้ง',
  iHold: 'ฉันถือหุ้นนี้อยู่',
  leaveEmpty: 'เว้นจำนวนหุ้นหรือต้นทุนว่างไว้ได้ หากไม่ต้องการติดตามจำนวน',
}
