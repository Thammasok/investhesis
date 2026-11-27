import { redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from 'react-router'
import { toast } from 'sonner'
import type { Stock, ListSummary } from '@/features/stocks/types'
import { ApiError, type ApiClient } from '@/lib/api-client'
import { checkListName } from './list-name'

/** Loader of `/lists`. */
export const createListsLoader = (api: ApiClient) => async (): Promise<{ lists: ListSummary[] }> => ({
  lists: (await api.get<{ items: ListSummary[] }>('/lists')).items,
})

export type ListPageData = {
  list: ListSummary
  /** The stocks in the list. */
  members: Stock[]
  /** Saved stocks that are not in the list yet (the Add stock picker). */
  candidates: Stock[]
  /** Every list, to name the lists a stock is in (the `lists` column of the export). */
  lists: ListSummary[]
}

/** Loader of `/lists/:id`. A 404 on the list is the not-found page. Membership comes from each stock's `listIds`. */
export const createListLoader =
  (api: ApiClient) =>
  async ({ params }: LoaderFunctionArgs): Promise<ListPageData> => {
    const id = params.id ?? ''
    const [list, stocks, lists] = await Promise.all([
      api.get<ListSummary>(`/lists/${encodeURIComponent(id)}`),
      api.get<{ items: Stock[] }>('/stocks'),
      api.get<{ items: ListSummary[] }>('/lists'),
    ])
    return {
      list,
      lists: lists.items,
      members: stocks.items.filter((s) => s.listIds.includes(id)),
      candidates: stocks.items.filter((s) => !s.listIds.includes(id)),
    }
  }

type NameIntent = 'create' | 'rename' | 'delete'
type MembershipIntent = 'add-stock' | 'remove-stock' | 'undo-remove'
export type ListIntent = NameIntent | MembershipIntent

/** What the actions return; problems the user can act on come back as data, anything else goes to the error boundary. */
export type ListActionResult =
  | { intent: NameIntent; ok: true }
  | { intent: NameIntent; ok: false; message: string; field?: 'name' }
  | { intent: MembershipIntent; ok: true; stockId: string; ticker: string }
  | { intent: MembershipIntent; ok: false; message: string }

const text = (form: FormData, key: string) => String(form.get(key) ?? '')
const isStatus = (error: unknown, status: number) => error instanceof ApiError && error.status === status
const NAME_TAKEN = 'A list with this name already exists.'

/**
 * Create, rename and delete, shared by both pages: `/lists` takes the list from the form's `listId`,
 * `/lists/:id` from the route. Success toasts here so they survive a dialog that closed meanwhile.
 */
async function changeList(
  api: ApiClient,
  intent: NameIntent,
  form: FormData,
  listId: string,
  afterDelete?: () => Response,
): Promise<ListActionResult | Response> {
  const path = `/lists/${encodeURIComponent(listId)}`
  const listName = text(form, 'listName')
  try {
    if (intent === 'delete') {
      // Already gone (deleted in another tab) is the outcome the user wanted.
      await api.delete(path).catch((e: unknown) => (isStatus(e, 404) ? undefined : Promise.reject(e)))
      toast.success(`${listName} deleted`)
      return afterDelete ? afterDelete() : { intent, ok: true }
    }
    const checked = checkListName(text(form, 'name'))
    if (!checked.ok) return { intent, ok: false, message: checked.message, field: 'name' }
    if (intent === 'create') await api.post('/lists', { body: { name: checked.name } })
    else await api.patch(path, { body: { name: checked.name } })
    toast.success(intent === 'create' ? 'List created' : 'List renamed')
    return { intent, ok: true }
  } catch (error) {
    if (!(error instanceof ApiError)) throw error
    if (error.status === 409) return { intent, ok: false, message: NAME_TAKEN, field: 'name' }
    const named = error.errors.find((e) => e.path === 'name')
    if (error.status === 400 && named) return { intent, ok: false, message: named.message, field: 'name' }
    if (error.status === 404) return { intent, ok: false, message: 'This list no longer exists. The page was refreshed.' }
    const message =
      intent === 'create'
        ? "Couldn't create the list. Try again."
        : intent === 'rename'
          ? "Couldn't rename the list. Try again."
          : `Couldn't delete ${listName}. Try again.`
    return { intent, ok: false, message }
  }
}

/** Action of `/lists`: `create`, `rename` and `delete`, one `intent` per form. */
export const createListsAction =
  (api: ApiClient) =>
  async ({ request }: ActionFunctionArgs): Promise<ListActionResult | Response> => {
    const form = await request.formData()
    const intent = text(form, 'intent')
    if (intent !== 'create' && intent !== 'rename' && intent !== 'delete')
      throw new Response('Unknown action', { status: 400 })
    return changeList(api, intent, form, text(form, 'listId'))
  }

/**
 * Action of `/lists/:id`: `rename`, `delete` (then back to `/lists`), `add-stock`, `remove-stock` and
 * `undo-remove` (re-adds; "already there" counts as done).
 */
export const createListAction =
  (api: ApiClient) =>
  async ({ request, params }: ActionFunctionArgs): Promise<ListActionResult | Response> => {
    const form = await request.formData()
    const intent = text(form, 'intent') as ListIntent
    const listId = params.id ?? ''
    if (intent === 'rename') return changeList(api, intent, form, listId)
    if (intent === 'delete') return changeList(api, intent, form, listId, () => redirect('/lists'))

    if (intent !== 'add-stock' && intent !== 'remove-stock' && intent !== 'undo-remove')
      throw new Response('Unknown action', { status: 400 })
    const stockId = text(form, 'stockId')
    const ticker = text(form, 'ticker')
    const listName = text(form, 'listName')
    const path = `/lists/${encodeURIComponent(listId)}/stocks`
    try {
      switch (intent) {
        case 'add-stock':
          await api.post(path, { body: { stockId } })
          break
        case 'undo-remove':
          await api.post(path, { body: { stockId } }).catch((e: unknown) => (isStatus(e, 409) ? undefined : Promise.reject(e)))
          break
        case 'remove-stock':
          await api.delete(`${path}/${encodeURIComponent(stockId)}`)
          break
      }
      return { intent, ok: true, stockId, ticker }
    } catch (error) {
      if (!(error instanceof ApiError)) throw error
      return { intent, ok: false, message: membershipFailure(intent, error, ticker, listName) }
    }
  }

function membershipFailure(intent: MembershipIntent, error: ApiError, ticker: string, listName: string): string {
  switch (intent) {
    case 'undo-remove':
      return `Couldn't undo. Add ${ticker} to the list again.`
    case 'add-stock':
      if (error.status === 409) return `${ticker} is already in ${listName}. The page was refreshed.`
      if (error.status === 404) return `${ticker} or ${listName} no longer exists. The page was refreshed.`
      return `Couldn't add ${ticker} to ${listName}. Try again.`
    case 'remove-stock':
      if (error.status === 404) return `${ticker} is already removed from ${listName}. The page was refreshed.`
      return `Couldn't remove ${ticker} from ${listName}. Try again.`
  }
}
