import multipart from '@fastify/multipart'
import fp from 'fastify-plugin'

export const MAX_FILE_BYTES = 1024 * 1024

/** Uploads are read into memory (never to disk) and capped at one 1 MB file with a few small text fields. */
export const multipartPlugin = fp(
  async (app) => {
    await app.register(multipart, {
      limits: { fileSize: MAX_FILE_BYTES, files: 1, fields: 10, fieldSize: 2048, parts: 12, headerPairs: 50 },
    })
  },
  { name: 'multipart' },
)
