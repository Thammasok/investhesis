import { DownloadIcon, Loader2Icon } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { getLanguage } from '@/i18n/language'
import type { ApiClient } from '@/lib/api-client'
import { saveFile } from '@/lib/save-file'

const TEMPLATES = ['csv', 'xlsx'] as const

/**
 * "Start from the template". The template routes need the bearer token, which a plain
 * `<a download>` cannot send (test-cases G-2), so each button fetches through the api client and
 * saves the blob.
 */
export function TemplateLinks({ api }: { api: ApiClient }) {
  const { t } = useTranslation()
  const [busy, setBusy] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  async function download(format: (typeof TEMPLATES)[number]) {
    setBusy(format)
    setFailed(false)
    try {
      const file = await api.download(format === 'xlsx' ? `/imports/template.xlsx?lang=${getLanguage()}` : '/imports/template.csv')
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
        <span className="text-sm">{t('imports.templates.lead')}</span>
        {TEMPLATES.map((format) => (
          <Button key={format} variant="outline" size="sm" disabled={busy !== null} onClick={() => download(format)}>
            {busy === format ? <Loader2Icon className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <DownloadIcon aria-hidden="true" />}
            {t(`imports.templates.${format}`)}
          </Button>
        ))}
      </div>
      <p className="text-sm text-muted-foreground">{t('imports.templates.help')}</p>
      {failed ? (
        <Alert variant="destructive">
          <AlertDescription>{t('imports.templates.failed')}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  )
}
