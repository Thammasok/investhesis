import type { FastifyPluginAsync } from 'fastify'
import type { ZodTypeProvider } from '@fastify/type-provider-zod'
import { z } from 'zod'
import { LANGUAGES } from '@investhesis/domain'
import type { Db } from '../../db/client.ts'
import { requireIdentity } from '../../plugins/authenticate.ts'
import * as repo from './me.repository.ts'

const Me = z.object({
  id: z.uuid(),
  email: z.string().nullable(),
  displayName: z.string().nullable(),
  language: z.enum(LANGUAGES).nullable(),
})

export const meRoutes: FastifyPluginAsync<{ db: Db | undefined }> = async (app, { db }) => {
  app.withTypeProvider<ZodTypeProvider>().get(
    '/me',
    { schema: { tags: ['me'], response: { 200: Me } } },
    async (req) => {
      const { userId, email, displayName } = requireIdentity(req)
      // The language is cosmetic: a failed read must not fail /me (design.md, GET /me).
      let language: repo.Language | null = null
      if (db) {
        try {
          language = await repo.findLanguage(db, userId)
        } catch (err) {
          req.log.warn({ errorName: err instanceof Error ? err.name : 'Error' }, 'could not read the saved language')
        }
      }
      return { id: userId, email: email ?? null, displayName: displayName ?? null, language }
    },
  )
}
