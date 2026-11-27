import type { MultipartFile } from '@fastify/multipart'
import type { FastifyPluginAsync, FastifyRequest } from 'fastify'
import type { ZodTypeProvider } from '@fastify/type-provider-zod'
import { z } from 'zod'
import { FieldErrorOut } from '../../lib/field-error-schema.ts'
import { LANGUAGES, ListName, rule } from '@investhesis/domain'
import type { Db } from '../../db/client.ts'
import { AppError, fieldError } from '../../lib/app-error.ts'
import { requireIdentity } from '../../plugins/authenticate.ts'
import * as service from './imports.service.ts'
import { templateCsv, templateXlsx } from './imports.template.ts'

const ProblemOut = z.object({
  type: z.string(),
  title: z.string(),
  status: z.number().int(),
  code: z.string(),
  detail: z.string().optional(),
  errors: z.array(FieldErrorOut).optional(),
  requestId: z.string().optional(),
})

const RowError = FieldErrorOut
const PreviewOut = z.object({
  fileName: z.string(),
  format: z.enum(['csv', 'xlsx']),
  counts: z.object({ new: z.number().int(), duplicate: z.number().int(), error: z.number().int() }),
  headerWarnings: z.array(z.string()),
  ignoredColumns: z.array(z.string()),
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

const TemplateQuery = z.object({
  lang: z.enum(LANGUAGES, { error: () => rule('oneOf', { values: LANGUAGES }) }).default('en'),
})

const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
const attachment = (name: string) => `attachment; filename="investhesis-stocks-template.${name}"`

const fieldValue = (f: unknown): unknown => (f && typeof f === 'object' && 'value' in f ? (f as { value: unknown }).value : undefined)

// Postgres text cannot hold NUL; refuse it here so it is a 400, not a 500.
const NewListName = ListName.refine((s) => !s.includes('\u0000'), { error: 'must not contain a NUL character' })
const ConfirmOptions = z
  .object({ duplicateMode: z.enum(['skip', 'update']), targetListId: z.uuid().optional(), newListName: NewListName.optional() })
  .superRefine((v, ctx) => {
    if ((v.targetListId === undefined) === (v.newListName === undefined)) {
      ctx.addIssue({ code: 'custom', path: ['targetListId'], message: 'send exactly one of targetListId or newListName' })
    }
  })

const ConfirmOut = z.object({
  targetList: z.object({ id: z.uuid(), name: z.string() }),
  created: z.number().int(),
  updated: z.number().int(),
  skipped: z.number().int(),
  failed: z.number().int(),
  addedToList: z.number().int(),
  errorRows: z.array(z.object({ rowNumber: z.number().int(), cells: z.record(z.string(), z.string()), errors: z.array(RowError) })),
})

/** The one `file` part as bytes, or the problem that explains why not. */
async function readUpload(req: FastifyRequest): Promise<{ fileName: string; bytes: Buffer; fields: Record<string, unknown> }> {
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
    const fields: Record<string, unknown> = {}
    for (const [name, field] of Object.entries(part.fields)) {
      if (name === 'file' || !field) continue
      fields[name] = Array.isArray(field) ? field.map(fieldValue) : fieldValue(field)
    }
    return { fileName: part.filename, bytes, fields }
  } catch (e) {
    if (e instanceof AppError) throw e
    const code = (e as { code?: string }).code
    if (code === 'FST_REQ_FILE_TOO_LARGE') throw new AppError({ status: 413, code: 'file_too_large', detail: 'The file is larger than 1 MB' })
    if (code?.startsWith('FST_')) throw new AppError({ status: (e as { statusCode?: number }).statusCode === 413 ? 413 : 400, code: 'bad_request', detail: (e as Error).message })
    throw e
  }
}

export const importsRoutes: FastifyPluginAsync<{ db: Db | undefined; repo?: Partial<service.ImportRepo> | undefined }> = async (app, { db, repo }) => {
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
    { schema: { tags: ['imports'], produces: [XLSX_TYPE], querystring: TemplateQuery } },
    async (req, reply) => {
      requireIdentity(req)
      return reply
        .header('content-type', XLSX_TYPE)
        .header('content-disposition', attachment('xlsx'))
        .send(await templateXlsx(req.query.lang))
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

  r.post(
    '/imports',
    {
      schema: {
        tags: ['imports'],
        consumes: ['multipart/form-data'],
        response: { 200: ConfirmOut, 400: ProblemOut, 401: ProblemOut, 404: ProblemOut, 409: ProblemOut, 413: ProblemOut, 415: ProblemOut, 422: ProblemOut },
      },
    },
    async (req) => {
      const { userId } = requireIdentity(req)
      const { fileName, bytes, fields } = await readUpload(req)
      const parsed = ConfirmOptions.safeParse(fields)
      if (!parsed.success) {
        throw new AppError({
          status: 400,
          code: 'validation_failed',
          errors: parsed.error.issues.map((i) => fieldError(i.path.join('.'), i.message)),
        })
      }
      const { duplicateMode, targetListId, newListName } = parsed.data
      const options: service.ImportOptions = targetListId ? { duplicateMode, listId: targetListId } : { duplicateMode, newListName: newListName ?? '' }
      return service.confirmImport(need(), userId, fileName, bytes, options, { ...service.importRepo, ...repo })
    },
  )
}
