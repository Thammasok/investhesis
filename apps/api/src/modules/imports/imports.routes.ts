import type { MultipartFile } from '@fastify/multipart'
import type { FastifyPluginAsync, FastifyRequest } from 'fastify'
import type { ZodTypeProvider } from '@fastify/type-provider-zod'
import { z } from 'zod'
import type { Db } from '../../db/client.ts'
import { AppError } from '../../lib/app-error.ts'
import { requireIdentity } from '../../plugins/authenticate.ts'
import * as service from './imports.service.ts'
import { templateCsv, templateXlsx } from './imports.template.ts'

const ProblemOut = z.object({
  type: z.string(),
  title: z.string(),
  status: z.number().int(),
  code: z.string(),
  detail: z.string().optional(),
  errors: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
  requestId: z.string().optional(),
})

const RowError = z.object({ path: z.string(), message: z.string() })
const PreviewOut = z.object({
  fileName: z.string(),
  format: z.enum(['csv', 'xlsx']),
  counts: z.object({ new: z.number().int(), duplicate: z.number().int(), error: z.number().int() }),
  headerWarnings: z.array(z.string()),
  rows: z.array(
    z.object({
      rowNumber: z.number().int(),
      ticker: z.string(),
      market: z.string(),
      name: z.string(),
      status: z.enum(['new', 'duplicate', 'error']),
      existingStockId: z.uuid().optional(),
      errors: z.array(RowError),
    }),
  ),
})

const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
const attachment = (name: string) => `attachment; filename="investhesis-stocks-template.${name}"`

/** The one `file` part as bytes, or the problem that explains why not. */
async function readUpload(req: FastifyRequest): Promise<{ fileName: string; bytes: Buffer }> {
  if (!req.isMultipart()) throw new AppError({ status: 400, code: 'file_missing', detail: 'Send the file as a multipart "file" part' })
  let part: MultipartFile | undefined
  try {
    part = await req.file()
    if (!part || part.fieldname !== 'file') throw new AppError({ status: 400, code: 'file_missing', detail: 'Send the file as a multipart "file" part' })
    const bytes = await part.toBuffer()
    for (const field of Object.values(part.fields).flat()) {
      if (field && 'valueTruncated' in field && field.valueTruncated) {
        throw new AppError({ status: 413, code: 'payload_too_large', detail: 'A form field is too large' })
      }
    }
    return { fileName: part.filename, bytes }
  } catch (e) {
    if (e instanceof AppError) throw e
    const code = (e as { code?: string }).code
    if (code === 'FST_REQ_FILE_TOO_LARGE') throw new AppError({ status: 413, code: 'file_too_large', detail: 'The file is larger than 1 MB' })
    if (code?.startsWith('FST_')) throw new AppError({ status: (e as { statusCode?: number }).statusCode === 413 ? 413 : 400, code: 'bad_request', detail: (e as Error).message })
    throw e
  }
}

export const importsRoutes: FastifyPluginAsync<{ db: Db | undefined }> = async (app, { db }) => {
  const r = app.withTypeProvider<ZodTypeProvider>()
  const need = (): Db => {
    if (!db) throw new AppError({ status: 503, code: 'db_unavailable' })
    return db
  }

  r.get(
    '/imports/template.csv',
    { schema: { tags: ['imports'], produces: ['text/csv'] } },
    async (req, reply) => {
      requireIdentity(req)
      return reply.header('content-type', 'text/csv; charset=utf-8').header('content-disposition', attachment('csv')).send(templateCsv())
    },
  )

  r.get(
    '/imports/template.xlsx',
    { schema: { tags: ['imports'], produces: [XLSX_TYPE] } },
    async (req, reply) => {
      requireIdentity(req)
      return reply.header('content-type', XLSX_TYPE).header('content-disposition', attachment('xlsx')).send(await templateXlsx())
    },
  )

  r.post(
    '/imports/preview',
    {
      schema: {
        tags: ['imports'],
        consumes: ['multipart/form-data'],
        response: { 200: PreviewOut, 400: ProblemOut, 401: ProblemOut, 413: ProblemOut, 415: ProblemOut, 422: ProblemOut },
      },
    },
    async (req) => {
      const { userId } = requireIdentity(req)
      const { fileName, bytes } = await readUpload(req)
      return service.previewImport(need(), userId, fileName, bytes)
    },
  )
}
