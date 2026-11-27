import { common } from './common'
import { errors } from './errors'
import { fields } from './fields'
import { nav } from './nav'
import { placeholder } from './placeholder'

/** The source of truth for keys and English text. Thai is typed against it. */
export const en = { common, errors, fields, nav, placeholder } as const
