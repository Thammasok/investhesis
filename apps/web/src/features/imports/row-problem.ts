import { MESSAGE_KEYS, formatRule, type Language, type MessageKey } from '@investhesis/domain'
import type { RowProblem } from './types'

const isRule = (value: string): value is MessageKey => (MESSAGE_KEYS as readonly string[]).includes(value)

/**
 * One row problem as `column: text`. The text comes from the problem's `rule` and `params` in the
 * current language (including `columnMissing` and `repeatsRow`); a problem without a known rule keeps
 * the API's English `message`. The column name is the file's own header, so it stays as written.
 */
export function rowProblemText(problem: RowProblem, lang: Language): string {
  const { path, rule, params, message } = problem
  const text = rule !== undefined && rule !== 'invalid' && isRule(rule) ? formatRule(rule, params, lang) : message
  return `${path}: ${text}`
}
