import { request } from 'node:http'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildTestApp, type TestApp } from '../../../test/db.ts'
import { F } from '../../../test/fixtures/imports/build.ts'
import { filePart, multipart } from '../../../test/multipart.ts'

let t: TestApp
beforeAll(async () => {
  t = await buildTestApp()
})
afterAll(() => t.cleanup())

const count = async (sql: string, args: unknown[]) => Number((await t.handle.pool.query(sql, args)).rows[0].n)

describe('TC-A-148 client abort during confirm', () => {
  it('TC-A-148 a dropped connection leaves the whole import or none of it, and the API stays healthy', async () => {
    // Arrange: a real socket, as the inject helper cannot be aborted mid-flight
    const address = await t.app.listen({ port: 0, host: '127.0.0.1' })
    const { port } = new URL(address)
    const body = multipart([{ name: 'duplicateMode', value: 'skip' }, { name: 'newListName', value: 'Abort' }, filePart(F.rows1000(), 'big.csv')])

    // Act: send the confirm and destroy the connection after 50 ms
    await new Promise<void>((resolve) => {
      const req = request({ host: '127.0.0.1', port: Number(port), method: 'POST', path: '/imports', headers: { ...body.headers, 'content-length': body.payload.length } })
      req.on('error', () => {})
      req.on('close', () => resolve())
      req.write(body.payload)
      setTimeout(() => req.destroy(), 50)
    })
    await new Promise((r) => setTimeout(r, 5000))

    // Assert: all or nothing
    const stocks = await count('select count(*) n from app.stocks where user_id = $1', [t.userId])
    const memberships = await count('select count(*) n from app.list_stocks where user_id = $1', [t.userId])
    const lists = await count('select count(*) n from app.lists where user_id = $1', [t.userId])
    expect([stocks, memberships, lists]).toSatisfy(([s, m, l]: number[]) => (s === 1000 && m === 1000 && l === 1) || (s === 0 && m === 0 && l === 0))
    expect((await t.app.inject('/health')).statusCode).toBe(200)

    // Assert: a new confirm of the same file reports a consistent state
    const again = await t.app.inject({ method: 'POST', url: '/imports', ...multipart([{ name: 'duplicateMode', value: 'skip' }, { name: 'newListName', value: 'Abort again' }, filePart(F.rows1000(), 'big.csv')]) })
    expect(again.statusCode).toBe(200)
    expect(again.json()).toMatchObject(stocks === 1000 ? { created: 0, skipped: 1000 } : { created: 1000 })
  }, 30_000)
})
