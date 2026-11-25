import type { FastifyPluginAsync } from 'fastify'
import type { ZodTypeProvider } from '@fastify/type-provider-zod'
import { z } from 'zod'
import { BackupV2 } from '@investhesis/domain'
import type { Db } from '../../db/client.ts'
import { AppError } from '../../lib/app-error.ts'
import { requireIdentity } from '../../plugins/authenticate.ts'
import * as service from './exports.service.ts'

const ProblemOut = z.object({
  type: z.string(),
  title: z.string(),
  status: z.number().int(),
  code: z.string(),
  detail: z.string().optional(),
  requestId: z.string().optional(),
})

const attachment = (name: string) => `attachment; filename="${name}"`

/**
 * The full backup of everything the caller owns, as JSON (the documented `BackupV2`) and as CSV (the
 * export columns, re-importable). Read-only; nothing in a body is logged (NFR-004).
 */
export const exportsRoutes: FastifyPluginAsync<{ db: Db | undefined; now: () => Date }> = async (app, { db, now }) => {
  const r = app.withTypeProvider<ZodTypeProvider>()
  const need = (): Db => {
    if (!db) throw new AppError({ status: 503, code: 'db_unavailable' })
    return db
  }

  r.get(
    '/exports/backup.json',
    { schema: { tags: ['exports'], response: { 200: BackupV2, 401: ProblemOut, 503: ProblemOut } } },
    async (req, reply) => {
      const { userId } = requireIdentity(req)
      const at = now()
      const backup = await service.buildBackup(need(), userId, at)
      return reply.header('content-disposition', attachment(service.backupFileName(at, 'json'))).send(backup)
    },
  )

  r.get(
    '/exports/backup.csv',
    { schema: { tags: ['exports'], produces: ['text/csv'], response: { 200: z.string(), 401: ProblemOut, 503: ProblemOut } } },
    async (req, reply) => {
      const { userId } = requireIdentity(req)
      const at = now()
      const csv = await service.backupCsv(need(), userId)
      return reply
        .header('content-type', 'text/csv; charset=utf-8')
        .header('content-disposition', attachment(service.backupFileName(at, 'csv')))
        .send(csv)
    },
  )
}
