import { describe, expect, it } from 'vitest'
import { ApiError } from '@/lib/api-client'
import { buildErrorCsv } from './error-csv'
import { importProblemMessage } from './problem-message'

const problem = (status: number, code: string, errors: unknown[] = []) => new ApiError(status, { code, errors })

describe('importProblemMessage', () => {
  it('TC-U-135: maps every file-level problem code to its message', () => {
    expect(importProblemMessage(problem(413, 'file_too_large'))).toBe('File is larger than 1 MB')
    expect(importProblemMessage(problem(415, 'file_unsupported'))).toBe('Use a .csv or .xlsx file')
    // The 422 carries no row count (G-3), so the message names the limit only.
    expect(importProblemMessage(problem(422, 'file_too_many_rows'))).toBe('The file has more than 1,000 rows; the limit is 1,000')
    expect(importProblemMessage(problem(422, 'file_empty'))).toBe('The file has no data rows')
    expect(importProblemMessage(problem(400, 'file_missing'))).toBe('Choose a file to import')
    expect(importProblemMessage(problem(422, 'nothing_to_import'))).toBe('Nothing to import — fix the file and choose it again')
  })

  it('TC-U-135: names every missing header', () => {
    const error = problem(422, 'file_missing_headers', [
      { path: 'ticker', message: 'missing' },
      { path: 'name', message: 'missing' },
    ])
    expect(importProblemMessage(error)).toBe('Missing columns: ticker, name')
  })

  it('TC-U-135: a network error is retryable; an unknown code and a 500 are generic and never show raw JSON', () => {
    expect(importProblemMessage(new ApiError(0, undefined, 'network_error'))).toBe('Could not reach the server. Check your connection and try again.')
    for (const error of [problem(418, 'boom'), problem(500, 'internal_error'), new ApiError(500, '{"code":"x"}')]) {
      const message = importProblemMessage(error)
      expect(message).toBe('Something went wrong. Try again.')
      expect(message).not.toContain('{')
    }
  })

  it('TC-U-135: falls back to the status when the body has no known code', () => {
    expect(importProblemMessage(new ApiError(413, undefined))).toBe('File is larger than 1 MB')
    expect(importProblemMessage(new ApiError(415, undefined))).toBe('Use a .csv or .xlsx file')
  })

  it('TC-U-135: anything that is not an ApiError is generic', () => {
    expect(importProblemMessage(new TypeError('x'))).toBe('Something went wrong. Try again.')
  })
})

describe('buildErrorCsv', () => {
  const rows = [
    {
      rowNumber: 4,
      cells: { ticker: 'XYZ', market: 'JP', name: '' },
      errors: [
        { path: 'market', message: 'must be US or TH' },
        { path: 'name', message: 'required' },
      ],
    },
  ]

  it('TC-U-115: starts with a UTF-8 BOM, then row, the original columns and errors', () => {
    const csv = buildErrorCsv(rows)
    expect(csv.startsWith('﻿')).toBe(true)
    const [header, first, ...rest] = csv.slice(1).split('\r\n')
    expect(header).toBe('row,ticker,market,name,errors')
    expect(first).toBe('4,XYZ,JP,,market: must be US or TH; name: required')
    expect(rest).toEqual([''])
  })

  it('TC-U-115: quotes fields with commas, quotes and line breaks per RFC 4180', () => {
    const csv = buildErrorCsv([
      { rowNumber: 2, cells: { name: 'Berkshire "B", Inc.', note: 'a\nb' }, errors: [{ path: 'ticker', message: 'required' }] },
    ])
    expect(csv).toContain('2,"Berkshire ""B"", Inc.","a\nb",ticker: required')
  })

  it('TC-U-115: takes the union of the rows\' columns in first-seen order, leaving gaps empty', () => {
    const csv = buildErrorCsv([
      { rowNumber: 2, cells: { ticker: 'A' }, errors: [] },
      { rowNumber: 3, cells: { ticker: 'B', market: 'US' }, errors: [] },
    ])
    expect(csv.slice(1).split('\r\n').slice(0, 3)).toEqual(['row,ticker,market,errors', '2,A,,', '3,B,US,'])
  })

  it('TC-U-115: keeps Thai text and does not escape formulas (byte-for-byte)', () => {
    const csv = buildErrorCsv([{ rowNumber: 2, cells: { name: 'บมจ. ปตท.', ticker: '=1+1' }, errors: [] }])
    expect(csv).toContain('2,บมจ. ปตท.,=1+1,')
  })
})
