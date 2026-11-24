import { describe, expect, it } from 'vitest'
import { THESIS_TYPES, THESIS_TYPE_LABELS, latestThesisDate, thesisInput, thesisPatch } from './theses.ts'

const today = '2026-11-24'
const input = thesisInput({ today })
const patch = thesisPatch({ today })
const base = { type: 'buy', date: today, note: 'x' }
const paths = (r: { success: boolean; error?: { issues: { path: PropertyKey[] }[] } }) =>
  r.error?.issues.map((i) => i.path.join('.'))

describe('thesisInput', () => {
  it('TC-U-700: a complete valid entry parses and normalises', () => {
    const r = input.safeParse({
      type: 'buy',
      date: '2026-11-24',
      note: '  Capex up\r\nMargins hold  ',
      targetPrice: '180',
      invalidation: '  ',
    })
    expect(r.success && r.data).toEqual({
      type: 'buy',
      date: '2026-11-24',
      note: 'Capex up\nMargins hold',
      targetPrice: '180',
      invalidation: null,
    })
  })

  it('TC-U-701: type must be one of the four', () => {
    expect(paths(input.safeParse({ ...base, type: 'hold' }))).toEqual(['type'])
    expect(paths(input.safeParse({ date: today, note: 'x' }))).toEqual(['type'])
    expect(THESIS_TYPES.map((t) => THESIS_TYPE_LABELS[t])).toEqual(['Buy', 'Sell', 'Update', 'Review'])
  })

  it('TC-U-702: date boundaries', () => {
    const ok = (date: string) => input.safeParse({ ...base, date }).success
    expect(['2026-11-24', '2026-11-25', '2024-02-29', '2025-02-29', '2026-13-01', '24/11/2026'].map(ok)).toEqual([
      true,
      false,
      true,
      false,
      false,
      false,
    ])
    expect(paths(input.safeParse({ ...base, date: '2026-11-25' }))).toEqual(['date'])
    expect(paths(input.safeParse({ ...base, date: '24/11/2026' }))).toEqual(['date'])
  })

  it('TC-U-703: note length counts code points after trimming', () => {
    const ok = (note: string) => input.safeParse({ ...base, note }).success
    expect([ok('   '), ok('a'), ok('😀'.repeat(10000)), ok('a'.repeat(10001))]).toEqual([false, true, true, false])
  })

  it('TC-U-704: invalidation length and empty handling', () => {
    const run = (invalidation: unknown) => input.safeParse({ ...base, invalidation })
    expect(run('a'.repeat(2000)).success).toBe(true)
    const long = run('a'.repeat(2001))
    expect(long.success).toBe(false)
    expect(paths(long)).toEqual(['invalidation'])
    const empty = run('')
    const nul = run(null)
    expect(empty.success && empty.data.invalidation).toBeNull()
    expect(nul.success && nul.data.invalidation).toBeNull()
  })

  it('TC-U-705: target price is an exact positive decimal string', () => {
    const run = (targetPrice: unknown) => input.safeParse({ ...base, targetPrice })
    const outcome = ['0', '0.0001', '12345678901234.5678', '123456789012345', '1.23456', 180, '', null].map((v) => {
      const r = run(v)
      return r.success ? r.data.targetPrice : 'fail'
    })
    expect(outcome).toEqual(['fail', '0.0001', '12345678901234.5678', 'fail', 'fail', 'fail', null, null])
    expect(paths(run(180))).toEqual(['targetPrice'])
  })

  it('TC-U-706: unknown keys are rejected with the key as the path', () => {
    expect(paths(input.safeParse({ ...base, userId: 'x' }))).toEqual(['userId'])
    expect(paths(patch.safeParse({ userId: 'x' }))).toEqual(['userId'])
  })
})

describe('thesisPatch', () => {
  it('TC-U-707: fields are optional and null clears', () => {
    expect(patch.safeParse({}).success).toBe(true)
    const clear = patch.safeParse({ targetPrice: null, invalidation: null })
    expect(clear.success && clear.data).toEqual({ targetPrice: null, invalidation: null })
    const empty = patch.safeParse({ note: '' })
    expect(empty.success).toBe(false)
    expect(paths(empty)).toEqual(['note'])
    expect(patch.safeParse({ date: '2026-11-25' }).success).toBe(false)
  })
})

describe('latestThesisDate', () => {
  it('TC-U-708: is the latest calendar date anywhere', () => {
    const at = (s: string) => latestThesisDate(new Date(s))
    expect([at('2026-11-24T09:59:59Z'), at('2026-11-24T10:00:00Z'), at('2026-12-31T23:00:00Z')]).toEqual([
      '2026-11-24',
      '2026-11-25',
      '2027-01-01',
    ])
  })
})
