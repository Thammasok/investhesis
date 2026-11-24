import { DownloadIcon, Loader2Icon, TriangleAlertIcon } from 'lucide-react'
import { useState } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { ApiClient } from '@/lib/api-client'
import { saveFile } from '@/lib/save-file'
import { backupFileName } from './export-file-name'

const FILES = [
  { ext: 'json', label: 'Download JSON', variant: 'default' },
  { ext: 'csv', label: 'Download CSV', variant: 'outline' },
] as const

/**
 * The full backup (FR-015, FR-016): everything the investor owns, as JSON or CSV. The routes need the
 * bearer token, so each button fetches through the api client and saves the blob under the local date.
 */
export function BackupCard({ api }: { api: ApiClient }) {
  const [busy, setBusy] = useState<'json' | 'csv' | null>(null)
  const [failed, setFailed] = useState(false)

  async function download(ext: 'json' | 'csv') {
    setBusy(ext)
    setFailed(false)
    try {
      const file = await api.download(`/exports/backup.${ext}`)
      saveFile(file.blob, backupFileName(ext))
    } catch {
      setFailed(true)
    } finally {
      setBusy(null)
    }
  }

  return (
    <Card className="max-w-5xl">
      <CardHeader>
        <CardTitle>Export</CardTitle>
        <CardDescription>
          Download everything: each stock with its lenses and holding, your lists, and your concentration settings.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {FILES.map(({ ext, label, variant }) => (
            <Button
              key={ext}
              variant={variant}
              disabled={busy === ext}
              aria-busy={busy === ext ? 'true' : undefined}
              onClick={() => download(ext)}
            >
              {busy === ext ? (
                <Loader2Icon className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
              ) : (
                <DownloadIcon aria-hidden="true" />
              )}
              {label}
              {busy === ext ? <span aria-hidden="true">Preparing…</span> : null}
            </Button>
          ))}
        </div>
        {failed ? (
          <Alert role="alert">
            <TriangleAlertIcon className="text-destructive" aria-hidden="true" />
            <AlertDescription className="text-foreground">
              Couldn't download the backup. Check your connection and try again.
            </AlertDescription>
          </Alert>
        ) : null}
        <div className="space-y-1 text-sm text-muted-foreground">
          <p>JSON is the complete backup. CSV has one row per stock with its lists and holding, and can be imported again here.</p>
          <p>These files include your shares and costs. Keep them private.</p>
          <p>To export only some stocks, filter the Stocks page and use Export there.</p>
        </div>
      </CardContent>
    </Card>
  )
}
