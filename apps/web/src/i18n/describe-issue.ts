import { MESSAGE_KEYS, formatRule, issueRule, type Language, type MessageKey, type RuleParams } from '@investhesis/domain'
import { i18n } from './i18n'

export type IssueLike = { path: string; rule?: string | undefined; params?: RuleParams | undefined; message?: string }

const isRule = (value: string): value is MessageKey => (MESSAGE_KEYS as readonly string[]).includes(value)

/** The label of a field path such as `ticker` or `holding.shares`; an unknown path is shown as it is. */
export function fieldLabel(path: string, lang: Language): string {
  const key = `fields.${path.split('.').pop()}`
  return i18n.exists(key) ? i18n.t(key as never, { lng: lang }) : path
}

/**
 * Field label + rule text (FR-008). A client issue carries the domain's encoded `message`, a server
 * error carries `rule` and `params`; a missing or unknown rule gives `errors.invalidField`.
 */
export function describeIssue(issue: IssueLike, lang: Language): string {
  const label = fieldLabel(issue.path, lang)
  let key = issue.rule
  let params = issue.params
  if (key === undefined && issue.message !== undefined) {
    const decoded = issueRule(issue.message)
    key = decoded.rule
    params = decoded.params
  }
  if (key === undefined || key === 'invalid' || !isRule(key)) {
    return i18n.t('errors.invalidField', { field: label, lng: lang })
  }
  return `${label} ${formatRule(key, params, lang)}`
}
