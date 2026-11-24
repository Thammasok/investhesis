/** `2026-11-24` in the investor's local time zone, so a download near midnight is dated by their clock. */
export function localDate(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

/** `investhesis-backup-2026-11-24.json`: the full backup, named by the local date (the API names it by UTC). */
export const backupFileName = (ext: 'json' | 'csv', now: Date = new Date()) => `investhesis-backup-${localDate(now)}.${ext}`
