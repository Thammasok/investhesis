import { DownloadIcon, Loader2Icon } from 'lucide-react'
import { useState } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import type { ApiClient } from '@/lib/api-client'
import { saveFile } from '@/lib/save-file'

const TEMPLATES = [
  { format: 'csv', label: 'CSV template' },
  { format: 'xlsx', label: 'Excel template' },
] as const

/**
 * "Start from the template". The template routes need the bearer token, which a plain
 * `<a download>` cannot send (test-cases G-2), so each button fetches through the api client and
 * saves the blob.
 */
export function TemplateLinks({ api }: { api: ApiClient }) {
  const [busy, setBusy] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  async function download(format: string) {
    setBusy(format)
    setFailed(false)
    try {
      const file = await api.download(`/imports/template.${format}`)
      saveFile(file.blob, file.filename)
    } catch {
      setFailed(true)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm">Start from the template:</span>
        {TEMPLATES.map(({ format, label }) => (
          <Button key={format} variant="outline" size="sm" disabled={busy !== null} onClick={() => download(format)}>
            {busy === format ? <Loader2Icon className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <DownloadIcon aria-hidden="true" />}
            {label}
          </Button>
        ))}
      </div>
      {failed ? (
        <Alert variant="destructive">
          <AlertDescription>Could not download the template. Try again.</AlertDescription>
        </Alert>
      ) : null}
    </div>
  )
}
