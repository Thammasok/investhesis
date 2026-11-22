import { useLoaderData } from 'react-router'
import { PageHeader } from '@/components/page-header'
import { StockForm } from '@/features/stocks/components/stock-form'
import type { StockNewData } from '@/features/stocks/stocks-data'

export function Component() {
  const { lists } = useLoaderData() as StockNewData
  return (
    <section className="space-y-6">
      <PageHeader title="Add stock" description="Identity, the ten lenses and the lists for a new stock." />
      <StockForm mode="create" lists={lists} />
    </section>
  )
}
