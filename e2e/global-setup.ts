const AUTH_HEALTH = 'http://127.0.0.1:54321/auth/v1/health'

async function up(url: string): Promise<boolean> {
  try {
    return (await fetch(url, { signal: AbortSignal.timeout(2000) })).status < 500
  } catch {
    return false
  }
}

/** `pnpm test:e2e` starts the stack first; this waits until Auth and the API answer. */
export default async function globalSetup() {
  for (const [name, url] of [
    ['local Supabase (run pnpm db:start)', AUTH_HEALTH],
    ['the API on :3000', 'http://localhost:3000/health'],
    ['the mock-mode API on :3100', 'http://localhost:3100/health'],
  ] as const) {
    let ok = false
    for (let i = 0; i < 60 && !ok; i++) {
      ok = await up(url)
      if (!ok) await new Promise((r) => setTimeout(r, 1000))
    }
    if (!ok) throw new Error(`${name} did not answer`)
  }
}
