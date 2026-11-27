import { hasZodFastifySchemaValidationErrors } from '@fastify/type-provider-zod'
import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify'
import fp from 'fastify-plugin'
import { AppError, fieldError, type FieldError } from '../lib/app-error.ts'
import { PROBLEM_CONTENT_TYPE, problem, type Problem } from '../lib/problem.ts'

const CLIENT_CODES: Record<number, string> = {
  400: 'bad_request',
  404: 'not_found',
  413: 'payload_too_large',
  415: 'unsupported_media_type',
  429: 'rate_limited',
}

function send(reply: FastifyReply, body: Problem) {
  return reply
    .code(body.status)
    .header('content-type', PROBLEM_CONTENT_TYPE)
    .send(JSON.stringify({ ...body, requestId: reply.request.id }))
}

function fieldErrors(error: { validation: readonly unknown[] }): FieldError[] {
  return error.validation.map((v) => {
    const item = v as { instancePath?: string; message?: string; params?: { issue?: { path?: PropertyKey[]; message?: string } } }
    const path = item.params?.issue?.path?.map(String).join('.') ?? (item.instancePath ?? '').replace(/^\//, '').replaceAll('/', '.')
    return fieldError(path, item.params?.issue?.message ?? item.message ?? 'invalid')
  })
}

export const errorHandlerPlugin = fp(
  async (app) => {
    app.setErrorHandler((error: FastifyError | AppError, req: FastifyRequest, reply) => {
      if (error instanceof AppError) {
        if (error.status >= 500) req.log.error({ err: error.cause ?? error }, 'request failed')
        if (error.headers) reply.headers(error.headers)
        return send(reply, problem(error))
      }
      if (hasZodFastifySchemaValidationErrors(error)) {
        return send(
          reply,
          problem({
            status: 400,
            code: 'validation_failed',
            errors: fieldErrors(error as { validation: readonly unknown[] }),
          }),
        )
      }
      const status = (error as FastifyError).statusCode
      if (status !== undefined && status >= 400 && status < 500) {
        return send(
          reply,
          problem({ status, code: CLIENT_CODES[status] ?? 'bad_request', detail: error.message }),
        )
      }
      req.log.error({ err: error }, 'request failed')
      return send(reply, problem({ status: 500, code: 'internal' }))
    })

    app.setNotFoundHandler((req, reply) =>
      send(reply, problem({ status: 404, code: 'not_found', detail: `${req.method} ${req.url}` })),
    )
  },
  { name: 'error-handler' },
)
