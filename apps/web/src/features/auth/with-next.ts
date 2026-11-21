import { safeNext } from './safe-next'

/** Appends `?next=` to an auth link when the visitor has a (safe) return path to keep. */
export function withNext(path: string, next: string | null): string {
  if (next && safeNext(next) === next) return `${path}?next=${encodeURIComponent(next)}`
  return path
}
