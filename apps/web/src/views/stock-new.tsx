import { useTranslation } from 'react-i18next'
import { useLoaderData } from 'react-router'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { StockForm } from '@/features/stocks/components/stock-form'
import type { StockNewData } from '@/features/stocks/stocks-data'
import { useRouteDialogClose } from '@/hooks/use-route-dialog-close'

/** `/stocks/new`: the Add stock form as a dialog over the Stocks page (rendered by its `<Outlet />`). */
export function Component() {
  const { t } = useTranslation()
  const { lists } = useLoaderData() as StockNewData
  const close = useRouteDialogClose('/stocks')
  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : close())}>
      <DialogContent className="flex max-h-[90dvh] flex-col gap-4 overflow-hidden sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{t('stocks.newStock.title')}</DialogTitle>
          <DialogDescription>{t('stocks.newStock.description')}</DialogDescription>
        </DialogHeader>
        <div className="-mx-4 min-h-0 flex-1 overflow-y-auto px-4">
          <StockForm mode="create" lists={lists} inDialog onCancel={close} />
        </div>
      </DialogContent>
    </Dialog>
  )
}
