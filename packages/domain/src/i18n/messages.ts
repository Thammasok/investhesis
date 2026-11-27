import type { Language } from './languages.ts'

/** Positional arguments of the rules that take parameters, in the order the text reads them. */
export interface RuleArgs {
  oneOf: [values: readonly string[]]
  exchangeForMarket: [market: string, allowed: readonly string[]]
  indexForMarket: [market: string, allowed: readonly string[]]
  chainExists: [name: string, count: number]
  repeatsRow: [row: number]
}

/** Parameter names in the same order as RuleArgs, so a rule's params object maps to its arguments. */
export const RULE_PARAM_NAMES = {
  oneOf: ['values'],
  exchangeForMarket: ['market', 'allowed'],
  indexForMarket: ['market', 'allowed'],
  chainExists: ['name', 'count'],
  repeatsRow: ['row'],
} as const satisfies { [K in keyof RuleArgs]: readonly string[] }

export const MESSAGE_KEYS = [
  'required',
  'tickerFormat',
  'nameLength',
  'listNameLength',
  'valueChainLength',
  'themeLength',
  'themesMax',
  'oneOf',
  'exchangeForMarket',
  'indexForMarket',
  'thNeedsGics',
  'thNeedsSetGroup',
  'usNoSetGroup',
  'chainNeedsName',
  'unknownField',
  'rowBadValue',
  'decimalString',
  'sharesFormat',
  'averageCostFormat',
  'thresholdRange',
  'thesisNoteLength',
  'thesisInvalidationLength',
  'thesisDateFormat',
  'thesisDateFuture',
  'thesisTargetPriceFormat',
  'chainNotFound',
  'chainExists',
  'usdThbRateFormat',
  'columnMissing',
  'repeatsRow',
  'invalid',
] as const
export type MessageKey = (typeof MESSAGE_KEYS)[number]

/** A rule with parameters is a function of them; the rest are plain text. A missing key fails typecheck. */
export type MessageCatalogue = {
  [K in MessageKey]: K extends keyof RuleArgs ? (...args: RuleArgs[K]) => string : string
}

/** Today's English text, byte for byte. */
export const MESSAGES_EN = {
  required: 'is required',
  tickerFormat: 'must be 1-12 characters from A-Z, 0-9, "." and "-", starting with a letter or digit',
  nameLength: 'must be 1-200 characters',
  listNameLength: 'must be 1-60 characters',
  valueChainLength: 'must be 1-60 characters',
  themeLength: 'each theme must be 1-40 characters',
  themesMax: 'at most 20 themes',
  oneOf: (values) => `must be one of: ${values.join(', ')}`,
  exchangeForMarket: (market, allowed) => `must be ${allowed.join(' or ')} for market ${market}`,
  indexForMarket: (market, allowed) => `must be ${allowed.join(' or ')} for market ${market}`,
  thNeedsGics: 'is required when the SET industry group is set',
  thNeedsSetGroup: 'is required when the GICS sector is set',
  usNoSetGroup: 'applies to TH stocks only',
  chainNeedsName: 'is required when the value chain position is not None',
  unknownField: 'is not an accepted field',
  rowBadValue: 'is not valid',
  decimalString: 'must be a decimal number written as text',
  sharesFormat: 'must be greater than 0, with at most 14 digits before and 4 after the decimal point',
  averageCostFormat: 'must be 0 or more, with at most 14 digits before and 4 after the decimal point',
  thresholdRange: 'must be a whole number from 1 to 100',
  thesisNoteLength: 'must be 1-10,000 characters',
  thesisInvalidationLength: 'must be at most 2,000 characters',
  thesisDateFormat: 'must be a date written as YYYY-MM-DD',
  thesisDateFuture: "can't be in the future",
  thesisTargetPriceFormat: 'must be greater than 0, with at most 14 digits before and 4 after the decimal point',
  chainNotFound: 'This value chain no longer exists.',
  chainExists: (name, count) => `A chain named "${name}" already exists with ${count} ${count === 1 ? 'stock' : 'stocks'}.`,
  usdThbRateFormat: 'must be greater than 0, with at most 12 digits before and 6 after the decimal point',
  columnMissing: 'column is missing',
  repeatsRow: (row) => `repeats row ${row} in this file`,
  invalid: 'is not valid',
} as const satisfies MessageCatalogue

/** Thai text from the glossary of ux-design.md. Reads after a field label: `สัญลักษณ์หุ้น ต้องมี ...`. */
export const MESSAGES_TH = {
  required: 'ต้องระบุ',
  tickerFormat: 'ต้องมี 1-12 ตัวอักษร ใช้ได้เฉพาะ A-Z, 0-9, "." และ "-" และต้องขึ้นต้นด้วยตัวอักษรหรือตัวเลข',
  nameLength: 'ต้องมีความยาว 1-200 ตัวอักษร',
  listNameLength: 'ต้องมีความยาว 1-60 ตัวอักษร',
  valueChainLength: 'ต้องมีความยาว 1-60 ตัวอักษร',
  themeLength: 'แต่ละธีมต้องมีความยาว 1-40 ตัวอักษร',
  themesMax: 'ใส่ธีมได้ไม่เกิน 20 รายการ',
  oneOf: (values) => `ต้องเป็นค่าใดค่าหนึ่งต่อไปนี้: ${values.join(', ')}`,
  exchangeForMarket: (market, allowed) => `ต้องเป็น ${allowed.join(' หรือ ')} สำหรับตลาด ${market}`,
  indexForMarket: (market, allowed) => `ต้องเป็น ${allowed.join(' หรือ ')} สำหรับตลาด ${market}`,
  thNeedsGics: 'ต้องระบุเมื่อกำหนดกลุ่มอุตสาหกรรม SET',
  thNeedsSetGroup: 'ต้องระบุเมื่อกำหนดกลุ่มธุรกิจ (GICS)',
  usNoSetGroup: 'ใช้กับหุ้นไทย (TH) เท่านั้น',
  chainNeedsName: 'ต้องระบุเมื่อตำแหน่งในห่วงโซ่คุณค่าไม่ใช่ "ไม่มี"',
  unknownField: 'ไม่ใช่ฟิลด์ที่รับ',
  rowBadValue: 'ไม่ถูกต้อง',
  decimalString: 'ต้องเป็นเลขทศนิยมที่เขียนเป็นข้อความ',
  sharesFormat: 'ต้องมากกว่า 0 โดยมีไม่เกิน 14 หลักก่อนจุดทศนิยมและไม่เกิน 4 หลักหลังจุดทศนิยม',
  averageCostFormat: 'ต้องไม่น้อยกว่า 0 โดยมีไม่เกิน 14 หลักก่อนจุดทศนิยมและไม่เกิน 4 หลักหลังจุดทศนิยม',
  thresholdRange: 'ต้องเป็นจำนวนเต็มตั้งแต่ 1 ถึง 100',
  thesisNoteLength: 'ต้องมีความยาว 1-10,000 ตัวอักษร',
  thesisInvalidationLength: 'ต้องมีความยาวไม่เกิน 2,000 ตัวอักษร',
  thesisDateFormat: 'ต้องเป็นวันที่ในรูปแบบ YYYY-MM-DD',
  thesisDateFuture: 'ต้องไม่เป็นวันที่ในอนาคต',
  thesisTargetPriceFormat: 'ต้องมากกว่า 0 โดยมีไม่เกิน 14 หลักก่อนจุดทศนิยมและไม่เกิน 4 หลักหลังจุดทศนิยม',
  chainNotFound: 'ไม่พบห่วงโซ่คุณค่านี้แล้ว',
  chainExists: (name, count) => `มีห่วงโซ่ชื่อ "${name}" อยู่แล้ว ซึ่งมี ${count} หุ้น`,
  usdThbRateFormat: 'ต้องมากกว่า 0 โดยมีไม่เกิน 12 หลักก่อนจุดทศนิยมและไม่เกิน 6 หลักหลังจุดทศนิยม',
  columnMissing: 'ไม่มีคอลัมน์นี้',
  repeatsRow: (row) => `ซ้ำกับแถวที่ ${row} ในไฟล์นี้`,
  invalid: 'ไม่ถูกต้อง',
} as const satisfies MessageCatalogue

export const MESSAGES_BY_LANGUAGE: Record<Language, MessageCatalogue> = { en: MESSAGES_EN, th: MESSAGES_TH }
