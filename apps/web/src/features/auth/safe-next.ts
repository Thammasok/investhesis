export const DEFAULT_NEXT = '/stocks'

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/
const PROBE_ORIGIN = 'http://probe.invalid'

/**
 * Accepts only a same-origin app path to return to after sign-in (FR-008): it starts with `/`,
 * not `//` or `/\`, has no scheme, and is not under `/auth`. Anything else gives `/stocks`.
 */
export function safeNext(raw: string | null | undefined): string {
  if (!raw || !raw.startsWith('/')) return DEFAULT_NEXT
  if (raw.startsWith('//') || raw.includes('\\') || CONTROL_CHARS.test(raw)) return DEFAULT_NEXT
  let url: URL
  try {
    url = new URL(raw, PROBE_ORIGIN)
  } catch {
    return DEFAULT_NEXT
  }
  if (url.origin !== PROBE_ORIGIN) return DEFAULT_NEXT
  if (url.pathname === '/auth' || url.pathname.startsWith('/auth/')) return DEFAULT_NEXT
  return raw
}
