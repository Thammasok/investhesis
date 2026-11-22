import type { FastifyPluginAsync } from 'fastify'
import type { ZodTypeProvider } from '@fastify/type-provider-zod'
import { z } from 'zod'
import { StockInput, StockPatch } from '@investhesis/domain'
import type { Db } from '../../db/client.ts'
import { AppError } from '../../lib/app-error.ts'
import { requireIdentity } from '../../plugins/authenticate.ts'
import * as service from './stocks.service.ts'

/** Postgres text cannot hold NUL; refuse it at the boundary so it is a 400, not a 500. */
function rejectNul(value: Record<string, unknown>, ctx: z.RefinementCtx) {
  for (const [key, v] of Object.entries(value)) {
    const items = Array.isArray(v) ? v : [v]
    if (items.some((x) => typeof x === 'string' && x.includes('\u0000'))) {
      ctx.addIssue({ code: 'custom', path: [key], message: 'must not contain a NUL character' })
    }
  }
}

/** A StockInput plus `listIds`; StockInput's own strictness rejects every other unknown key. */
const CreateBody = z
  .looseObject({ listIds: z.array(z.uuid()).max(100).default([]) })
  .transform((body, ctx) => {
    const { listIds, ...rest } = body
    const parsed = StockInput.safeParse(rest)
    if (!parsed.success) {
      for (const issue of parsed.error.issues) ctx.issues.push({ code: 'custom', message: issue.message, path: issue.path, input: body })
      return z.NEVER
    }
    rejectNul(parsed.data, ctx)
    return { input: parsed.data, listIds }
  })

const PatchBody = StockPatch.superRefine(rejectNul)

const Lens = z.string().nullable()
const StockOut = z.object({
  id: z.uuid(),
  market: z.enum(['US', 'TH']),
  ticker: z.string(),
  exchange: z.string(),
  currency: z.enum(['USD', 'THB']),
  name: z.string(),
  indexMembership: z.array(z.string()),
  gicsSector: Lens,
  setIndustryGroup: Lens,
  valueChain: Lens,
  valueChainPosition: Lens,
  size: Lens,
  style: Lens,
  economicCycle: Lens,
  lynchType: Lens,
  lifeCycle: Lens,
  customers: z.array(z.string()),
  revenueTypes: z.array(z.string()),
  moat: Lens,
  themes: z.array(z.string()),
  volatility: Lens,
  lensSources: z.record(z.string(), z.enum(['manual', 'default'])),
  listIds: z.array(z.uuid()),
  createdAt: z.string(),
  updatedAt: z.string(),
})

const ProblemOut = z.object({
  type: z.string(),
  title: z.string(),
  status: z.number().int(),
  code: z.string(),
  detail: z.string().optional(),
  errors: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
  requestId: z.string().optional(),
})
const StockExistsOut = ProblemOut.extend({ existingStockId: z.uuid().optional() })
const StockId = z.object({ id: z.uuid() })

export const stocksRoutes: FastifyPluginAsync<{ db: Db | undefined }> = async (app, { db }) => {
  const r = app.withTypeProvider<ZodTypeProvider>()
  const need = (): Db => {
    if (!db) throw new AppError({ status: 503, code: 'db_unavailable' })
    return db
  }

  r.get(
    '/stocks',
    {
      schema: {
        tags: ['stocks'],
        querystring: z.object({ listId: z.uuid().optional() }),
        response: { 200: z.object({ items: z.array(StockOut) }), 400: ProblemOut, 401: ProblemOut, 404: ProblemOut },
      },
    },
    async (req) => ({ items: await service.listStocks(need(), requireIdentity(req).userId, req.query.listId) }),
  )

  r.post(
    '/stocks',
    {
      schema: {
        tags: ['stocks'],
        body: CreateBody,
        response: { 201: StockOut, 400: ProblemOut, 401: ProblemOut, 404: ProblemOut, 409: StockExistsOut },
      },
    },
    async (req, reply) => {
      const { input, listIds } = req.body
      const created = await service.createStock(need(), requireIdentity(req).userId, input, listIds)
      return reply.code(201).header('location', `/stocks/${created.id}`).send(created)
    },
  )

  r.get(
    '/stocks/:id',
    { schema: { tags: ['stocks'], params: StockId, response: { 200: StockOut, 400: ProblemOut, 401: ProblemOut, 404: ProblemOut } } },
    async (req) => service.getStock(need(), requireIdentity(req).userId, req.params.id),
  )

  r.patch(
    '/stocks/:id',
    {
      schema: {
        tags: ['stocks'],
        params: StockId,
        body: PatchBody,
        response: { 200: StockOut, 400: ProblemOut, 401: ProblemOut, 404: ProblemOut },
      },
    },
    async (req) => service.updateStock(need(), requireIdentity(req).userId, req.params.id, req.body),
  )

  r.delete(
    '/stocks/:id',
    { schema: { tags: ['stocks'], params: StockId, response: { 204: z.null(), 400: ProblemOut, 401: ProblemOut, 404: ProblemOut } } },
    async (req, reply) => {
      await service.deleteStock(need(), requireIdentity(req).userId, req.params.id)
      return reply.code(204).send(null)
    },
  )
}
