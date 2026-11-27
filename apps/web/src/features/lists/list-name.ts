export const LIST_NAME_MAX = 60

/** Checks a list name as the API will (trimmed, 1-60 characters); returns the trimmed name or the message to show. */
export function checkListName(raw: string): { ok: true; name: string } | { ok: false; message: string } {
  const name = raw.trim()
  if (name.length === 0) return { ok: false, message: 'Enter a name for the list.' }
  if ([...name].length > LIST_NAME_MAX) return { ok: false, message: `Use 1 to ${LIST_NAME_MAX} characters.` }
  return { ok: true, name }
}

/** `Its 22 stocks stay saved.` The stocks are never deleted with a list (FR-011). */
export function staysSaved(count: number): string {
  if (count === 0) return 'It has no stocks.'
  return count === 1 ? 'Its 1 stock stays saved.' : `Its ${count.toLocaleString('en-US')} stocks stay saved.`
}
