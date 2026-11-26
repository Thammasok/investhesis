import type { FastifyPluginAsync } from 'fastify'
import type { ZodTypeProvider } from '@fastify/type-provider-zod'
import { z } from 'zod'
import { ChainRename } from '@investhesis/domain'
import type { Db } from '../../db/client.ts'
import { AppError } from '../../lib/app-error.ts'
import { requireIdentity } from '../../plugins/authenticate.ts'
import * as service from './chains.service.ts'

// Postgres text cannot hold NUL; refuse it here so it is a 400, not a 500.
const Body = ChainRename.superRefine((v, ctx) => {
  for (const key of ['from', 'to'] as const) {
    if (typeof v[key] === 'string' && v[key].includes('\u0000')) {
      ctx.addIssue({ code: 'custom', path: [key], message: 'must not contain a NUL character' })
    }
  }
})

const RenameOut = z.object({ name: z.string(), changed: z.number().int(), merged: z.boolean() })
const ProblemOut = z.object({
  type: z.string(),
  title: z.string(),
  status: z.number().int(),
  code: z.string(),
  detail: z.string().optional(),
  errors: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
  existingName: z.string().optional(),
  existingCount: z.number().int().optional(),
  requestId: z.string().optional(),
})

export const chainsRoutes: FastifyPluginAsync<{ db: Db | undefined; repo?: Partial<service.ChainsRepo> | undefined }> = async (app, { db, repo }) => {
  const r = app.withTypeProvider<ZodTypeProvider>()

  r.post(
    '/chains/rename',
    {
      schema: {
        tags: ['chains'],
        body: Body,
        response: { 200: RenameOut, 400: ProblemOut, 401: ProblemOut, 404: ProblemOut, 409: ProblemOut },
      },
    },
    async (req) => {
      const { userId } = requireIdentity(req)
      if (!db) throw new AppError({ status: 503, code: 'db_unavailable' })
      return service.renameChain(db, userId, req.body, { ...service.chainsRepo, ...repo })
    },
  )
}
