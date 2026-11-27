import { LENS_VALUES, TEMPLATE_COLUMNS } from '@investhesis/domain'
import ExcelJS from 'exceljs'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildTestApp, type TestApp } from '../../../test/db.ts'
import { filePart, multipart } from '../../../test/multipart.ts'

let t: TestApp
let app: FastifyInstance

beforeAll(async () => {
  t = await buildTestApp()
  app = t.app
})
afterAll(() => t.cleanup())

const load = async (url: string) => {
  const res = await app.inject({ method: 'GET', url })
  expect(res.statusCode).toBe(200)
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(res.rawPayload as unknown as ExcelJS.Buffer)
  return { wb, res }
}
const cells = (ws: ExcelJS.Worksheet | undefined) =>
  (ws?.getSheetValues() ?? []).map((r) => (Array.isArray(r) ? r.slice(1) : r))
const instructionRow = (ws: ExcelJS.Worksheet | undefined, header: string) => {
  let found: string[] | undefined
  ws?.eachRow((row) => {
    if (row.getCell(1).value === header) found = [1, 2, 3, 4].map((i) => String(row.getCell(i).value ?? ''))
  })
  return found
}

describe('GET /imports/template.xlsx instructions', () => {
  it('TC-U-1020 the default template has an English Instructions sheet with a bold frozen header', async () => {
    const { wb } = await load('/imports/template.xlsx')
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Stocks', 'Instructions'])
    const ws = wb.getWorksheet('Instructions')
    expect(ws?.getRow(1).font?.bold).toBe(true)
    expect(ws?.views[0]).toMatchObject({ state: 'frozen', ySplit: 1 })
    expect(ws?.getColumn(4).alignment?.wrapText).toBe(true)
    expect([1, 2, 3, 4].map((i) => ws?.getRow(1).getCell(i).value)).toEqual([
      'Column',
      'Required',
      'What it takes',
      'Allowed values',
    ])
    expect(instructionRow(ws, 'gics_sector')?.[3]).toBe(LENS_VALUES.gicsSector.join('; '))
    // one row per column, every enumerated value present, free text says so
    for (const c of TEMPLATE_COLUMNS) expect(instructionRow(ws, c.header)).toBeDefined()
    const all = (ws?.getSheetValues() ?? []).flat().join('\n')
    for (const values of Object.values(LENS_VALUES)) for (const v of values) expect(all).toContain(v)
    expect(instructionRow(ws, 'themes')?.[3]).toBe('Free text')
    expect(instructionRow(ws, 'ticker')?.[1]).toBe('Yes')
    expect(instructionRow(ws, 'style')?.[1]).toBe('No')
  })

  it('TC-U-1021 the Thai template labels values next to the canonical ones and leaves the Stocks sheet alone', async () => {
    const th = await load('/imports/template.xlsx?lang=th')
    const en = await load('/imports/template.xlsx')
    expect(th.wb.worksheets.map((w) => w.name)).toEqual(['Stocks', 'คำแนะนำ'])
    expect(instructionRow(th.wb.getWorksheet('คำแนะนำ'), 'gics_sector')?.[3]).toContain('Energy — พลังงาน')
    expect(cells(th.wb.getWorksheet('Stocks'))).toEqual(cells(en.wb.getWorksheet('Stocks')))
    const note = (th.wb.getWorksheet('คำแนะนำ')?.getSheetValues() ?? []).flat().join('\n')
    expect(note).toContain('ภาษาอังกฤษ')
    expect(th.wb.getWorksheet('คำแนะนำ')?.getRow(1).font?.bold).toBe(true)
  })

  it('TC-U-1022 an unknown lang is refused with the oneOf rule', async () => {
    const res = await app.inject({ method: 'GET', url: '/imports/template.xlsx?lang=fr' })
    expect(res.statusCode).toBe(400)
    const body = res.json()
    expect(body.code).toBe('validation_failed')
    expect(body.errors).toEqual([expect.objectContaining({ path: 'lang', rule: 'oneOf' })])
  })

  it('TC-U-1023 the CSV template ignores lang', async () => {
    const a = await app.inject({ method: 'GET', url: '/imports/template.csv?lang=th' })
    const b = await app.inject({ method: 'GET', url: '/imports/template.csv' })
    expect(a.statusCode).toBe(200)
    expect(a.rawPayload.equals(b.rawPayload)).toBe(true)
  })

  it('TC-U-1024 a Thai template previews with no row errors; only the first sheet is read', async () => {
    const { res } = await load('/imports/template.xlsx?lang=th')
    const preview = await app.inject({
      method: 'POST',
      url: '/imports/preview',
      ...multipart([filePart(res.rawPayload, 'investhesis-stocks-template.xlsx')]),
    })
    expect(preview.statusCode).toBe(200)
    expect(preview.json()).toMatchObject({ counts: { new: 2, duplicate: 0, error: 0 }, headerWarnings: [] })
  })
})
