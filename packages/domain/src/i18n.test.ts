import { describe, expect, it } from 'vitest'
import {
  LANGUAGES,
  LENS_LABELS_EN,
  LENS_LABELS_TH,
  LENS_VALUES,
  LENS_VALUE_LABELS_EN,
  LENS_VALUE_LABELS_TH,
  MARKET_LABELS,
  MESSAGES,
  MESSAGES_EN,
  MESSAGES_TH,
  MESSAGE_KEYS,
  NOT_SET_LABELS,
  SettingsPatch,
  StockInput,
  THESIS_TYPE_LABELS,
  THESIS_TYPE_LABELS_TH,
  filterOptions,
  formatRule,
  groupConcentration,
  issueRule,
  issueText,
  lensValueLabel,
  rule,
  type FilterableStock,
  type LabelOrder,
} from './index.ts'

const firstIssue = (
  result: { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } },
  path: string,
): { message: string } => result.error?.issues.find((i) => i.path.join('.') === path) ?? { message: '(no issue)' }

describe('rule ids', () => {
  it('TC-U-1000 a parameterless rule round-trips and renders in both languages', () => {
    const result = StockInput.safeParse({ market: 'US', ticker: '!!', name: 'X', exchange: 'NYSE' })
    const issue = firstIssue(result, 'ticker')
    const { rule: key, params } = issueRule(issue.message)
    expect(key).toBe('tickerFormat')
    expect(params).toBeUndefined()
    expect(formatRule(key, params, 'en')).toBe(
      'must be 1-12 characters from A-Z, 0-9, "." and "-", starting with a letter or digit',
    )
    expect(formatRule(key, params, 'th')).toBe(MESSAGES_TH.tickerFormat)
  })

  it('TC-U-1001 a parameterised rule carries its params', () => {
    const result = StockInput.safeParse({ market: 'TH', ticker: 'PTT', name: 'PTT', exchange: 'NYSE' })
    const issue = firstIssue(result, 'exchange')
    const { rule: key, params } = issueRule(issue.message)
    expect(key).toBe('exchangeForMarket')
    expect(params).toEqual({ market: 'TH', allowed: ['SET', 'mai'] })
    expect(formatRule(key, params, 'en')).toBe('must be SET or mai for market TH')
    expect(formatRule(key, params, 'th')).toBe('ต้องเป็น SET หรือ mai สำหรับตลาด TH')
  })

  it('TC-U-1002 a message the domain did not encode decodes to invalid', () => {
    for (const m of ['Invalid input: expected string, received number', '', 'oneOf|{not json', 'oneOf|[1]', 'nope|{}']) {
      expect(issueRule(m)).toEqual({ rule: 'invalid', params: undefined })
    }
  })

  it('TC-U-1003 English rendering is unchanged for every rule', () => {
    const samples: Record<string, [Record<string, unknown> | undefined, string]> = {
      oneOf: [{ values: ['US', 'TH'] }, 'must be one of: US, TH'],
      exchangeForMarket: [{ market: 'TH', allowed: ['SET', 'mai'] }, 'must be SET or mai for market TH'],
      indexForMarket: [{ market: 'US', allowed: ['S&P 500', 'Nasdaq-100'] }, 'must be S&P 500 or Nasdaq-100 for market US'],
      chainExists: [{ name: 'Oil', count: 1 }, 'A chain named "Oil" already exists with 1 stock.'],
      repeatsRow: [{ row: 4 }, 'repeats row 4 in this file'],
    }
    for (const key of MESSAGE_KEYS) {
      const sample = samples[key]
      const expected = sample ? sample[1] : (MESSAGES as Record<string, unknown>)[key]
      expect(formatRule(key, sample?.[0], 'en')).toBe(expected)
      expect(formatRule(key, sample?.[0], 'th').length).toBeGreaterThan(0)
    }
    expect(formatRule('chainExists', { name: 'Oil', count: 3 }, 'en')).toBe('A chain named "Oil" already exists with 3 stocks.')
    expect(formatRule('oneOf', undefined, 'en')).toBe(MESSAGES_EN.invalid)
    expect(MESSAGES_EN.thesisDateFuture).toBe("can't be in the future")
    expect(Object.keys(MESSAGES_TH).sort()).toEqual([...MESSAGE_KEYS].sort())
  })

  it('TC-U-1011 issueText renders encoded rules and passes other text through', () => {
    expect(issueText(rule('oneOf', { values: ['a', 'b'] }))).toBe('must be one of: a, b')
    expect(issueText(rule('required'), 'th')).toBe('ต้องระบุ')
    expect(issueText('Invalid input: expected string')).toBe('Invalid input: expected string')
    expect(issueText('oneOf|{bad')).toBe('oneOf|{bad')
    expect(issueText('')).toBe('')
  })

  it('TC-U-1009 SettingsPatch accepts the two languages only', () => {
    expect(LANGUAGES).toEqual(['en', 'th'])
    expect(SettingsPatch.safeParse({ language: 'th' }).success).toBe(true)
    expect(SettingsPatch.safeParse({ language: 'en' }).success).toBe(true)
    for (const bad of ['fr', null]) {
      const r = SettingsPatch.safeParse({ language: bad })
      expect(r.success).toBe(false)
      const issue = firstIssue(r, 'language')
      expect(issueRule(issue.message)).toEqual({ rule: 'oneOf', params: { values: ['en', 'th'] } })
    }
  })

  it('TC-U-1010 import rules render with their params', () => {
    expect(formatRule('columnMissing', undefined, 'en')).toBe('column is missing')
    expect(formatRule('columnMissing', undefined, 'th')).toBe(MESSAGES_TH.columnMissing)
    expect(formatRule('repeatsRow', { row: 4 }, 'en')).toBe('repeats row 4 in this file')
    expect(formatRule('repeatsRow', { row: 4 }, 'th')).toBe('ซ้ำกับแถวที่ 4 ในไฟล์นี้')
    expect(issueRule(rule('repeatsRow', { row: 4 }))).toEqual({ rule: 'repeatsRow', params: { row: 4 } })
  })
})

describe('labels', () => {
  it('TC-U-1004 every lens value has a Thai label and English labels equal the canonical value', () => {
    for (const [lens, values] of Object.entries(LENS_VALUES)) {
      for (const v of values) {
        expect(lensValueLabel(lens, v, 'en')).toBe(v)
        const th = lensValueLabel(lens, v, 'th')
        expect(th.length).toBeGreaterThan(0)
        expect(/^B2[BC]$/.test(v) || th !== v).toBe(true)
      }
      expect(Object.keys(LENS_VALUE_LABELS_TH[lens as keyof typeof LENS_VALUE_LABELS_TH]).sort()).toEqual([...values].sort())
      expect(Object.keys(LENS_VALUE_LABELS_EN[lens as keyof typeof LENS_VALUE_LABELS_EN]).sort()).toEqual([...values].sort())
    }
    expect(lensValueLabel('gicsSector', 'Energy', 'th')).toBe('พลังงาน')
    expect(lensValueLabel('size', 'Mega', 'en')).toBe('Mega')
    expect(lensValueLabel('setIndustryGroup', 'Financials', 'th')).toBe('ธุรกิจการเงิน')
    expect(lensValueLabel('market', 'US', 'th')).toBe(MARKET_LABELS.th.US)
    expect(NOT_SET_LABELS.th).toBe('ยังไม่ระบุ')
    expect(THESIS_TYPE_LABELS_TH.review).toBe('ทบทวน')
    expect(THESIS_TYPE_LABELS.buy).toBe('Buy')
    expect(Object.keys(LENS_LABELS_TH)).toEqual(Object.keys(LENS_LABELS_EN))
  })

  it('TC-U-1005 free-text and unknown values pass through', () => {
    expect(lensValueLabel('themes', 'AI', 'th')).toBe('AI')
    expect(lensValueLabel('valueChain', 'Oil & Gas', 'th')).toBe('Oil & Gas')
    expect(lensValueLabel('gicsSector', 'Bogus', 'th')).toBe('Bogus')
    expect(lensValueLabel('gicsSector', 'constructor', 'th')).toBe('constructor')
    expect(lensValueLabel('toString', 'Energy', 'th')).toBe('Energy')
    expect(lensValueLabel('market', 'XX', 'th')).toBe('XX')
  })
})

describe('ordering', () => {
  let n = 0
  const stock = (over: Partial<FilterableStock>): FilterableStock => ({
    id: `id-${++n}`,
    createdAt: '2026-01-01T00:00:00.000Z',
    market: 'US',
    exchange: 'NYSE',
    ticker: `T${n}`,
    name: `N${n}`,
    gicsSector: null,
    setIndustryGroup: null,
    valueChain: null,
    valueChainPosition: null,
    size: null,
    style: null,
    economicCycle: null,
    lynchType: null,
    lifeCycle: null,
    customers: [],
    revenueTypes: [],
    moat: null,
    themes: [],
    volatility: null,
    indexMembership: [],
    holding: null,
    ...over,
  })
  const collator = new Intl.Collator('th')
  const order: LabelOrder = {
    label: (lens, value) => lensValueLabel(lens, value, 'th'),
    compare: (a, b) => collator.compare(a, b),
  }
  const sectors = [
    stock({ gicsSector: 'Energy' }),
    stock({ gicsSector: 'Financials' }),
    stock({ gicsSector: 'Utilities' }),
    stock({ gicsSector: null }),
  ]

  it('TC-U-1006 filterOptions orders by the given label and collator, Not set last', () => {
    const values = filterOptions(sectors, { order }).gicsSector.filter((o) => o.count > 0).map((o) => o.value)
    expect(values).toEqual(['Financials', 'Energy', 'Utilities', null])
    const all = filterOptions(sectors, { order }).gicsSector
    expect(all.at(-1)?.value).toBeNull()
    // an ordinal lens keeps its natural order, and market/held/exchange are untouched
    const o = filterOptions(sectors, { order })
    expect(o.size.map((x) => x.value)).toEqual(['Mega', 'Large', 'Mid', 'Small', 'Micro', null])
    expect(o.market.map((x) => x.value)).toEqual(['US', 'TH'])
    // free text sorts by the same collator
    const themed = filterOptions([stock({ themes: ['beta', 'Alpha'] })], { order }).themes.map((x) => x.value)
    expect(themed).toEqual(['Alpha', 'beta', null])
  })

  it('TC-U-1007 without order, filterOptions and groupConcentration keep today\'s order', () => {
    const plain = filterOptions(sectors).gicsSector.map((o) => o.value)
    expect(plain).toEqual([...LENS_VALUES.gicsSector, null])
    expect(filterOptions(sectors, {})).toEqual(filterOptions(sectors))
    const groups = groupConcentration({ stocks: sectors, lens: 'gicsSector', usdThbRate: null, threshold: 40 }).groups
    expect(groups.map((g) => g.label)).toEqual(['Energy', 'Financials', 'Utilities', 'Not set'])
  })

  it('TC-U-1008 groupConcentration breaks size ties by the displayed label', () => {
    const stocks = [stock({ gicsSector: 'Energy' }), stock({ gicsSector: 'Financials' })]
    const base = { stocks, lens: 'gicsSector' as const, usdThbRate: null, threshold: 40 }
    expect(groupConcentration(base).groups.map((g) => g.label)).toEqual(['Energy', 'Financials'])
    expect(groupConcentration({ ...base, order }).groups.map((g) => g.label)).toEqual(['Financials', 'Energy'])
    // size still beats the label
    const more = [...stocks, stock({ gicsSector: 'Energy' })]
    expect(groupConcentration({ ...base, stocks: more, order }).groups.map((g) => g.label)).toEqual(['Energy', 'Financials'])
  })
})
