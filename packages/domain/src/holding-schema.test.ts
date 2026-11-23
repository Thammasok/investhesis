import { describe, expect, it } from 'vitest'
import { HoldingInput, SettingsPatch } from './index.ts'

const failPaths = (schema: typeof HoldingInput | typeof SettingsPatch, input: unknown) => {
  const r = schema.safeParse(input)
  return r.success ? null : r.error.issues.map((i) => i.path.join('.'))
}

describe('HoldingInput', () => {
  it.each([
    [{ shares: '120.5', averageCost: '412.33', costCurrency: 'USD' }],
    [{}],
    [{ shares: null, averageCost: '0' }],
  ])('TC-U-410: accepts %j', (input) => {
    expect(HoldingInput.safeParse(input).success).toBe(true)
  })

  it.each([
    [{ shares: '0' }, 'shares'],
    [{ shares: '1.23456' }, 'shares'],
    [{ shares: '123456789012345' }, 'shares'],
    [{ averageCost: '-1' }, 'averageCost'],
    [{ shares: 10 }, 'shares'],
    [{ costCurrency: 'EUR' }, 'costCurrency'],
    [{ price: '1' }, 'price'],
  ])('TC-U-411: rejects %j on path %s', (input, path) => {
    expect(failPaths(HoldingInput, input)).toEqual([path])
  })

  it('TC-U-411: a zero spelled with decimals is not positive shares', () => {
    expect(failPaths(HoldingInput, { shares: '0.0000' })).toEqual(['shares'])
  })

  it('TC-U-412: the largest allowed values pass', () => {
    expect(HoldingInput.safeParse({ shares: '99999999999999.9999', averageCost: '0.0001' }).success).toBe(true)
  })
})

describe('SettingsPatch', () => {
  it.each([
    [{ concentrationThreshold: 1 }, true],
    [{ concentrationThreshold: 100 }, true],
    [{ concentrationThreshold: 0 }, false],
    [{ concentrationThreshold: 101 }, false],
    [{ concentrationThreshold: 40.5 }, false],
    [{ usdThbRate: '36.250000' }, true],
    [{ usdThbRate: null }, true],
    [{ usdThbRate: '0' }, false],
    [{ usdThbRate: '1.1234567' }, false],
    [{ usdThbRate: 36.25 }, false],
  ])('TC-U-413: %j -> ok %s', (input, ok) => {
    const r = SettingsPatch.safeParse(input)
    expect(r.success).toBe(ok)
    expect(failPaths(SettingsPatch, input)).toEqual(ok ? null : [Object.keys(input)[0]])
  })

  it('TC-U-413: an unknown key is rejected by name and an empty patch is fine', () => {
    expect(failPaths(SettingsPatch, { currency: 'USD' })).toEqual(['currency'])
    expect(SettingsPatch.safeParse({}).success).toBe(true)
  })
})
