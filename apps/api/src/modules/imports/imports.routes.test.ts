import { readdirSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { TEMPLATE_COLUMNS } from '@investhesis/domain'
import ExcelJS from 'exceljs'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildTestApp, newUserId, type TestApp } from '../../../test/db.ts'
import { F, HEADERS, csv, manyRows, xlsx } from '../../../test/fixtures/imports/build.ts'
import { filePart, multipart, type Part } from '../../../test/multipart.ts'
import { seedList, seedStock } from '../../../test/seed.ts'

let t: TestApp
let app: FastifyInstance

beforeAll(async () => {
  t = await buildTestApp()
  app = t.app
})
afterAll(() => t.cleanup())

const fixture = (name: string) => readFile(new URL(`../../../test/fixtures/imports/${name}`, import.meta.url))
const send = (a: FastifyInstance, parts: Part[]) => a.inject({ method: 'POST', url: '/imports/preview', ...multipart(parts) })
const preview = (file: string | Buffer, name = 'holdings.csv', a = app) => send(a, [filePart(file, name)])
const count = async (sql: string, args: unknown[] = []) => Number((await t.handle.pool.query(sql, args)).rows[0].n)
const TABLES = ['stocks', 'lists', 'list_stocks']
// Scoped to the test user: other test files share this database and run in parallel, so whole-table counts race with them.
const tableCounts = async () => Promise.all(TABLES.map((n) => count(`select count(*)::int n from app.${n} where user_id = $1`, [t.userId])))

describe('POST /imports/preview headers', () => {
  it('TC-U-050 matches headers ignoring case, spaces and order; unknown headers warn', async () => {
    const body = ' Name ,TICKER,exchange,market,notes\nApple Inc.,aapl,NASDAQ,us,hello\n'
    const res = await preview(body)
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({
      fileName: 'holdings.csv',
      format: 'csv',
      counts: { new: 1, duplicate: 0, error: 0 },
      headerWarnings: ['Unknown column "notes" ignored'],
      ignoredColumns: [],
      rows: [{ rowNumber: 2, ticker: 'AAPL', market: 'US', name: 'Apple Inc.', status: 'new', errors: [] }],
    })
  })

  it('TC-U-051 missing required headers reject the whole file', async () => {
    const res = await preview('ticker,market\nAAPL,US\n')
    expect(res.statusCode).toBe(422)
    expect(res.headers['content-type']).toContain('application/problem+json')
    expect(res.json()).toMatchObject({ code: 'file_missing_headers', errors: [{ path: 'exchange' }, { path: 'name' }] })
  })

  it('TC-A-131 names every missing header, strips a BOM, and gives duplicate or empty headers a defined result', async () => {
    expect((await preview('ticker\n')).json().errors.map((e: { path: string }) => e.path)).toEqual(['market', 'exchange', 'name'])
    const bom = await preview('﻿TICKER ,Market,EXCHANGE,NAME\nAAPL,US,NYSE,Apple\n')
    expect(bom.json()).toMatchObject({ headerWarnings: [], counts: { new: 1 } })
    const dup = await preview('ticker,market,exchange,name,ticker,\nAAPL,US,NYSE,Apple,ZZZ,\n')
    expect(dup.statusCode).toBe(200)
    expect(dup.json().headerWarnings).toEqual(['Duplicate column "ticker" ignored'])
    expect(dup.json().rows[0].ticker).toBe('AAPL')
    const three = await preview('ticker,market,exchange,name,a,b,c\nAAPL,US,NYSE,Apple,1,2,3\n')
    expect(three.json().headerWarnings).toEqual(['Unknown column "a" ignored', 'Unknown column "b" ignored', 'Unknown column "c" ignored'])
    expect((await preview('ticker,market,exchange,name\n')).json().code).toBe('file_empty')
  })
})

describe('POST /imports/preview rows', () => {
  it('TC-U-052 gives new, duplicate and error statuses with file row numbers', async () => {
    const t2 = await buildTestApp()
    try {
      const saved = await seedStock(t2.handle, t2.userId, 'AAPL')
      const res = await preview(
        csv(['ticker', 'market', 'exchange', 'name'], [['NVDA', 'US', 'NASDAQ', 'NVIDIA'], ['AAPL', 'US', 'NASDAQ', 'Apple'], ['XYZ', 'JP', 'NASDAQ', 'Xyz'], ['nvda', 'us', 'NASDAQ', 'again']]),
        'h.csv',
        t2.app,
      )
      const body = res.json()
      expect(body.counts).toEqual({ new: 1, duplicate: 1, error: 2 })
      expect(body.rows.map((r: { rowNumber: number; status: string }) => [r.rowNumber, r.status])).toEqual([[2, 'new'], [3, 'duplicate'], [4, 'error'], [5, 'error']])
      expect(body.rows[1].existingStockId).toBe(saved)
      expect(body.rows[2].errors).toEqual([expect.objectContaining({ path: 'market' })])
      expect(body.rows[3].errors).toEqual([{ path: 'ticker', message: expect.stringContaining('row 2') }])
    } finally {
      await t2.cleanup()
    }
  })

  it('TC-A-133 flags a repeat of an earlier row but not the same ticker on another market', async () => {
    const res = await preview(csv(['ticker', 'market', 'exchange', 'name'], [['NVDA', 'US', 'NASDAQ', 'a'], ['NVDA', 'US', 'NASDAQ', 'b'], ['nvda', 'US', 'NASDAQ', 'c'], ['NVDA', 'TH', 'SET', 'd']]))
    expect(res.json().rows.map((r: { status: string }) => r.status)).toEqual(['new', 'error', 'error', 'new'])
  })

  it('TC-A-132 reports every failed field of a row and keeps valid rows new', async () => {
    const res = await preview(csv(['ticker', 'market', 'exchange', 'name', 'style'], [['!!', 'JP', 'NYSE', '', 'Growth'], ['OK', 'US', 'NYSE', 'Fine', ' growth ']]))
    const [bad, ok] = res.json().rows
    expect(bad.errors.map((e: { path: string }) => e.path).sort()).toEqual(['market', 'name', 'ticker'])
    expect(bad.errors.every((e: { message: string }) => e.message.length > 0)).toBe(true)
    expect(ok.status).toBe('new')
  })

  it('TC-A-130 counts blank lines as rows without importing them, and keeps quoted newlines in one row', async () => {
    const body = 'ticker,market,exchange,name\r\n\r\nAAPL,US,NYSE,"Berkshire ""B"",\nInc."\r\n\r\nMSFT,US,NYSE,Microsoft\r\n\r\n'
    const res = await preview(body)
    expect(res.json().rows).toMatchObject([
      { rowNumber: 3, name: 'Berkshire "B",\nInc.' },
      { rowNumber: 5, ticker: 'MSFT' },
    ])
  })

  it('TC-U-056 strips the BOM and keeps Thai text exact', async () => {
    const res = await preview(await fixture('thai-names.csv'), 'thai.csv')
    const body = res.json()
    expect(body.rows[0].name).toBe('บมจ. ปตท.')
    expect(body.counts).toEqual({ new: 5, duplicate: 0, error: 0 })
    const bomFile = await preview(Buffer.from('﻿ticker,market,exchange,name\nPTT,TH,SET,ปตท.\n'))
    expect(bomFile.json()).toMatchObject({ headerWarnings: [], rows: [{ name: 'ปตท.' }] })
  })

  it('TC-A-129 accepts upper-case extensions and the no-BOM fixture', async () => {
    expect((await preview(await fixture('no-bom.csv'), 'UPPER.CSV')).json().counts.new).toBe(3)
    expect((await preview(await F.formulaXlsx(), 'UPPER.XLSX')).json().format).toBe('xlsx')
  })
})

describe('POST /imports/preview file limits', () => {
  it('TC-U-053 enforces size and row limits', async () => {
    const big = await send(app, [filePart(F.ofSize(1.1 * 1024 * 1024 | 0), 'big.csv')])
    expect(big.statusCode).toBe(413)
    expect(big.json().code).toBe('file_too_large')
    const many = await preview(F.rows1001())
    expect([many.statusCode, many.json().code]).toEqual([422, 'file_too_many_rows'])
    const ok = await preview(F.rows1000())
    expect([ok.statusCode, ok.json().rows.length]).toEqual([200, 1000])
    const none = await preview(await fixture('header-only.csv'))
    expect([none.statusCode, none.json().code]).toEqual([422, 'file_empty'])
    expect((await preview('')).json().code).toBe('file_empty')
  })

  it('TC-A-129 accepts exactly 1,048,576 bytes and rejects one more', async () => {
    const exact = F.ofSize(1_048_576)
    expect(exact.length).toBe(1_048_576)
    expect((await preview(exact)).statusCode).toBe(200)
    expect((await preview(F.ofSize(1_048_577))).statusCode).toBe(413)
  })

  it('TC-U-054 rejects unsupported files', async () => {
    for (const [name, body] of [['report.txt', await fixture('report.txt')], ['holdings.xlsx', await fixture('fake.xlsx')], ['latin1.csv', await fixture('latin1.csv')], ['legacy.xls', await fixture('legacy.xls')], ['noext', Buffer.from('a')]] as const) {
      const res = await preview(body, name)
      expect([name, res.statusCode, res.json().code]).toEqual([name, 415, 'file_unsupported'])
    }
  })

  it('TC-U-055 reads only the first worksheet and the cached formula result', async () => {
    for (const name of ['formula.xlsx', 'two-sheets.xlsx']) {
      const res = await preview(await fixture(name), name)
      expect(res.statusCode).toBe(200)
      expect(res.json().rows).toHaveLength(1)
    }
    expect((await preview(await fixture('formula.xlsx'), 'formula.xlsx')).json().rows[0].name).toBe('Advanc')
  })

  it('TC-A-134 turns xlsx cell types into text and never answers 5xx', async () => {
    const date = new Date(Date.UTC(2026, 0, 2))
    const file = await xlsx([
      {
        rows: [
          ['ticker', 'market', 'exchange', 'name'],
          [700, 'TH', 'SET', true],
          ['A', 'US', 'NYSE', date],
          ['B', 'US', 'NYSE', { formula: '1/0', result: { error: '#DIV/0!' } }],
          ['C', 'US', 'NYSE', { richText: [{ text: 'Rich ' }, { text: 'Text' }] }],
          ['D', 'US', 'NYSE', '  padded  '],
        ],
      },
    ])
    const res = await preview(file, 'cells.xlsx')
    expect(res.statusCode).toBe(200)
    const rows = res.json().rows
    expect(rows[0]).toMatchObject({ ticker: '700', status: 'new', name: 'true' })
    expect(rows[1].name).toBe('2026-01-02T00:00:00.000Z')
    expect(rows[2]).toMatchObject({ status: 'error', errors: [{ path: 'name' }] })
    expect(rows[3].name).toBe('Rich Text')
    expect(rows[4].name).toBe('padded')
  })

  it('TC-A-135 rejects an xlsx with too many rows after load, quickly', async () => {
    const file = await xlsx([{ rows: [HEADERS, ...manyRows(2500).map((r) => HEADERS.map((h) => (r as Record<string, string>)[h] ?? ''))] }])
    const started = performance.now()
    const res = await preview(file, 'bomb.xlsx')
    expect([res.statusCode, res.json().code]).toEqual([422, 'file_too_many_rows'])
    expect(performance.now() - started).toBeLessThan(3000)
  })

  it('TC-U-057 answers 400 file_missing without a file part', async () => {
    for (const parts of [[{ name: 'note', value: 'x' }], [{ name: 'file', value: 'not a file' }]]) {
      const res = await send(app, parts)
      expect([res.statusCode, res.json().code]).toEqual([400, 'file_missing'])
    }
    const json = await app.inject({ method: 'POST', url: '/imports/preview', payload: {} })
    expect([json.statusCode, json.json().code]).toEqual([400, 'file_missing'])
    expect((await app.inject({ method: 'POST', url: '/imports/preview' })).json().code).toBe('file_missing')
  })

  it('TC-A-136 handles multipart quirks without a 5xx', async () => {
    const two = await send(app, [filePart(F.noBom(), 'a.csv'), filePart(F.noBom(), 'b.csv')])
    expect(two.statusCode).toBeLessThan(500)
    const bigField = await send(app, [{ name: 'note', value: 'x'.repeat(2 * 1024 * 1024) }, filePart(F.noBom(), 'a.csv')])
    expect([400, 413]).toContain(bigField.statusCode)
    const hostile = await preview(F.noBom(), '../../x<img src=x onerror=alert(1)>.csv')
    expect(hostile.statusCode).toBe(200)
    expect(hostile.json().fileName).toBe('x<img src=x onerror=alert(1)>.csv') // the parser drops the path
    const extra = await send(app, [{ name: 'userId', value: 'v' }, filePart(F.noBom(), 'a.csv')])
    expect(extra.statusCode).toBe(200)
  })
})

describe('POST /imports/preview privacy and speed', () => {
  it('TC-A-137 writes nothing to the database or the temp directory', async () => {
    const dirBefore = readdirSync(tmpdir()).sort()
    const before = await tableCounts()
    for (const [file, name] of [[await fixture('thai-names.csv'), 'a.csv'], [F.rows1000(), 'b.csv'], [csv(['ticker', 'market', 'exchange', 'name'], [['', 'JP', 'X', '']]), 'c.csv'], [await fixture('report.txt'), 'd.txt']] as const) {
      await preview(file, name)
    }
    expect(await tableCounts()).toEqual(before)
    expect(readdirSync(tmpdir()).sort()).toEqual(dirBefore)
    expect((await send(app, [])).json().code).toBe('file_missing')
  })

  it('TC-A-138 previews 1,000 rows against 300 saved stocks in under 3 s (csv and xlsx)', async () => {
    const t3 = await buildTestApp()
    try {
      const { pool } = t3.handle
      await pool.query(
        "insert into app.stocks (id, user_id, market, exchange, currency, ticker, name) select gen_random_uuid(), $1, 'US', 'NASDAQ', 'USD', 'T' || lpad(g::text, 4, '0'), 'x' from generate_series(1, 300) g",
        [t3.userId],
      )
      const asXlsx = await xlsx([{ rows: [HEADERS, ...manyRows(1000).map((r) => HEADERS.map((h) => (r as Record<string, string>)[h] ?? ''))] }])
      await preview(F.rows1000(), 'w.csv', t3.app)
      const times: number[] = []
      for (const [file, name] of [[F.rows1000(), 'a.csv'], [asXlsx, 'a.xlsx'], [F.rows1000(), 'b.csv'], [asXlsx, 'b.xlsx']] as const) {
        const started = performance.now()
        const res = await preview(file, name, t3.app)
        times.push(performance.now() - started)
        expect(res.json().counts).toEqual({ new: 700, duplicate: 300, error: 0 })
      }
      expect(Math.max(...times)).toBeLessThan(3000)
    } finally {
      await t3.cleanup()
    }
  })

  it('TC-A-104 (preview half) another user cannot tell that a stock is saved', async () => {
    const owner = await buildTestApp()
    try {
      await seedStock(owner.handle, owner.userId, 'AAPL')
      await seedList(owner.handle, owner.userId, 'LU')
      const mine = (await preview(F.noBom(), 'f.csv')).json()
      expect(mine.counts).toEqual({ new: 3, duplicate: 0, error: 0 })
      const theirs = (await preview(F.noBom(), 'f.csv', owner.app)).json()
      expect(theirs.counts).toEqual({ new: 2, duplicate: 1, error: 0 })
    } finally {
      await owner.cleanup()
    }
  })

  it('TC-A-105 (preview half) ignores user ids sent in the form or headers', async () => {
    const res = await app.inject({ method: 'POST', url: '/imports/preview', headers: { ...multipart([]).headers, 'x-user-id': newUserId() }, payload: multipart([{ name: 'userId', value: newUserId() }, filePart(F.noBom(), 'a.csv')]).payload })
    expect(res.statusCode).toBe(200)
  })
})

describe('GET /imports/template.*', () => {
  it('TC-U-058 lists the columns in order, as attachments, with a BOM on the CSV', async () => {
    const csvRes = await app.inject({ method: 'GET', url: '/imports/template.csv' })
    expect(csvRes.statusCode).toBe(200)
    expect(csvRes.headers['content-type']).toBe('text/csv; charset=utf-8')
    expect(csvRes.headers['content-disposition']).toBe('attachment; filename="investhesis-stocks-template.csv"')
    expect([...csvRes.rawPayload.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf])
    expect(csvRes.body.replace(/^﻿/, '').split(/\r?\n/)[0]).toBe(TEMPLATE_COLUMNS.map((c) => c.header).join(','))
    expect(HEADERS).toHaveLength(19)

    const xlsxRes = await app.inject({ method: 'GET', url: '/imports/template.xlsx' })
    expect(xlsxRes.statusCode).toBe(200)
    expect(xlsxRes.headers['content-disposition']).toBe('attachment; filename="investhesis-stocks-template.xlsx"')
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(xlsxRes.rawPayload as unknown as ExcelJS.Buffer)
    expect(wb.worksheets).toHaveLength(1)
    expect(((wb.worksheets[0]?.getRow(1).values ?? []) as string[]).slice(1)).toEqual(HEADERS)
  })

  it('TC-A-127 the CSV template previews as two new rows, one per market, with no warnings', async () => {
    const res = await app.inject({ method: 'GET', url: '/imports/template.csv' })
    const body = (await preview(res.rawPayload, 'investhesis-stocks-template.csv')).json()
    expect(body).toMatchObject({ counts: { new: 2, duplicate: 0, error: 0 }, headerWarnings: [] })
    expect(body.rows.map((r: { market: string }) => r.market)).toEqual(['US', 'TH'])
  })

  it('TC-A-128 the XLSX template previews as two new rows of plain strings', async () => {
    const res = await app.inject({ method: 'GET', url: '/imports/template.xlsx' })
    expect(res.headers['content-type']).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(res.rawPayload as unknown as ExcelJS.Buffer)
    const rows = wb.worksheets[0]
    expect(rows?.actualRowCount).toBe(3)
    rows?.eachRow((row) => row.eachCell((cell) => expect(typeof cell.value).toBe('string')))
    const body = (await preview(res.rawPayload, 'investhesis-stocks-template.xlsx')).json()
    expect(body).toMatchObject({ counts: { new: 2, duplicate: 0, error: 0 }, headerWarnings: [] })
  })

  it('TC-U-058 the template fixture matches what the route serves for the same rows', async () => {
    const body = (await preview(await fixture('template-bom.csv'), 'template-bom.csv')).json()
    expect(body.counts).toEqual({ new: 2, duplicate: 0, error: 0 })
  })
})

describe('imports routes in OpenAPI', () => {
  it('TC-A-124 (imports part) lists the three routes with bearerAuth', async () => {
    const spec = (await app.inject({ method: 'GET', url: '/openapi.json' })).json()
    for (const [path, method] of [['/imports/template.csv', 'get'], ['/imports/template.xlsx', 'get'], ['/imports/preview', 'post']] as const) {
      expect(spec.paths[path]?.[method]?.security).toEqual([{ bearerAuth: [] }])
    }
    expect(Object.keys(spec.paths['/imports/preview'].post.responses)).toEqual(expect.arrayContaining(['200', '400', '413', '415', '422']))
  })
})

