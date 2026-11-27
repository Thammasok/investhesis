import { redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from 'react-router'
import { toast } from 'sonner'
import { i18n } from '@/i18n/i18n'
import { ApiError, type ApiClient } from '@/lib/api-client'
import { changeThesis, isThesisIntent, type ThesisActionResult } from '@/features/theses/thesis-actions'
import type { Thesis } from '@/features/theses/types'
import { describeProblem, type FieldProblemLike } from './stock-form-model'
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

export type StockDetailData = {
  lists: ListSummary[]
  /** Not awaited: the page shows the stock first and the Thesis section streams in (thesis-log ADR-004). */
  theses: Promise<Thesis[]>
}

/**
 * Loader of the detail page: the lists the stock can be added to, awaited, and the thesis entries, not.
 * The stock itself comes from the parent route. A failed entries call is the Thesis section's error, so it
 * must not reject the loader.
 */
export const createStockDetailLoader =
  (api: ApiClient) =>
  async ({ params }: LoaderFunctionArgs): Promise<StockDetailData> => {
    const theses = api
      .get<{ items: Thesis[] }>(`/stocks/${encodeURIComponent(params.id ?? '')}/theses`)
      .then((r) => r.items)
    // The page reads it later through `Await`; until then a rejection must not count as unhandled.
    theses.catch(() => undefined)
    const lists = await api.get<{ items: ListSummary[] }>('/lists')
    return { lists: lists.items, theses }
  }

type Intent = 'delete' | 'add-to-list' | 'remove-from-list' | 'undo-remove'
/** What `set-holding` and `clear-holding` answer. `field` names the input a 400 points at. */
export type HoldingActionResult =
  | { intent: 'set-holding' | 'clear-holding'; ok: true; ticker: string; undo: boolean }
  | { intent: 'set-holding' | 'clear-holding'; ok: false; message: string; undo: boolean; field?: 'shares' | 'averageCost' }

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
  async ({ request, params }: ActionFunctionArgs): Promise<DetailActionResult | HoldingActionResult | ThesisActionResult | Response> => {
    const form = await request.formData()
    const intentName = text(form, 'intent')
    if (intentName === 'set-holding' || intentName === 'clear-holding')
      return changeHolding(api, params.id ?? '', intentName, form)
    if (isThesisIntent(intentName)) return changeThesis(api, params.id ?? '', intentName, form)
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
          toast.success(i18n.t('stocks.actions.deleted', { ticker }))
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

/** PATCHes `{ holding }`: the whole holding (empty fields are `null`), or `null` to stop holding. */
async function changeHolding(
  api: ApiClient,
  id: string,
  intent: 'set-holding' | 'clear-holding',
  form: FormData,
): Promise<HoldingActionResult> {
  const ticker = text(form, 'ticker')
  const undo = text(form, 'undo') === '1'
  const holding =
    intent === 'clear-holding'
      ? null
      : {
          shares: text(form, 'shares') || null,
          averageCost: text(form, 'averageCost') || null,
          costCurrency: text(form, 'costCurrency'),
        }
  try {
    await api.patch(`/stocks/${encodeURIComponent(id)}`, { body: { holding } })
    return { intent, ok: true, ticker, undo }
  } catch (error) {
    if (!(error instanceof ApiError) || error.status === 401) throw error
    if (error.status === 404) return { intent, ok: false, undo, message: i18n.t('holdings.stockGone') }
    if (error.status === 400) {
      const problem = error.errors.find((e) => e.path === 'holding.shares' || e.path === 'holding.averageCost')
      if (problem) {
        const field = problem.path === 'holding.shares' ? 'shares' : 'averageCost'
        const label = field === 'shares' ? 'holdingShares' : 'holdingAverageCost'
        return { intent, ok: false, undo, field, message: describeProblem(label, problem as FieldProblemLike) }
      }
    }
    return { intent, ok: false, undo, message: i18n.t('holdings.saveFailed') }
  }
}

function failureMessage(intent: Intent, error: ApiError, listName: string, ticker: string): string {
  switch (intent) {
    case 'delete':
      return i18n.t('stocks.actions.deleteFailed', { ticker })
    case 'undo-remove':
      return i18n.t('stocks.actions.undoFailed')
    case 'add-to-list':
      if (error.status === 409) return i18n.t('stocks.actions.alreadyIn', { name: listName })
      if (error.status === 404) return i18n.t('stocks.actions.listGone', { name: listName })
      return i18n.t('stocks.actions.addFailed', { name: listName })
    case 'remove-from-list':
      if (error.status === 404) return i18n.t('stocks.actions.alreadyRemoved', { name: listName })
      return i18n.t('stocks.actions.removeFailed', { name: listName })
  }
}

export type StockNewData = { lists: ListSummary[] }

/** Loader of `/stocks/new`: the lists the new stock can be put in. */
export const createStockNewLoader = (api: ApiClient) => async (): Promise<StockNewData> => {
  const lists = await api.get<{ items: ListSummary[] }>('/lists')
  return { lists: lists.items }
}

/** What a save that did not succeed tells the form; success redirects instead. */
export type StockFormResult = {
  ok: false
  status: number
  code: string
  errors: { path: string; message: string }[]
  existingStockId?: string
}

function failure(error: ApiError): StockFormResult {
  return { ok: false, status: error.status, code: error.code, errors: error.errors, existingStockId: error.existingStockId }
}

/**
 * Action of `/stocks/new`. The form posts the finished body as JSON; success toasts and opens the new
 * stock. Problems the user can act on (400, 404, 409, 5xx, no network) come back as data for the form;
 * a 401 means the session ended, which the API client has already handled.
 */
export const createStockCreateAction =
  (api: ApiClient) =>
  async ({ request }: ActionFunctionArgs): Promise<StockFormResult | Response> => {
    try {
      const stock = await api.post<Stock>('/stocks', { body: await request.json() })
      toast.success(i18n.t('stocks.actions.added', { ticker: stock.ticker }))
      return redirect(`/stocks/${encodeURIComponent(stock.id)}`)
    } catch (error) {
      if (!(error instanceof ApiError) || error.status === 401) throw error
      return failure(error)
    }
  }

/** Action of `/stocks/:id/edit`: PATCHes the changed fields the form sends. */
export const createStockUpdateAction =
  (api: ApiClient) =>
  async ({ request, params }: ActionFunctionArgs): Promise<StockFormResult | Response> => {
    try {
      const stock = await api.patch<Stock>(`/stocks/${encodeURIComponent(params.id ?? '')}`, { body: await request.json() })
      toast.success(i18n.t('stocks.actions.updated', { ticker: stock.ticker }))
      return redirect(`/stocks/${encodeURIComponent(stock.id)}`)
    } catch (error) {
      if (!(error instanceof ApiError) || error.status === 401) throw error
      return failure(error)
    }
  }
