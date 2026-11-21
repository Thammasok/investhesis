export type WebConfig =
  | { authMode: 'mock' }
  | { authMode: 'supabase'; supabaseUrl: string; supabasePublishableKey: string }

type Env = Record<string, string | boolean | undefined>

function text(env: Env, name: string): string | undefined {
  const value = env[name]
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined
}

/** The only reader of `import.meta.env` (pass it in). Throws a clear error when supabase mode lacks a value. */
export function readConfig(env: Env): WebConfig {
  const mode = text(env, 'VITE_AUTH_MODE') ?? 'supabase'
  if (mode === 'mock') return { authMode: 'mock' }
  if (mode !== 'supabase') throw new Error(`VITE_AUTH_MODE must be "supabase" or "mock", got "${mode}"`)

  const supabaseUrl = text(env, 'VITE_SUPABASE_URL')
  const supabasePublishableKey = text(env, 'VITE_SUPABASE_PUBLISHABLE_KEY')
  if (!supabaseUrl) throw new Error('VITE_SUPABASE_URL is required when VITE_AUTH_MODE=supabase')
  if (!supabasePublishableKey) throw new Error('VITE_SUPABASE_PUBLISHABLE_KEY is required when VITE_AUTH_MODE=supabase')
  return { authMode: 'supabase', supabaseUrl, supabasePublishableKey }
}
