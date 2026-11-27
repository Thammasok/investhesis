import { useEffect, useRef } from 'react'
import { useFetcher } from 'react-router'
import { toast } from 'sonner'
import type { Stock } from '@/features/stocks/types'
import { i18n } from '@/i18n/i18n'
import type { ListActionResult } from './lists-data'

/**
 * Add and remove stocks on `/lists/:id` through the route action. Each result is reported once: a toast,
 * with Undo after a removal. The router revalidates the loader, so the table and count follow.
 */
export function useMembership(listName: string) {
  const fetcher = useFetcher<ListActionResult>()
  const handled = useRef<unknown>(null)

  const submit = (intent: string, stock: Pick<Stock, 'id' | 'ticker'>) =>
    fetcher.submit({ intent, stockId: stock.id, ticker: stock.ticker, listName }, { method: 'post' })

  useEffect(() => {
    const result = fetcher.data
    if (!result || handled.current === result) return
    if (result.intent === 'create' || result.intent === 'rename' || result.intent === 'delete') return
    handled.current = result
    if (!result.ok) toast.error(result.message)
    else if (result.intent === 'remove-stock')
      toast(i18n.t('lists.toast.removed', { ticker: result.ticker, name: listName }), {
        action: {
          label: i18n.t('common.undo'),
          onClick: () =>
            fetcher.submit(
              { intent: 'undo-remove', stockId: result.stockId, ticker: result.ticker, listName },
              { method: 'post' },
            ),
        },
      })
    else if (result.intent === 'add-stock') toast.success(i18n.t('lists.toast.added', { ticker: result.ticker, name: listName }))
  }, [fetcher, listName])

  return {
    busy: fetcher.state !== 'idle',
    add: (stock: Stock) => submit('add-stock', stock),
    remove: (stock: Stock) => submit('remove-stock', stock),
  }
}
