import { useLoaderData, useSearchParams } from 'react-router'
import { PageHeader } from '@/components/page-header'
import { Badge } from '@/components/ui/badge'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ImportWizard } from '@/features/imports/import-wizard'
import type { ImportPageData } from '@/features/imports/imports-data'
import type { ApiClient } from '@/lib/api-client'

/** The page component; the wizard calls the API itself, so the route hands it the client. */
export function createImportExportPage(api: ApiClient) {
  return function ImportExportPage() {
    const { lists } = useLoaderData() as ImportPageData
    const [params] = useSearchParams()
    return (
      <section className="space-y-6">
        <PageHeader title="Import / export" description="Import stocks from CSV or Excel. Export of all your data comes later." />
        <ImportWizard api={api} lists={lists} initialListId={params.get('listId') ?? undefined} />
        <Card className="max-w-5xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Export
              <Badge variant="outline">Coming later</Badge>
            </CardTitle>
            <CardDescription>Export all your data as CSV or JSON.</CardDescription>
          </CardHeader>
        </Card>
      </section>
    )
  }
}
