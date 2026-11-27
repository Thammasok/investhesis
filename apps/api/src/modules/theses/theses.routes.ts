import type { FastifyPluginAsync } from 'fastify'
import type { ZodTypeProvider } from '@fastify/type-provider-zod'
import { z } from 'zod'
import { FieldErrorOut } from '../../lib/field-error-schema.ts'
import { THESIS_TYPES } from '@investhesis/domain'
import type { Db } from '../../db/client.ts'
import { AppError } from '../../lib/app-error.ts'
import { requireIdentity } from '../../plugins/authenticate.ts'
import * as service from './theses.service.ts'

const ThesisOut = z.object({
  id: z.uuid(),
  stockId: z.uuid(),
  type: z.enum(THESIS_TYPES),
  date: z.string(),
  note: z.string(),
  targetPrice: z.string().nullable(),
  invalidation: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

const ProblemOut = z.object({
  type: z.string(),
  title: z.string(),
  status: z.number().int(),
  code: z.string(),
  detail: z.string().optional(),
  errors: z.array(FieldErrorOut).optional(),
  requestId: z.string().optional(),
})

const StockParams = z.object({ stockId: z.uuid() })
const EntryParams = z.object({ stockId: z.uuid(), thesisId: z.uuid() })
const tags = ['theses']

// Bodies are checked in the service: the date bound depends on the clock, which a static schema cannot see.
const AnyBody = z.unknown()

export const thesesRoutes: FastifyPluginAsync<{ db: Db | undefined; now: () => Date }> = async (app, { db, now }) => {
  const r = app.withTypeProvider<ZodTypeProvider>()
  const need = (): Db => {
    if (!db) throw new AppError({ status: 503, code: 'db_unavailable' })
    return db
  }

  r.get(
    '/stocks/:stockId/theses',
    { schema: { tags, params: StockParams, response: { 200: z.object({ items: z.array(ThesisOut) }), 400: ProblemOut, 401: ProblemOut, 404: ProblemOut } } },
    async (req) => ({ items: await service.list(need(), requireIdentity(req).userId, req.params.stockId) }),
  )

  r.post(
    '/stocks/:stockId/theses',
    { schema: { tags, params: StockParams, body: AnyBody, response: { 201: ThesisOut, 400: ProblemOut, 401: ProblemOut, 404: ProblemOut } } },
    async (req, reply) => {
      const created = await service.create(need(), now, requireIdentity(req).userId, req.params.stockId, req.body)
      return reply.code(201).send(created)
    },
  )

  r.post(
    '/stocks/:stockId/theses/restore',
    {
      schema: {
        tags,
        params: StockParams,
        body: AnyBody,
        response: { 201: ThesisOut, 400: ProblemOut, 401: ProblemOut, 404: ProblemOut, 409: ProblemOut },
      },
    },
    async (req, reply) => {
      const restored = await service.restore(need(), now, requireIdentity(req).userId, req.params.stockId, req.body)
      return reply.code(201).send(restored)
    },
  )

  r.patch(
    '/stocks/:stockId/theses/:thesisId',
    { schema: { tags, params: EntryParams, body: AnyBody, response: { 200: ThesisOut, 400: ProblemOut, 401: ProblemOut, 404: ProblemOut } } },
    async (req) => service.update(need(), now, requireIdentity(req).userId, req.params.stockId, req.params.thesisId, req.body),
  )

  r.delete(
    '/stocks/:stockId/theses/:thesisId',
    { schema: { tags, params: EntryParams, response: { 200: ThesisOut, 400: ProblemOut, 401: ProblemOut, 404: ProblemOut } } },
    async (req) => service.remove(need(), requireIdentity(req).userId, req.params.stockId, req.params.thesisId),
  )
}
