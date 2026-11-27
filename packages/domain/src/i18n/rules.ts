import type { Language } from './languages.ts'
import { MESSAGES_BY_LANGUAGE, MESSAGE_KEYS, RULE_PARAM_NAMES } from './messages.ts'
import type { MessageKey, RuleArgs } from './messages.ts'

export type RuleParams = Readonly<Record<string, unknown>>
export type Rule = MessageKey

const isKey = (s: string): s is MessageKey => (MESSAGE_KEYS as readonly string[]).includes(s)

/** Params object of each rule that takes parameters. */
export interface RuleParamTypes {
  oneOf: { values: readonly string[] }
  exchangeForMarket: { market: string; allowed: readonly string[] }
  indexForMarket: { market: string; allowed: readonly string[] }
  chainExists: { name: string; count: number }
  repeatsRow: { row: number }
}

/**
 * Encodes a rule as an issue message: "key" or "key|<json params>". Zod carries only a string
 * message reliably across built-in and custom checks, hence the encoding.
 */
export function rule<K extends MessageKey>(key: K, ...params: K extends keyof RuleParamTypes ? [RuleParamTypes[K]] : []): string {
  return params.length === 0 ? key : `${key}|${JSON.stringify(params[0])}`
}

/** Decodes an issue message; any text the domain did not encode is the `invalid` rule. */
export function issueRule(message: string): { rule: MessageKey; params: RuleParams | undefined } {
  const bar = message.indexOf('|')
  const key = bar === -1 ? message : message.slice(0, bar)
  if (!isKey(key)) return { rule: 'invalid', params: undefined }
  if (bar === -1) return { rule: key, params: undefined }
  try {
    const params: unknown = JSON.parse(message.slice(bar + 1))
    if (typeof params === 'object' && params !== null && !Array.isArray(params)) {
      return { rule: key, params: params as RuleParams }
    }
  } catch {
    // fall through
  }
  return { rule: 'invalid', params: undefined }
}

/** The text of a rule in one language. A rule that needs params and gets none renders as `invalid`. */
export function formatRule(key: MessageKey, params: RuleParams | undefined, lang: Language): string {
  const catalogue = MESSAGES_BY_LANGUAGE[lang]
  const entry = catalogue[key]
  if (typeof entry === 'string') return entry
  const names: readonly string[] = RULE_PARAM_NAMES[key as keyof RuleArgs]
  const args = names.map((n) => params?.[n])
  if (args.some((a) => a === undefined)) return catalogue.invalid
  return (entry as (...a: unknown[]) => string)(...args)
}

/** True when the message is a rule the domain encoded (known key, valid params). */
const isEncoded = (message: string): boolean => {
  const bar = message.indexOf('|')
  const key = bar === -1 ? message : message.slice(0, bar)
  return isKey(key) && (bar === -1 || issueRule(message).rule === key)
}

/**
 * Renders an issue message for callers that only want text: an encoded rule in `lang`, any other
 * text (a Zod built-in message, text the caller wrote itself) unchanged.
 */
export function issueText(message: string, lang: Language = 'en'): string {
  if (!isEncoded(message)) return message
  const { rule: key, params } = issueRule(message)
  return formatRule(key, params, lang)
}
