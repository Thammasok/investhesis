import type { FastifyPluginAsync } from 'fastify'
import type { ZodTypeProvider } from '@fastify/type-provider-zod'
import { z } from 'zod'
import { requireIdentity } from '../../plugins/authenticate.ts'

const Me = z.object({
  id: z.uuid(),
  email: z.string().nullable(),
  displayName: z.string().nullable(),
})

export const meRoutes: FastifyPluginAsync = async (app) => {
  app.withTypeProvider<ZodTypeProvider>().get(
    '/me',
    { schema: { tags: ['me'], response: { 200: Me } } },
    async (req) => {
      const { userId, email, displayName } = requireIdentity(req)
      return { id: userId, email: email ?? null, displayName: displayName ?? null }
    },
  )
}
