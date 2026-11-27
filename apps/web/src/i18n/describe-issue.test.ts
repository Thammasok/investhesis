import { describe, expect, it } from 'vitest'
import { MESSAGES_TH, rule } from '@investhesis/domain'
import { describeIssue } from './describe-issue'
import { setLanguage } from './language'

describe('describeIssue', () => {
  it('TC-U-1031: translates server errors from rule and degrades safely', async () => {
    await setLanguage('th')
    expect(describeIssue({ path: 'ticker', rule: 'tickerFormat' }, 'th')).toBe(`สัญลักษณ์หุ้น ${MESSAGES_TH.tickerFormat}`)
    expect(describeIssue({ path: 'ticker', rule: 'futureRule' }, 'th')).toBe('สัญลักษณ์หุ้น ไม่ถูกต้อง')
    expect(describeIssue({ path: 'ticker' }, 'th')).toBe('สัญลักษณ์หุ้น ไม่ถูกต้อง')
    expect(describeIssue({ path: 'ticker', rule: null, message: 'must be something' }, 'th')).toBe('สัญลักษณ์หุ้น ไม่ถูกต้อง')
  })

  it('TC-U-1031: params fill the rule text, client messages are decoded, and English reads the same way', () => {
    expect(describeIssue({ path: 'ticker', rule: 'tickerFormat' }, 'en')).toMatch(/^Ticker must be 1-12/)
    expect(describeIssue({ path: 'market', rule: 'oneOf', params: { values: ['US', 'TH'] } }, 'en')).toContain('US')
    expect(describeIssue({ path: 'entry.note', message: rule('required') }, 'en')).toMatch(/^Note /)
    expect(describeIssue({ path: 'mystery', rule: 'tickerFormat' }, 'en')).toMatch(/^mystery /)
  })
})
