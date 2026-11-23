import type { ActionFunctionArgs } from 'react-router'
import { toast } from 'sonner'
import type { ListSummary, Stock } from '@/features/stocks/types'
import { ApiError, type ApiClient } from '@/lib/api-client'
import type { Settings } from './concentration-model'

export type ConcentrationData = { stocks: Stock[]; lists: ListSummary[]; settings: Settings }

/** Loader of `/concentration`: the three reads run in parallel. Any failure is the route error page. */
export const createConcentrationLoader = (api: ApiClient) => async (): Promise<ConcentrationData> => {
  const [stocks, lists, settings] = await Promise.all([
    api.get<{ items: Stock[] }>('/stocks'),
    api.get<{ items: ListSummary[] }>('/lists'),
    api.get<Settings>('/settings'),
  ])
  return { stocks: stocks.items, lists: lists.items, settings }
}

/** Fields the settings form may send; the dialog sends only the changed ones. */
export type SettingsChange = { concentrationThreshold?: number; usdThbRate?: string | null }

export type ConcentrationActionResult =
  | { intent: 'save-settings'; ok: true }
  | { intent: string; ok: false; message: string; errors?: { path: string; message: string }[] }

/**
 * Action of `/concentration`. The one intent, `save-settings`, is submitted as JSON
 * (`{ intent: 'save-settings', patch }`, `encType: 'application/json'`) and sent to `PATCH /settings`.
 * Problems the user can act on come back as data; success toasts here, and the revalidated loader regroups the page.
 */
export const createConcentrationAction =
  (api: ApiClient) =>
  async ({ request }: ActionFunctionArgs): Promise<ConcentrationActionResult> => {
    const body: unknown = await request.json().catch(() => null)
    const intent = typeof body === 'object' && body !== null && 'intent' in body ? String(body.intent) : ''
    if (intent !== 'save-settings') return { intent, ok: false, message: 'Unknown action.' }
    const patch = (body as { patch?: SettingsChange }).patch ?? {}
    try {
      await api.patch('/settings', { body: patch })
      toast.success('Settings saved')
      return { intent, ok: true }
    } catch (error) {
      if (!(error instanceof ApiError)) throw error
      if (error.status === 400 && error.errors.length > 0)
        return { intent, ok: false, message: "Some values aren't valid.", errors: error.errors }
      return { intent, ok: false, message: "Couldn't save the settings. Try again." }
    }
  }
