import { describe, expect, it } from 'vitest'
import { en } from './catalogue/en/index'
import { th } from './catalogue/th/index'

function leaves(value: unknown, prefix = ''): string[] {
  if (typeof value === 'string') return [prefix]
  return Object.entries(value as Record<string, unknown>).flatMap(([k, v]) => leaves(v, prefix ? `${prefix}.${k}` : k))
}

describe('catalogue parity', () => {
  it('TC-U-1024: every English key has a Thai text and Thai has no extra key (plural _one is optional)', () => {
    const english = leaves(en).filter((k) => !k.endsWith('_one'))
    const thai = leaves(th)
    expect(thai.filter((k) => !k.endsWith('_one')).sort()).toEqual(english.sort())
    expect(leaves(th).every((k) => typeof k === 'string')).toBe(true)
  })

  it('TC-U-1024: every Thai plural group has _other', () => {
    for (const key of leaves(en).filter((k) => k.endsWith('_one'))) {
      expect(leaves(th)).toContain(key.replace(/_one$/, '_other'))
    }
  })
})
