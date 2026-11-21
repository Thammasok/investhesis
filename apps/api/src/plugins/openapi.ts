import { jsonSchemaTransform } from '@fastify/type-provider-zod'
import swagger from '@fastify/swagger'
import fp from 'fastify-plugin'

export const openapiPlugin = fp(
  async (app) => {
    await app.register(swagger, {
      openapi: {
        openapi: '3.1.0',
        info: { title: 'Investhesis API', version: '0.0.0' },
        components: { securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } } },
      },
      transform: jsonSchemaTransform,
    })
    app.get('/openapi.json', { schema: { hide: true } }, async () => app.swagger())
  },
  { name: 'openapi' },
)
