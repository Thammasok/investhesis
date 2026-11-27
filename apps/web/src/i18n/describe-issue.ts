import { formatRule, issueRule, MESSAGE_KEYS, type Language, type MessageKey, type RuleParams } from '@investhesis/domain'
import { i18n } from './i18n.ts'

export type IssueInput = {
  /** Field path, e.g. `ticker` or `entry.note`. */
  path: string
  /** A rule id from a server problem body; absent from an older API, or one this web does not know. */
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
  return i18n.exists(key, { lng: lang }) ? i18n.t(key as 'fields.name', { lng: lang }) : name
}

/**
 * One error line: the field's label, then the rule's text in `lang` (`สัญลักษณ์หุ้น ต้องมี ...`).
 * A missing or unknown rule gives the generic `errors.invalidField` text with the label (FR-008).
 */
export function describeIssue(issue: IssueInput, lang: Language): string {
  const label = fieldLabel(issue.path, lang)
  if (issue.rule && isRule(issue.rule)) return `${label} ${formatRule(issue.rule, issue.params ?? undefined, lang)}`
  if (!issue.rule && issue.message !== undefined) {
    const decoded = issueRule(issue.message)
    if (decoded.rule !== 'invalid') return `${label} ${formatRule(decoded.rule, decoded.params, lang)}`
  }
  return i18n.t('errors.invalidField', { field: label, lng: lang })
}
