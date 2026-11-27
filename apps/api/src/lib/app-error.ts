import { issueRule, issueText, type RuleParams } from '@investhesis/domain'

/** `message` is the English text of `rule`; clients translate from `rule` and `params` (i18n ADR-002). */
export type FieldError = { path: string; message: string; rule: string; params?: RuleParams }

/**
 * Builds a FieldError from an issue message: a rule the domain encoded keeps its id and params, any other
 * text (a Zod built-in message) is the `invalid` rule and keeps its own text.
 */
export function fieldError(path: string, issueMessage: string): FieldError {
  const { rule, params } = issueRule(issueMessage)
  return { path, message: issueText(issueMessage, 'en'), rule, ...(params !== undefined && { params }) }
}

export class AppError extends Error {
  readonly status: number
  readonly code: string
  readonly detail: string | undefined
  readonly errors: FieldError[] | undefined
  readonly headers: Record<string, string> | undefined
  /** Extra problem members, e.g. `existingStockId` on stock_exists. */
  readonly extensions: Record<string, unknown> | undefined

  constructor(opts: {
    status: number
    code: string
    detail?: string
    errors?: FieldError[]
    headers?: Record<string, string>
    extensions?: Record<string, unknown>
    cause?: unknown
  }) {
    super(opts.detail ?? opts.code, { cause: opts.cause })
    this.name = 'AppError'
    this.status = opts.status
    this.code = opts.code
    this.detail = opts.detail
    this.errors = opts.errors
    this.headers = opts.headers
    this.extensions = opts.extensions
  }
}
