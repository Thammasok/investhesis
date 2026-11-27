import type { Catalogue } from '../../catalogue-types.ts'
import { common } from './common.ts'
import { errors } from './errors.ts'
import { fields } from './fields.ts'
import { nav } from './nav.ts'

/** The Thai catalogue. Its own chunk: loaded when the language is Thai (FR-014). */
export const th = { nav, common, errors, fields } as const satisfies Catalogue
