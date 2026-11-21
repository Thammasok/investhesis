import type { FieldError } from './app-error.ts'

export type Problem = {
  type: string
  title: string
  status: number
  code: string
  detail?: string
  errors?: FieldError[]
}

const TITLES: Record<number, string> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  409: 'Conflict',
  413: 'Payload Too Large',
  415: 'Unsupported Media Type',
  429: 'Too Many Requests',
  500: 'Internal Server Error',
}

export const PROBLEM_CONTENT_TYPE = 'application/problem+json'

export function problem(opts: {
  status: number
  code: string
  detail?: string
  errors?: FieldError[]
}): Problem {
  return {
    type: `urn:investhesis:problem:${opts.code}`,
    title: TITLES[opts.status] ?? (opts.status >= 500 ? 'Server Error' : 'Client Error'),
    status: opts.status,
    code: opts.code,
    ...(opts.detail !== undefined && { detail: opts.detail }),
    ...(opts.errors !== undefined && { errors: opts.errors }),
  }
}
