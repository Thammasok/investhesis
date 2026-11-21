import { jsonSchemaTransform } from '@fastify/type-provider-zod'
import swagger from '@fastify/swagger'
import fp from 'fastify-plugin'
import { PUBLIC_PATHS } from './authenticate.ts'

export const openapiPlugin = fp(
  async (app) => {
    await app.register(swagger, {
      openapi: {
        openapi: '3.1.0',
        info: { title: 'Investhesis API', version: '0.0.0' },
        components: { securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } } },
      },
      transform: (args) => {
        const { schema, url } = args
        const secured = schema && !PUBLIC_PATHS.has(url) ? { ...schema, security: [{ bearerAuth: [] }] } : schema
        return jsonSchemaTransform({ ...args, schema: secured })
      },
    })
    app.get('/openapi.json', { schema: { hide: true } }, async () => app.swagger())
  },
  { name: 'openapi' },
)
