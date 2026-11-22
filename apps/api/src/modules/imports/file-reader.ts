import { parse } from 'csv-parse/sync'
import ExcelJS from 'exceljs'
import { AppError } from '../../lib/app-error.ts'

export const MAX_ROWS = 1000

export type FileRow = { rowNumber: number; cells: string[] }
export type ImportFile = { format: 'csv' | 'xlsx'; header: string[]; rows: FileRow[] }

const unsupported = (detail: string) => new AppError({ status: 415, code: 'file_unsupported', detail })
const empty = () => new AppError({ status: 422, code: 'file_empty', detail: 'The file is empty' })
const tooMany = () => new AppError({ status: 422, code: 'file_too_many_rows', detail: `The file has more than ${MAX_ROWS} data rows` })

const isBlank = (cells: readonly string[]) => cells.every((c) => c.trim() === '')

export function formatOf(fileName: string): 'csv' | 'xlsx' {
  const dot = fileName.lastIndexOf('.')
  const ext = dot < 0 ? '' : fileName.slice(dot + 1).toLowerCase()
  if (ext === 'csv' || ext === 'xlsx') return ext
  throw unsupported('Only .csv and .xlsx files are accepted')
}

/** Bytes to a header row plus data rows keyed by the file's own row number (header = 1). */
export async function readImportFile(fileName: string, bytes: Buffer): Promise<ImportFile> {
  const format = formatOf(fileName)
  const records = format === 'csv' ? readCsv(bytes) : await readXlsx(bytes)
  const [first, ...rest] = records
  if (!first) throw empty()
  const rows = rest.filter((r) => !isBlank(r.cells))
  if (rows.length > MAX_ROWS) throw tooMany()
  return { format, header: first.cells, rows }
}

function readCsv(bytes: Buffer): FileRow[] {
  let text: string
  try {
    // A default TextDecoder drops one leading BOM.
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    throw unsupported('The CSV file must be UTF-8')
  }
  let records: string[][]
  try {
    records = parse(text, { relax_column_count: true }) as string[][]
  } catch {
    throw unsupported('The file is not valid CSV')
  }
  return records.map((cells, i) => ({ rowNumber: i + 1, cells }))
}

const ZIP_SIGNATURE = Buffer.from([0x50, 0x4b, 0x03, 0x04])

function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (value instanceof Date) return value.toISOString()
  if ('richText' in value) return value.richText.map((r) => r.text).join('')
  if ('formula' in value || 'sharedFormula' in value) {
    const result = (value as { result?: ExcelJS.CellValue }).result
    return result === undefined || (typeof result === 'object' && result !== null && 'error' in result) ? '' : cellText(result)
  }
  if ('text' in value) return cellText(value.text as ExcelJS.CellValue)
  return ''
}

async function readXlsx(bytes: Buffer): Promise<FileRow[]> {
  if (!bytes.subarray(0, 4).equals(ZIP_SIGNATURE)) throw unsupported('The file is not a valid .xlsx workbook')
  const workbook = new ExcelJS.Workbook()
  try {
    await workbook.xlsx.load(bytes as unknown as ExcelJS.Buffer)
  } catch {
    throw unsupported('The file is not a valid .xlsx workbook')
  }
  const sheet = workbook.worksheets[0]
  if (!sheet) return []
  // Checked before any cell is read: a small file can expand to many rows (design Risks).
  if (sheet.actualRowCount > MAX_ROWS + 1) throw tooMany()

  const width = sheet.getRow(1).cellCount
  const records: FileRow[] = []
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    const cells: string[] = []
    for (let c = 1; c <= Math.max(width, row.cellCount); c++) cells.push(cellText(row.getCell(c).value))
    records.push({ rowNumber, cells })
  })
  return records
}
