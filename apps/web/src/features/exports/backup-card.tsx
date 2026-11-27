import { DownloadIcon, Loader2Icon, TriangleAlertIcon } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { ApiClient } from '@/lib/api-client'
import { saveFile } from '@/lib/save-file'
import { backupFileName } from './export-file-name'

const FILES = [
  { ext: 'json', label: 'exports.backup.downloadJson', variant: 'default' },
  { ext: 'csv', label: 'exports.backup.downloadCsv', variant: 'outline' },
] as const

/**
 * The full backup (FR-015, FR-016): everything the investor owns, as JSON or CSV. The routes need the
 * bearer token, so each button fetches through the api client and saves the blob under the local date.
 */
export function BackupCard({ api }: { api: ApiClient }) {
  const { t } = useTranslation()
  const [busy, setBusy] = useState<'json' | 'csv' | null>(null)
  const [failed, setFailed] = useState(false)

  async function download(ext: 'json' | 'csv') {
    if (busy === ext) return // aria-disabled, not disabled: a disabled button would drop the keyboard focus
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
        <CardTitle>{t('exports.backup.title')}</CardTitle>
        <CardDescription>
          {t('exports.backup.description')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {FILES.map(({ ext, label, variant }) => (
            <Button
              key={ext}
              variant={variant}
              aria-disabled={busy === ext ? 'true' : undefined}
              aria-busy={busy === ext ? 'true' : undefined}
              onClick={() => download(ext)}
            >
              {busy === ext ? (
                <Loader2Icon className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
              ) : (
                <DownloadIcon aria-hidden="true" />
              )}
              {t(label)}
              {busy === ext ? <span aria-hidden="true">{t('exports.backup.preparing')}</span> : null}
            </Button>
          ))}
        </div>
        {failed ? (
          <Alert role="alert">
            <TriangleAlertIcon className="text-destructive" aria-hidden="true" />
            <AlertDescription className="text-foreground">
              {t('exports.backup.failed')}
            </AlertDescription>
          </Alert>
        ) : null}
        <div className="space-y-1 text-sm text-muted-foreground">
          <p>{t('exports.backup.noteFormats')}</p>
          <p>{t('exports.backup.notePrivate')}</p>
          <p>{t('exports.backup.noteSome')}</p>
        </div>
      </CardContent>
    </Card>
  )
}
