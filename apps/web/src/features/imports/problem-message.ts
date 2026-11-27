import { ApiError } from '@/lib/api-client'

export const IMPORT_MAX_ROWS = 1000

const GENERIC = 'Something went wrong. Try again.'

/**
 * The message for a failed import call. Preview and confirm share the file-level problems; the
 * `file_too_many_rows` problem carries no row count, so the message names the limit only (G-3).
 * Raw bodies are never shown.
 */
export function importProblemMessage(error: unknown): string {
  if (!(error instanceof ApiError)) return GENERIC
  switch (error.code) {
    case 'network_error':
      return 'Could not reach the server. Check your connection and try again.'
    case 'file_too_large':
      return 'File is larger than 1 MB'
    case 'file_unsupported':
      return 'Use a .csv or .xlsx file'
    case 'file_too_many_rows':
      return `The file has more than ${IMPORT_MAX_ROWS.toLocaleString('en-US')} rows; the limit is ${IMPORT_MAX_ROWS.toLocaleString('en-US')}`
    case 'file_empty':
      return 'The file has no data rows'
    case 'file_missing':
      return 'Choose a file to import'
    case 'file_missing_headers':
      return `Missing columns: ${error.errors.map((e) => e.path).join(', ')}`
    case 'nothing_to_import':
      return 'Nothing to import — fix the file and choose it again'
  }
  if (error.status === 413) return 'File is larger than 1 MB'
  if (error.status === 415) return 'Use a .csv or .xlsx file'
  return GENERIC
}
