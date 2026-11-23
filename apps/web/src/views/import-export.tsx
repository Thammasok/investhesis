import { UploadIcon } from 'lucide-react'
import { Link, Outlet } from 'react-router'
import { PageHeader } from '@/components/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

/** `/import-export`: where Import (a dialog, in the outlet) starts and where Export will live. */
export function Component() {
  return (
    <section className="space-y-6">
      <PageHeader title="Import / export" description="Import stocks from CSV or Excel. Export of all your data comes later." />
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
      <Card className="max-w-5xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Export
            <Badge variant="outline">Coming later</Badge>
          </CardTitle>
          <CardDescription>Export all your data as CSV or JSON.</CardDescription>
        </CardHeader>
      </Card>
      <Outlet />
    </section>
  )
}
