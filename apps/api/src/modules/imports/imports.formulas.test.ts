import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildTestApp, type TestApp } from '../../../test/db.ts'
import { HEADERS, csv, xlsx } from '../../../test/fixtures/imports/build.ts'
import { filePart, multipart } from '../../../test/multipart.ts'

let t: TestApp
beforeAll(async () => {
  t = await buildTestApp()
})
afterAll(() => t.cleanup())

/** Cells that Excel would run as formulas when a file with them is opened (the usual CSV-injection payloads). */
const PAYLOADS = ['=1+1', '+SUM(A1:A2)', '-2+3', '@SUM(A1)', '=HYPERLINK("http://example.test","x")', '=cmd|\' /C calc\'!A0']

describe('TC-A-149 formula-like cells are stored byte for byte (NFR-009, decision: not escaped)', () => {
  const rows = PAYLOADS.map((payload, i) => ({ ticker: `F${i}`, market: 'US', exchange: 'NYSE', name: payload }))
  const send = (url: string, file: Buffer, name: string, extra: { name: string; value: string }[] = []) =>
    t.app.inject({ method: 'POST', url, ...multipart([...extra, filePart(file, name)]) })

  it('TC-A-149: a CSV preview echoes the cells unchanged', async () => {
    const res = await send('/imports/preview', csv(['ticker', 'market', 'exchange', 'name'], rows), 'f.csv')

    expect(res.statusCode).toBe(200)
    expect(res.json().rows.map((r: { name: string }) => r.name)).toEqual(PAYLOADS)
  })

  it('TC-A-149: a confirmed CSV import saves them unchanged, and the API returns them unchanged', async () => {
    const res = await send('/imports', csv(['ticker', 'market', 'exchange', 'name'], rows), 'f.csv', [
      { name: 'duplicateMode', value: 'skip' },
      { name: 'newListName', value: 'Formulas' },
    ])

    const stocks = (await t.app.inject('/stocks')).json().items as { ticker: string; name: string }[]
    expect(res.json()).toMatchObject({ created: PAYLOADS.length })
    expect(stocks.map((s) => s.name)).toEqual(PAYLOADS)
    const stored = (await t.handle.pool.query('select name from app.stocks where user_id = $1 order by ticker', [t.userId])).rows.map((r) => r.name)
    expect(stored.map((n) => Buffer.from(n).toString('hex'))).toEqual(PAYLOADS.map((p) => Buffer.from(p).toString('hex')))
  })

  it('TC-A-149: text cells of an XLSX that look like formulas are read as text, unchanged', async () => {
    const book = await xlsx([{ rows: [HEADERS, ...PAYLOADS.map((p, i) => HEADERS.map((h) => ({ ticker: `X${i}`, market: 'US', exchange: 'NYSE', name: p })[h as 'name'] ?? ''))] }])

    const res = await send('/imports/preview', book, 'f.xlsx')

    expect(res.statusCode).toBe(200)
    expect(res.json().rows.map((r: { name: string }) => r.name)).toEqual(PAYLOADS)
  })
})
