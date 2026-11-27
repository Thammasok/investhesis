import { common } from './common.ts'
import { errors } from './errors.ts'
import { fields } from './fields.ts'
import { nav } from './nav.ts'

/** The English catalogue: the source of every key, and the fallback for a missing Thai one. */
export const en = { nav, common, errors, fields } as const
