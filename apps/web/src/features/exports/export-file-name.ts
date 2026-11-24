/** `2026-11-24` in the investor's local time zone, so a download near midnight is dated by their clock. */
export function localDate(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

/** `investhesis-backup-2026-11-24.json`: the full backup, named by the local date (the API names it by UTC). */
export const backupFileName = (ext: 'json' | 'csv', now: Date = new Date()) => `investhesis-backup-${localDate(now)}.${ext}`

// Control characters are the point: a file name cannot hold them.
// oxlint-disable-next-line no-control-regex
const FORBIDDEN = /[/\\:*?"<>|\u0000-\u001f\u007f]/g

/**
 * `investhesis-stocks-2026-11-24.csv` from the Stocks page, `investhesis-<list>-2026-11-24.csv` from a list
 * page. In the list part, characters a file name cannot hold become `-`, runs of `-` collapse, spaces and `-`
 * are trimmed from both ends, it is cut to 60 code points, and `list` stands in when nothing is left.
 */
export function exportFileName(listName: string | null, now: Date = new Date()): string {
  const base =
    listName === null
      ? 'stocks'
      : ([...listName.replace(FORBIDDEN, '-').replace(/-{2,}/g, '-').replace(/^[ -]+|[ -]+$/g, '')]
          .slice(0, 60)
          .join('')
          .replace(/[ -]+$/g, '') || 'list')
  return `investhesis-${base}-${localDate(now)}.csv`
}
