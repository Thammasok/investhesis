export type Part = { name: string; value: string | Buffer; filename?: string; contentType?: string }

/** Builds a multipart/form-data body for app.inject. */
export function multipart(parts: Part[]): { payload: Buffer; headers: { 'content-type': string } } {
  const boundary = '----investhesis-test-boundary'
  const chunks: Buffer[] = []
  for (const p of parts) {
    const disposition = `form-data; name="${p.name}"${p.filename !== undefined ? `; filename="${p.filename}"` : ''}`
    const type = p.contentType ? `\r\nContent-Type: ${p.contentType}` : p.filename !== undefined ? '\r\nContent-Type: application/octet-stream' : ''
    chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: ${disposition}${type}\r\n\r\n`), Buffer.from(p.value), Buffer.from('\r\n'))
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`))
  return { payload: Buffer.concat(chunks), headers: { 'content-type': `multipart/form-data; boundary=${boundary}` } }
}

export const filePart = (value: string | Buffer, filename: string): Part => ({ name: 'file', value, filename })
