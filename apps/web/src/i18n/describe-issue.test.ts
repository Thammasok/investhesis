import { MESSAGES_TH, rule } from '@investhesis/domain'
import { describe, expect, it } from 'vitest'
import { th } from './catalogue/th/index'
import { describeIssue } from './describe-issue'
import { i18n } from './i18n'

describe('describeIssue', () => {
  it('TC-U-1031: translates server errors from rule and degrades safely', () => {
    i18n.addResourceBundle('th', 'translation', th, true, true)
    const label = th.fields.ticker
    expect(describeIssue({ path: 'ticker', rule: 'tickerFormat' }, 'th')).toBe(`${label} ${MESSAGES_TH.tickerFormat}`)
    const generic = `${label} ไม่ถูกต้อง`
    expect(describeIssue({ path: 'ticker', rule: 'futureRule' }, 'th')).toBe(generic)
    expect(describeIssue({ path: 'ticker', message: 'plain english' }, 'th')).toBe(generic)
  })

  it('decodes a client issue message and uses the English label in English', () => {
    expect(describeIssue({ path: 'ticker', message: rule('tickerFormat') }, 'en')).toMatch(/^Ticker must be 1-12/)
    expect(describeIssue({ path: 'holding.shares', message: rule('sharesFormat') }, 'en')).toMatch(/^Shares /)
    expect(describeIssue({ path: 'mystery', rule: 'required' }, 'en')).toMatch(/^mystery /)
  })
})
