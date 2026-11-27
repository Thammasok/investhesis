import type { FastifyPluginAsync } from 'fastify'
import type { ZodTypeProvider } from '@fastify/type-provider-zod'
import { z } from 'zod'
import { FieldErrorOut } from '../../lib/field-error-schema.ts'
import { SettingsPatch } from '@investhesis/domain'
import type { Db } from '../../db/client.ts'
import { AppError } from '../../lib/app-error.ts'
import { requireIdentity } from '../../plugins/authenticate.ts'
import * as service from './settings.service.ts'

const SettingsOut = z.object({
  concentrationThreshold: z.number().int(),
  usdThbRate: z.string().nullable(),
  usdThbRateUpdatedAt: z.string().nullable(),
  language: z.enum(['en', 'th']).nullable(),
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

export const settingsRoutes: FastifyPluginAsync<{ db: Db | undefined }> = async (app, { db }) => {
  const r = app.withTypeProvider<ZodTypeProvider>()
  const need = (): Db => {
    if (!db) throw new AppError({ status: 503, code: 'db_unavailable' })
    return db
  }

  r.get(
    '/settings',
    { schema: { tags: ['settings'], response: { 200: SettingsOut, 401: ProblemOut } } },
    async (req) => service.getSettings(need(), requireIdentity(req).userId),
  )

  r.patch(
    '/settings',
    { schema: { tags: ['settings'], body: SettingsPatch, response: { 200: SettingsOut, 400: ProblemOut, 401: ProblemOut } } },
    async (req) => service.updateSettings(need(), requireIdentity(req).userId, req.body),
  )
}
