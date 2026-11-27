import { describe, expect, it } from 'vitest'
import { en } from './catalogue/en/index'
import { th } from './catalogue/th/index'
import type { Catalogue } from './catalogue-types'

const leaves = (value: unknown, prefix = ''): string[] =>
  typeof value === 'string'
    ? [prefix]
    : Object.entries(value as object).flatMap(([k, v]) => leaves(v, prefix ? `${prefix}.${k}` : k))

const enKeys = leaves(en)
const thKeys = leaves(th)
const placeholders = (text: string) => [...text.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort()
const textOf = (catalogue: object, key: string) => key.split('.').reduce<any>((o, k) => o[k], catalogue) as string

describe('catalogues', () => {
  it('TC-U-1027: Thai has every English key (a plural _one is optional) and no other', () => {
    const required = enKeys.filter((k) => !k.endsWith('_one'))
    expect(required.filter((k) => !thKeys.includes(k)), 'missing in Thai').toEqual([])
    expect(thKeys.filter((k) => !enKeys.includes(k)), 'extra in Thai').toEqual([])
  })

  it('TC-U-1027: a plural has _other in both languages, and _one in English', () => {
    for (const key of enKeys.filter((k) => k.endsWith('_one'))) {
      expect(enKeys, key).toContain(key.replace(/_one$/, '_other'))
    }
    for (const key of thKeys.filter((k) => k.endsWith('_one'))) expect(thKeys, key).toContain(key.replace(/_one$/, '_other'))
  })

  it('TC-U-1027: a Thai message uses the same placeholders as the English one', () => {
    for (const key of thKeys) {
      expect(placeholders(textOf(th, key)), key).toEqual(placeholders(textOf(en, key)))
    }
  })

  it('TC-U-1027: no message is empty', () => {
    for (const key of enKeys) expect(textOf(en, key).trim(), key).not.toBe('')
    for (const key of thKeys) expect(textOf(th, key).trim(), key).not.toBe('')
  })
})

// Type-level checks: each `@ts-expect-error` fails `pnpm typecheck` when the line below stops being an error.
describe('catalogue types', () => {
  it('TC-U-1027: a Thai catalogue that misses or adds a key does not type-check', () => {
    // @ts-expect-error the Thai catalogue has no `nav`, `errors` or `fields`
    const missingAreas: Catalogue = { common: { stockCount_other: 'x', listCount_other: 'x', notSet: 'x' } }
    // @ts-expect-error `notSet` is missing from `common`
    const missingKey: Catalogue['common'] = { stockCount_other: 'x', listCount_other: 'x' }
    // @ts-expect-error `stockCount_other` is required in Thai
    const missingOther: Catalogue['common'] = { stockCount_one: 'x', listCount_other: 'x', notSet: 'x' }
    const extra: Catalogue['common'] = {
      stockCount_other: 'x',
      listCount_other: 'x',
      notSet: 'x',
      // @ts-expect-error `bogus` is not an English key
      bogus: 'x',
    }
    const optionalOne: Catalogue['common'] = { stockCount_one: 'x', stockCount_other: 'x', listCount_other: 'x', notSet: 'x' }
    expect([missingAreas, missingKey, missingOther, extra, optionalOne]).toHaveLength(5)
  })
})
