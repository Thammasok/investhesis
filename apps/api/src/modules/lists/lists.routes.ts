import type { FastifyPluginAsync } from 'fastify'
import type { ZodTypeProvider } from '@fastify/type-provider-zod'
import { z } from 'zod'
import { FieldErrorOut } from '../../lib/field-error-schema.ts'
import { ListName } from '@investhesis/domain'
import type { Db } from '../../db/client.ts'
import { AppError } from '../../lib/app-error.ts'
import { requireIdentity } from '../../plugins/authenticate.ts'
import * as service from './lists.service.ts'

// Postgres text cannot hold NUL; refuse it here so it is a 400, not a 500.
const Name = ListName.refine((s) => !s.includes('\u0000'), { error: 'must not contain a NUL character' })
const NameBody = z.object({ name: Name })

const ListOut = z.object({
  id: z.uuid(),
  name: z.string(),
  stockCount: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
})
const ListId = z.object({ id: z.uuid() })

const ProblemOut = z.object({
  type: z.string(),
  title: z.string(),
  status: z.number().int(),
  code: z.string(),
  detail: z.string().optional(),
  errors: z.array(FieldErrorOut).optional(),
  requestId: z.string().optional(),
})
const errors = {
  400: ProblemOut,
  401: ProblemOut,
  404: ProblemOut,
  409: ProblemOut,
}

export const listsRoutes: FastifyPluginAsync<{ db: Db | undefined }> = async (app, { db }) => {
  const r = app.withTypeProvider<ZodTypeProvider>()
  const need = (): Db => {
    if (!db) throw new AppError({ status: 503, code: 'db_unavailable' })
    return db
  }

  r.get(
    '/lists',
    { schema: { tags: ['lists'], response: { 200: z.object({ items: z.array(ListOut) }), 401: errors[401] } } },
    async (req) => ({ items: await service.listLists(need(), requireIdentity(req).userId) }),
  )

  r.post(
    '/lists',
    { schema: { tags: ['lists'], body: NameBody, response: { 201: ListOut, 400: errors[400], 401: errors[401], 409: errors[409] } } },
    async (req, reply) => {
      const created = await service.createList(need(), requireIdentity(req).userId, req.body.name)
      return reply.code(201).header('location', `/lists/${created.id}`).send(created)
    },
  )

  r.get(
    '/lists/:id',
    { schema: { tags: ['lists'], params: ListId, response: { 200: ListOut, 400: errors[400], 401: errors[401], 404: errors[404] } } },
    async (req) => service.getList(need(), requireIdentity(req).userId, req.params.id),
  )

  r.patch(
    '/lists/:id',
    {
      schema: {
        tags: ['lists'],
        params: ListId,
        body: NameBody,
        response: { 200: ListOut, 400: errors[400], 401: errors[401], 404: errors[404], 409: errors[409] },
      },
    },
    async (req) => service.renameList(need(), requireIdentity(req).userId, req.params.id, req.body.name),
  )

  r.delete(
    '/lists/:id',
    { schema: { tags: ['lists'], params: ListId, response: { 204: z.null(), 400: errors[400], 401: errors[401], 404: errors[404] } } },
    async (req, reply) => {
      await service.deleteList(need(), requireIdentity(req).userId, req.params.id)
      return reply.code(204).send(null)
    },
  )

  r.post(
    '/lists/:id/stocks',
    {
      schema: {
        tags: ['lists'],
        params: ListId,
        body: z.object({ stockId: z.uuid() }),
        response: {
          201: z.object({ listId: z.uuid(), stockId: z.uuid(), addedAt: z.string() }),
          400: errors[400],
          401: errors[401],
          404: errors[404],
          409: errors[409],
        },
      },
    },
    async (req, reply) => {
      const m = await service.addStock(need(), requireIdentity(req).userId, req.params.id, req.body.stockId)
      return reply.code(201).send(m)
    },
  )

  r.delete(
    '/lists/:id/stocks/:stockId',
    {
      schema: {
        tags: ['lists'],
        params: z.object({ id: z.uuid(), stockId: z.uuid() }),
        response: { 204: z.null(), 400: errors[400], 401: errors[401], 404: errors[404] },
      },
    },
    async (req, reply) => {
      await service.removeStock(need(), requireIdentity(req).userId, req.params.id, req.params.stockId)
      return reply.code(204).send(null)
    },
  )
}
