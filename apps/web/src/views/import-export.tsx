import { useTranslation } from 'react-i18next'
import { UploadIcon } from 'lucide-react'
import { Link, Outlet } from 'react-router'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { BackupCard } from '@/features/exports/backup-card'
import type { ApiClient } from '@/lib/api-client'

/** `/import-export`: where Import (a dialog, in the outlet) starts and where the full backup is downloaded. */
export function createImportExportPage(api: ApiClient) {
  return function ImportExportPage() {
    const { t } = useTranslation()
    return (
      <section className="space-y-6">
        <PageHeader title={t('nav.importExport')} description={t('imports.pageDescription')} />
        <Card className="max-w-5xl">
          <CardHeader>
            <CardTitle>{t('imports.pageCardTitle')}</CardTitle>
            <CardDescription>{t('imports.pageCardDescription')}</CardDescription>
          </CardHeader>
          <div className="px-4">
            <Button asChild>
              <Link to="/import-export/import">
                <UploadIcon aria-hidden="true" />
                {t('imports.title')}
              </Link>
            </Button>
          </div>
        </Card>
        <BackupCard api={api} />
        <Outlet />
      </section>
    )
  }
}
