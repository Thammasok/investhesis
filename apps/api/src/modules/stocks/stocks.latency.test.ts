import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildTestApp, type TestApp } from '../../../test/db.ts'

let t: TestApp
beforeAll(async () => {
  t = await buildTestApp()
})
afterAll(() => t.cleanup())

const percentile = (xs: number[], p: number) => [...xs].sort((a, b) => a - b)[Math.ceil((p / 100) * xs.length) - 1] ?? Infinity

async function series(n: number, run: (i: number) => Promise<number>): Promise<number[]> {
  const times: number[] = []
  for (let i = 0; i < n; i++) {
    const start = performance.now()
    const status = await run(i)
    times.push(performance.now() - start)
    expect(status).toBeLessThan(400)
  }
  return times
}

describe('NFR-001 latency against local Supabase', () => {
  it('TC-A-125 p95 of 50 sequential POST /stocks and PATCH /stocks/{id} is under 500 ms', async () => {
    const body = (tk: string) => ({
      ticker: tk,
      market: 'US',
      exchange: 'NASDAQ',
      name: 'NVIDIA Corporation',
      indexMembership: ['S&P 500', 'Nasdaq-100'],
      gicsSector: 'Information Technology',
      valueChain: 'AI',
      valueChainPosition: 'Midstream',
      size: 'Large',
      style: 'Growth',
      economicCycle: 'Sensitive',
      lynchType: 'Fast Grower',
      lifeCycle: 'Growth',
      customers: ['B2B'],
      revenueTypes: ['Product sale'],
      moat: 'Switching cost',
      themes: ['AI', 'Semiconductors'],
      volatility: 'High',
    })
    const post = (tk: string) => t.app.inject({ method: 'POST', url: '/stocks', payload: body(tk) })
    for (let i = 0; i < 5; i++) await post(`WARM${i}`)

    const ids: string[] = []
    const posts = await series(50, async (i) => {
      const res = await post(`LAT${i}`)
      ids.push(res.json().id)
      return res.statusCode
    })
    const patches = await series(50, async (i) =>
      (await t.app.inject({ method: 'PATCH', url: `/stocks/${ids[i]}`, payload: { style: 'Value', themes: ['AI'] } })).statusCode,
    )
    for (const [label, xs] of [['POST', posts], ['PATCH', patches]] as const) {
      console.log(`NFR-001 ${label}: min ${Math.min(...xs).toFixed(1)} ms, median ${percentile(xs, 50).toFixed(1)} ms, p95 ${percentile(xs, 95).toFixed(1)} ms, max ${Math.max(...xs).toFixed(1)} ms`)
      expect(percentile(xs, 95)).toBeLessThan(500)
    }
  }, 60_000)
})

describe('NFR-002 holding writes against local Supabase', () => {
  it('TC-A-421 p95 of 50 sequential holding PATCH, clear and POST is under 500 ms', async () => {
    const ids: string[] = []
    for (let i = 0; i < 50; i++) {
      const res = await t.app.inject({ method: 'POST', url: '/stocks', payload: { ticker: `HLD${i}`, market: 'US', exchange: 'NASDAQ', name: 'Held' } })
      ids.push(res.json().id)
    }
    const patch = (i: number, holding: unknown) => t.app.inject({ method: 'PATCH', url: `/stocks/${ids[i]}`, payload: { holding } as object })
    const sets = await series(50, async (i) => (await patch(i, { shares: '120.5', averageCost: '412.33' })).statusCode)
    const clears = await series(50, async (i) => (await patch(i, null)).statusCode)
    const posts = await series(50, async (i) =>
      (await t.app.inject({ method: 'POST', url: '/stocks', payload: { ticker: `HPOST${i}`, market: 'US', exchange: 'NASDAQ', name: 'Held', holding: { shares: '1', averageCost: '2' } } })).statusCode,
    )
    for (const [label, xs] of [['PATCH holding', sets], ['PATCH clear', clears], ['POST with holding', posts]] as const) {
      console.log(`NFR-002 ${label}: min ${Math.min(...xs).toFixed(1)} ms, median ${percentile(xs, 50).toFixed(1)} ms, p95 ${percentile(xs, 95).toFixed(1)} ms, max ${Math.max(...xs).toFixed(1)} ms`)
      expect(percentile(xs, 95)).toBeLessThan(500)
    }
  }, 60_000)
})
