import { serializerCompiler, validatorCompiler } from '@fastify/type-provider-zod'
import Fastify, { type FastifyInstance } from 'fastify'
import type { DestinationStream } from 'pino'
import { MARKETS } from '@investhesis/domain'
import type { Config } from './config/env.ts'
import type { Db } from './db/client.ts'
import { loggerOptions } from './lib/logger.ts'
import { meRoutes } from './modules/me/me.routes.ts'
import { authenticatePlugin, identityResolverFor, type IdentityResolver } from './plugins/authenticate.ts'
import { errorHandlerPlugin } from './plugins/error-handler.ts'
import { healthPlugin, type DbHealth } from './plugins/health.ts'
import { openapiPlugin } from './plugins/openapi.ts'
import { genReqId, requestIdPlugin } from './plugins/request-id.ts'
import { securityPlugin } from './plugins/security.ts'

declare module 'fastify' {
  interface FastifyInstance {
    shuttingDown: boolean
  }
}

// Proves ADR-005 (the API loads the domain package from source); routes use it from T-004.
void MARKETS

export type AppDeps = {
  config: Config
  db?: DbHealth & { close?(): Promise<void>; db?: Db }
  /** Defaults to the resolver for config.authMode; tests pass their own. */
  resolveIdentity?: IdentityResolver
  logStream?: DestinationStream
}

export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const { config } = deps
  const app = Fastify({
    logger: { ...loggerOptions(config), ...(deps.logStream && { stream: deps.logStream }) },
    genReqId,
    requestIdHeader: false,
    trustProxy: config.trustProxy,
    forceCloseConnections: 'idle',
  })

  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)

  app.decorate('shuttingDown', false)
  if (deps.db?.close) {
    const { db } = deps
    app.addHook('onClose', async () => db.close?.())
  }

  await app.register(requestIdPlugin)
  await app.register(securityPlugin, { config })
  await app.register(errorHandlerPlugin)
  await app.register(openapiPlugin)
  await app.register(healthPlugin, { db: deps.db })
  await app.register(authenticatePlugin, { resolve: deps.resolveIdentity ?? identityResolverFor(config) })
  await app.register(meRoutes)

  return app
}
