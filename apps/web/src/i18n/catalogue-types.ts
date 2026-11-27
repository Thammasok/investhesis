import type { en } from './catalogue/en/index.ts'

type Plural = { readonly one: string; readonly other: string }

/** What a Thai (or any other language) catalogue must provide for a given English shape. */
type Shape<T> = T extends string ? string : T extends Plural ? { readonly other: string } : { readonly [K in keyof T]: Shape<T[K]> }

export type English = typeof en
export type Catalogue = Shape<English>
export type CatalogueEntry = string | Plural | { readonly other: string }

type Paths<T, P extends string = ''> = {
  [K in keyof T & string]: T[K] extends string ? `${P}${K}` : T[K] extends Plural ? `${P}${K}` : Paths<T[K], `${P}${K}.`>
}[keyof T & string]

/** Every dotted key of the English catalogue that holds a message. */
export type CatalogueKey = Paths<English>
export type Params = Readonly<Record<string, string | number>>
