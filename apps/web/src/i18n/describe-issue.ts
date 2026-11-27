import { formatRule, issueRule, type Language, type MessageKey, MESSAGE_KEYS } from '@investhesis/domain'
import type { RuleParams } from '@investhesis/domain'
import { translate } from './t.ts'

export type IssueInput = {
  /** Field path, e.g. `ticker` or `entry.note`. */
  path: string
  /** A rule id from a server problem body; absent from an older API. */
  rule?: string | null
  params?: RuleParams | null
  /** A client-side issue message (an encoded domain rule); used when there is no `rule`. */
  message?: string
}

const isRule = (s: string): s is MessageKey => (MESSAGE_KEYS as readonly string[]).includes(s)

/** The label of a field: its catalogue name, else the path as written. */
export function fieldLabel(path: string, lang: Language): string {
  const name = path.split('.').pop() ?? path
  const key = `fields.${name}`
  const label = translate(lang, key)
  return label === key ? name : label
}

/**
 * One error line: the field's label, then the rule's text in `lang` (`สัญลักษณ์หุ้น ต้องมี ...`).
 * A missing or unknown rule gives the generic `errors.invalidField` text with the label.
 */
export function describeIssue(issue: IssueInput, lang: Language): string {
  const label = fieldLabel(issue.path, lang)
  if (issue.rule && isRule(issue.rule)) return `${label} ${formatRule(issue.rule, issue.params ?? undefined, lang)}`
  if (issue.rule === undefined || issue.rule === null) {
    if (issue.message !== undefined) {
      const decoded = issueRule(issue.message)
      if (decoded.rule !== 'invalid') return `${label} ${formatRule(decoded.rule, decoded.params, lang)}`
    }
  }
  return translate(lang, 'errors.invalidField', { field: label })
}
