import { i18n } from '@/i18n/i18n'

export const LIST_NAME_MAX = 60

/** Checks a list name as the API will (trimmed, 1-60 characters); returns the trimmed name or the message to show. */
export function checkListName(raw: string): { ok: true; name: string } | { ok: false; message: string } {
  const name = raw.trim()
  if (name.length === 0) return { ok: false, message: i18n.t('lists.nameCheck.enterName') }
  if ([...name].length > LIST_NAME_MAX) return { ok: false, message: i18n.t('lists.nameCheck.length', { max: LIST_NAME_MAX }) }
  return { ok: true, name }
}

/** `Its 22 stocks stay saved.` The stocks are never deleted with a list (FR-011). */
export function staysSaved(count: number): string {
  if (count === 0) return i18n.t('lists.deleteDialog.noStocks')
  return i18n.t('lists.deleteDialog.staysSaved', { count, n: count.toLocaleString('en-US') })
}
