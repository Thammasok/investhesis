import { LineChartIcon, PlusIcon, UploadIcon } from 'lucide-react'
import { Link, useLoaderData } from 'react-router'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { StockTable } from '@/features/stocks/components/stock-table'
import { countLabel } from '@/features/stocks/format'
import type { StocksPageData } from '@/features/stocks/stocks-data'

export function Component() {
  const { stocks, lists } = useLoaderData() as StocksPageData

  if (stocks.length === 0) {
    return (
      <section className="space-y-6">
        <PageHeader title="Stocks" />
        <Card className="items-center gap-3 py-12 text-center">
          <LineChartIcon className="size-8 text-muted-foreground" aria-hidden="true" />
          <h2 className="font-heading text-lg font-semibold">No stocks yet</h2>
          <p className="text-sm text-muted-foreground">Add your first stock, or import a CSV or Excel file.</p>
          <div className="flex flex-wrap justify-center gap-2">
            <Button asChild>
              <Link to="/stocks/new">
                <PlusIcon aria-hidden="true" />
                Add stock
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to="/import-export">
                <UploadIcon aria-hidden="true" />
                Import from file
              </Link>
            </Button>
          </div>
        </Card>
      </section>
    )
  }

  return (
    <section className="space-y-6">
      <PageHeader
        title="Stocks"
        description={countLabel(stocks.length, 'stock')}
        actions={
          <>
            <Button variant="outline" className="w-full sm:w-auto" asChild>
              <Link to="/import-export">
                <UploadIcon aria-hidden="true" />
                Import
              </Link>
            </Button>
            <Button className="w-full sm:w-auto" asChild>
              <Link to="/stocks/new">
                <PlusIcon aria-hidden="true" />
                Add stock
              </Link>
            </Button>
          </>
        }
      />
      <StockTable stocks={stocks} lists={lists} />
    </section>
  )
}
