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
    return (
      <section className="space-y-6">
        <PageHeader title="Import / export" description="Import stocks from CSV or Excel, or download all your data." />
        <Card className="max-w-5xl">
          <CardHeader>
            <CardTitle>Import</CardTitle>
            <CardDescription>Add many stocks at once from a CSV or Excel file.</CardDescription>
          </CardHeader>
          <div className="px-4">
            <Button asChild>
              <Link to="/import-export/import">
                <UploadIcon aria-hidden="true" />
                Import stocks
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
