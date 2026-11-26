import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildTestApp, type TestApp } from '../../../test/db.ts'
import { seedStock } from '../../../test/seed.ts'

let t: TestApp
beforeAll(async () => {
  t = await buildTestApp()
})
afterAll(() => t.cleanup())

const percentile = (xs: number[], p: number) => [...xs].sort((a, b) => a - b)[Math.ceil((p / 100) * xs.length) - 1] ?? Infinity

describe('NFR-002 chain rename latency against local Supabase', () => {
  it('TC-U-923 (NFR-002) p95 of a rename over 200 stocks is under 500 ms', async () => {
    for (let i = 0; i < 200; i++) {
      const id = await seedStock(t.handle, t.userId, `CL${i}`)
      await t.handle.pool.query('update app.stocks set value_chain = $2 where id = $1', [id, i % 2 ? 'Chain A' : 'chain a'])
    }
    const times: number[] = []
    for (let i = 0; i < 30; i++) {
      const [from, to] = i % 2 ? ['Name B', 'Name A'] : [i === 0 ? 'chain a' : 'Name A', 'Name B']
      const start = performance.now()
      const res = await t.app.inject({ method: 'POST', url: '/chains/rename', payload: { from, to, merge: true } })
      times.push(performance.now() - start)
      expect(res.statusCode).toBe(200)
    }
    console.log(`NFR-002 chain rename: median ${percentile(times, 50).toFixed(1)} ms, p95 ${percentile(times, 95).toFixed(1)} ms, max ${Math.max(...times).toFixed(1)} ms`)
    expect(percentile(times, 95)).toBeLessThan(500)
  })

  it('TC-A-924 (NFR-002) p95 of 20 renames of 200 stocks and of 20 merges of 100 + 100 is under 500 ms', async () => {
    const { newUserId } = await import('../../../test/db.ts')
    const userId = newUserId()
    const app = await t.appFor(userId)
    for (let i = 0; i < 200; i++) {
      const id = await seedStock(t.handle, userId, `TL${i}`)
      await t.handle.pool.query('update app.stocks set value_chain = $2 where id = $1', [id, ['AI & Semis', 'ai & semis', 'Ai & Semis'][i % 3]])
    }
    const send = async (payload: object) => {
      const start = performance.now()
      const res = await app.inject({ method: 'POST', url: '/chains/rename', payload })
      const ms = performance.now() - start
      expect(res.statusCode).toBe(200)
      return { ms, body: res.json() }
    }
    const renames: number[] = []
    let from = 'AI & Semis'
    for (let i = 0; i < 20; i++) {
      const to = i % 2 === 0 ? 'Name B' : 'Name A'
      const { ms, body } = await send({ from, to })
      renames.push(ms)
      expect(body.changed).toBe(200)
      from = to
    }
    // Merges: split the 200 stocks into two chains of 100, then merge them back, twenty times.
    const merges: number[] = []
    for (let i = 0; i < 20; i++) {
      await t.handle.pool.query(
        "update app.stocks set value_chain = case when (substring(ticker from 3))::int < 100 then 'Left' else 'Right' end where user_id = $1",
        [userId],
      )
      const { ms, body } = await send({ from: 'Left', to: 'Right', merge: true })
      merges.push(ms)
      expect(body).toMatchObject({ changed: 100, merged: true })
    }
    console.log(
      `NFR-002 TC-A-924 rename of 200: median ${percentile(renames, 50).toFixed(1)} ms, p95 ${percentile(renames, 95).toFixed(1)} ms; ` +
        `merge 100+100: median ${percentile(merges, 50).toFixed(1)} ms, p95 ${percentile(merges, 95).toFixed(1)} ms`,
    )
    expect(percentile(renames, 95)).toBeLessThan(500)
    expect(percentile(merges, 95)).toBeLessThan(500)
  })
})
