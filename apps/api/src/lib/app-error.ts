export type FieldError = { path: string; message: string }

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
