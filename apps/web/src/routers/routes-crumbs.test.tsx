import { describe, expect, it } from 'vitest'
import type { RouteObject } from 'react-router'
import { en } from '@/i18n/catalogue/en/index'
import { FakeAuthClient } from '@/test/fake-auth-client'
import { emptyApi } from '@/test/stub-api'
import { createRoutes } from './router'

const keys = new Set(Object.entries(en).flatMap(([area, entries]) => Object.keys(entries).map((k) => `${area}.${k}`)))
const crumbs = (routes: RouteObject[]): unknown[] =>
  routes.flatMap((r) => [(r.handle as { crumb?: unknown } | undefined)?.crumb, ...crumbs(r.children ?? [])])

describe('route crumbs', () => {
  it('TC-U-1032: every string crumb is a key of the English catalogue', () => {
    const strings = crumbs(createRoutes(FakeAuthClient.signedIn(), { apiClient: emptyApi().client() })).filter((c) => typeof c === 'string')
    expect(strings.length).toBeGreaterThan(8)
    expect(strings.filter((c) => !keys.has(c as string))).toEqual([])
  })
})
