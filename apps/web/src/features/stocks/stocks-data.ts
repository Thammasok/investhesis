import { redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from 'react-router'
import { toast } from 'sonner'
import { ApiError, type ApiClient } from '@/lib/api-client'
import type { ListSummary, Stock } from './types'

export type StocksPageData = { stocks: Stock[]; lists: ListSummary[] }

/** Loader of `/stocks`: every stock and every list (for the Lists column). */
export const createStocksLoader = (api: ApiClient) => async (): Promise<StocksPageData> => {
  const [stocks, lists] = await Promise.all([
    api.get<{ items: Stock[] }>('/stocks'),
    api.get<{ items: ListSummary[] }>('/lists'),
  ])
  return { stocks: stocks.items, lists: lists.items }
}

/** Loader of `/stocks/:id` (the route that gives the breadcrumb its ticker). A 404 is the not-found page. */
export const createStockLoader =
  (api: ApiClient) =>
  ({ params }: LoaderFunctionArgs): Promise<Stock> =>
    api.get<Stock>(`/stocks/${encodeURIComponent(params.id ?? '')}`)

export type StockDetailData = { lists: ListSummary[] }

/** Loader of the detail page: the lists the stock can be added to. The stock itself comes from the parent route. */
export const createStockDetailLoader = (api: ApiClient) => async (): Promise<StockDetailData> => {
  const lists = await api.get<{ items: ListSummary[] }>('/lists')
  return { lists: lists.items }
}

type Intent = 'delete' | 'add-to-list' | 'remove-from-list' | 'undo-remove'
export type DetailActionResult =
  | { intent: Exclude<Intent, 'delete'>; ok: true; listId: string; listName: string }
  | { intent: Intent; ok: false; message: string }

const text = (form: FormData, key: string) => String(form.get(key) ?? '')
const isStatus = (error: unknown, status: number) => error instanceof ApiError && error.status === status

/**
 * Action of the detail page, one `intent` per form: `delete`, `add-to-list`, `remove-from-list` and
 * `undo-remove` (re-adds a removed stock; "already there" counts as done). The router revalidates the
 * loaders after it returns, so the page shows the new membership. Problems the user can act on come
 * back as `{ ok: false, message }`; anything else goes to the error boundary.
 */
export const createStockDetailAction =
  (api: ApiClient) =>
  async ({ request, params }: ActionFunctionArgs): Promise<DetailActionResult | Response> => {
    const form = await request.formData()
    const stockId = encodeURIComponent(params.id ?? '')
    const listId = text(form, 'listId')
    const listName = text(form, 'listName')
    const listPath = `/lists/${encodeURIComponent(listId)}`
    const intent = text(form, 'intent') as Intent
    try {
      switch (intent) {
        case 'delete': {
          const ticker = text(form, 'ticker')
          // Already gone (deleted in another tab) is the outcome the user wanted.
          await api.delete(`/stocks/${stockId}`).catch((e: unknown) => (isStatus(e, 404) ? undefined : Promise.reject(e)))
          toast.success(`${ticker} deleted`)
          return redirect('/stocks')
        }
        case 'add-to-list':
          await api.post(`${listPath}/stocks`, { body: { stockId: params.id } })
          return { intent, ok: true, listId, listName }
        case 'undo-remove':
          await api
            .post(`${listPath}/stocks`, { body: { stockId: params.id } })
            .catch((e: unknown) => (isStatus(e, 409) ? undefined : Promise.reject(e)))
          return { intent, ok: true, listId, listName }
        case 'remove-from-list':
          await api.delete(`${listPath}/stocks/${stockId}`)
          return { intent, ok: true, listId, listName }
        default:
          throw new Response('Unknown action', { status: 400 })
      }
    } catch (error) {
      if (!(error instanceof ApiError)) throw error
      return { intent, ok: false, message: failureMessage(intent, error, listName, text(form, 'ticker')) }
    }
  }

function failureMessage(intent: Intent, error: ApiError, listName: string, ticker: string): string {
  switch (intent) {
    case 'delete':
      return `Couldn't delete ${ticker}. Try again.`
    case 'undo-remove':
      return "Couldn't undo. Add the stock to the list again."
    case 'add-to-list':
      if (error.status === 409) return `Already in ${listName}. The page was refreshed.`
      if (error.status === 404) return `${listName} no longer exists.`
      return `Couldn't add to ${listName}. Try again.`
    case 'remove-from-list':
      if (error.status === 404) return `Already removed from ${listName}. The page was refreshed.`
      return `Couldn't remove from ${listName}. Try again.`
  }
}
