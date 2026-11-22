/** Saves a blob through a temporary link (an object URL), then releases the URL. */
export function saveFile(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.hidden = true
  document.body.append(link)
  link.click()
  link.remove()
  // Not at once: some browsers start the download after the click handler returns.
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
