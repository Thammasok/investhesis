import type { en } from './catalogue/en/index.ts'

type One<K> = K extends `${string}_one` ? K : never

/**
 * What a Thai catalogue must provide for a given English shape (NFR-006): every leaf a string, every
 * key present, none extra. Thai has one plural form (`other`), so an English `key_one` is optional
 * there and `key_other` is required. A missing or extra Thai key fails `pnpm typecheck`.
 */
type Shape<T> = T extends string
  ? string
  : { readonly [K in keyof T as K extends One<K> ? never : K]: Shape<T[K]> } & {
      readonly [K in keyof T as K extends One<K> ? K : never]?: string
    }

export type English = typeof en
export type Catalogue = Shape<English>
