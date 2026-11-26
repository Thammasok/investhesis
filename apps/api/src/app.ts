import { serializerCompiler, validatorCompiler } from '@fastify/type-provider-zod'
import Fastify, { type FastifyInstance } from 'fastify'
import type { DestinationStream } from 'pino'
import type { Config } from './config/env.ts'
import type { Db } from './db/client.ts'
import { loggerOptions } from './lib/logger.ts'
import { chainsRoutes } from './modules/chains/chains.routes.ts'
import type { ChainsRepo } from './modules/chains/chains.service.ts'
import { exportsRoutes } from './modules/exports/exports.routes.ts'
import { importsRoutes } from './modules/imports/imports.routes.ts'
import type { ImportRepo } from './modules/imports/imports.service.ts'
import { listsRoutes } from './modules/lists/lists.routes.ts'
import { settingsRoutes } from './modules/settings/settings.routes.ts'
import { thesesRoutes } from './modules/theses/theses.routes.ts'
import { stocksRoutes } from './modules/stocks/stocks.routes.ts'
import { meRoutes } from './modules/me/me.routes.ts'
import { authenticatePlugin, identityResolverFor, type IdentityResolver } from './plugins/authenticate.ts'
import { errorHandlerPlugin } from './plugins/error-handler.ts'
import { healthPlugin, type DbHealth } from './plugins/health.ts'
import { multipartPlugin } from './plugins/multipart.ts'
import { openapiPlugin } from './plugins/openapi.ts'
import { genReqId, requestIdPlugin } from './plugins/request-id.ts'
import { securityPlugin } from './plugins/security.ts'

declare module 'fastify' {
  interface FastifyInstance {
    shuttingDown: boolean
  }
}

export type AppDeps = {
  config: Config
  /** Test seam: replaces repository calls of the import confirm to inject failures. */
  importRepo?: Partial<ImportRepo>
  /** Test seam: replaces repository calls of the chain rename to inject failures. */
  chainsRepo?: Partial<ChainsRepo>
  db?: DbHealth & { close?(): Promise<void>; db?: Db }
  /** Defaults to the resolver for config.authMode; tests pass their own. */
  resolveIdentity?: IdentityResolver
  logStream?: DestinationStream
  /** Test seam: the clock that dates exports. */
  now?: () => Date
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
  await app.register(multipartPlugin)
  await app.register(meRoutes)
  await app.register(listsRoutes, { db: deps.db?.db })
  await app.register(stocksRoutes, { db: deps.db?.db })
  await app.register(settingsRoutes, { db: deps.db?.db })
  await app.register(importsRoutes, { db: deps.db?.db, repo: deps.importRepo })
  await app.register(thesesRoutes, { db: deps.db?.db, now: deps.now ?? (() => new Date()) })
  await app.register(chainsRoutes, { db: deps.db?.db, repo: deps.chainsRepo })
  await app.register(exportsRoutes, { db: deps.db?.db, now: deps.now ?? (() => new Date()) })

  return app
}
