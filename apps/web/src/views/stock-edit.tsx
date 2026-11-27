import { useTranslation } from 'react-i18next'
import { useRouteLoaderData } from 'react-router'
import { PageHeader } from '@/components/page-header'
import { StockForm } from '@/features/stocks/components/stock-form'
import type { Stock } from '@/features/stocks/types'
import { STOCK_ROUTE_ID } from '@/routers/route-ids'

export function Component() {
  const { t } = useTranslation()
  const stock = useRouteLoaderData(STOCK_ROUTE_ID) as Stock
  return (
    <section className="space-y-6">
      <PageHeader title={t('stocks.editStock.title', { ticker: stock.ticker })} description={t('stocks.editStock.description')} />
      <StockForm key={stock.id} mode="edit" stock={stock} />
    </section>
  )
}
