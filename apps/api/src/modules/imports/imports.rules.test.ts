import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildTestApp, type TestApp } from '../../../test/db.ts'
import { csv, usRow } from '../../../test/fixtures/imports/build.ts'
import { filePart, multipart } from '../../../test/multipart.ts'

let t: TestApp
let app: FastifyInstance
beforeAll(async () => {
  t = await buildTestApp()
  app = t.app
})
afterAll(() => t.cleanup())

const preview = (file: Buffer) => app.inject({ method: 'POST', url: '/imports/preview', ...multipart([filePart(file, 'f.csv')]) })

describe('import preview rules', () => {
  it('TC-U-1019 a missing column carries rule columnMissing', async () => {
    const res = await preview(csv(['ticker', 'exchange', 'name'], [['AAPL', 'NASDAQ', 'Apple']]))
    expect(res.statusCode).toBe(422)
    expect(res.json().errors).toContainEqual({ path: 'market', message: 'column is missing', rule: 'columnMissing' })
  })

  it('TC-U-1019 a repeated ticker carries rule repeatsRow with the earlier row', async () => {
    const res = await preview(csv(['ticker', 'market', 'exchange', 'name'], [usRow('AAPL'), usRow('MSFT'), usRow('AAPL')]))
    expect(res.statusCode).toBe(200)
    const row = res.json().rows.find((r: { rowNumber: number }) => r.rowNumber === 4)
    expect(row.errors).toEqual([{ path: 'ticker', message: 'repeats row 2 in this file', rule: 'repeatsRow', params: { row: 2 } }])
  })

  it('TC-U-1019 a bad cell keeps its message and gains the domain rule', async () => {
    const res = await preview(csv(['ticker', 'market', 'exchange', 'name'], [['AAPL', 'TH', 'NYSE', 'Apple']]))
    const [error] = res.json().rows[0].errors
    expect(error).toMatchObject({ rule: 'exchangeForMarket', params: { market: 'TH' } })
  })
})
