import { i18n } from '@/i18n/i18n'
import { ApiError } from '@/lib/api-client'

export const IMPORT_MAX_ROWS = 1000

/**
 * The message for a failed import call. Preview and confirm share the file-level problems; the
 * `file_too_many_rows` problem carries no row count, so the message names the limit only (G-3).
 * Raw bodies are never shown.
 */
export function importProblemMessage(error: unknown): string {
  if (!(error instanceof ApiError)) return i18n.t('imports.problem.generic')
  switch (error.code) {
    case 'network_error':
      return i18n.t('imports.problem.network')
    case 'file_too_large':
      return i18n.t('imports.problem.tooLarge')
    case 'file_unsupported':
      return i18n.t('imports.problem.unsupported')
    case 'file_too_many_rows':
      return i18n.t('imports.problem.tooManyRows', { limit: IMPORT_MAX_ROWS.toLocaleString('en-US') })
    case 'file_empty':
      return i18n.t('imports.problem.empty')
    case 'file_missing':
      return i18n.t('imports.problem.missing')
    case 'file_missing_headers':
      return i18n.t('imports.problem.missingHeaders', { columns: error.errors.map((e) => e.path).join(', ') })
    case 'nothing_to_import':
      return i18n.t('imports.problem.nothing')
  }
  if (error.status === 413) return i18n.t('imports.problem.tooLarge')
  if (error.status === 415) return i18n.t('imports.problem.unsupported')
  return i18n.t('imports.problem.generic')
}
