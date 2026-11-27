import { z } from 'zod'
import { boundedText } from './fields.ts'
import { MESSAGES } from './messages.ts'

/** Trimmed; inner spacing is kept as typed. Uniqueness is the database's job. */
export const ListName = boundedText(60, MESSAGES.listNameLength)
export type ListName = z.output<typeof ListName>
