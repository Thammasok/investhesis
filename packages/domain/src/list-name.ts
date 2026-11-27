import { z } from 'zod'
import { boundedText } from './fields.ts'
import { rule } from './i18n/rules.ts'

/** Trimmed; inner spacing is kept as typed. Uniqueness is the database's job. */
export const ListName = boundedText(60, rule('listNameLength'))
export type ListName = z.output<typeof ListName>
