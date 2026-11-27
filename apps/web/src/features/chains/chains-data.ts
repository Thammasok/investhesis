import type { ActionFunctionArgs } from 'react-router'
import { toast } from 'sonner'
import { readPortfolio, type Portfolio } from '@/features/stock-filters/portfolio'
import { i18n } from '@/i18n/i18n'
import { stocksLabel } from './chains-model'
import { ApiError, type ApiClient } from '@/lib/api-client'

export type ChainsData = Portfolio

/** Loader of `/chains`: the three reads of `/concentration`, in parallel. Any failure is the route error page. */
export const createChainsLoader = (api: ApiClient) => (): Promise<ChainsData> => readPortfolio(api)

/** What the rename dialog gets back: success, a merge to confirm, a chain that is gone, or a problem to show. */
export type ChainsActionResult =
  | { ok: true; name: string; changed: number; merged: boolean }
  | { ok: false; needsMerge: { name: string; count: number } }
  | { ok: false; gone: true }
  | { ok: false; message: string; errors?: { path: string; message: string; rule?: string; params?: Record<string, unknown> }[] }

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null

/**
 * Action of `/chains`. The one intent, `rename-chain`, is submitted as JSON
 * `{ intent, from, to, merge, total? }` and sent to `POST /chains/rename`. `total` is the number of
 * stocks the dialog showed on its merge button; it is not sent on, and the merge toast reports it
 * (`changed` leaves out stocks that already carried the name exactly). Problems the user can act on
 * come back as data; success toasts here, and the revalidated loader regroups the page.
 */
export const createChainsAction =
  (api: ApiClient) =>
  async ({ request }: ActionFunctionArgs): Promise<ChainsActionResult> => {
    const body: unknown = await request.json().catch(() => null)
    if (!isRecord(body) || body.intent !== 'rename-chain') return { ok: false, message: i18n.t('chains.action.unknown') }
    const send = { from: body.from, to: body.to, merge: body.merge === true }
    try {
      const answer = await api.post<{ name: string; changed: number; merged: boolean }>('/chains/rename', { body: send })
      const total = typeof body.total === 'number' ? body.total : answer.changed
      toast.success(
        answer.merged
          ? i18n.t('chains.action.merged', { name: answer.name, stocks: stocksLabel(total) })
          : i18n.t('chains.action.renamed', { name: answer.name, stocks: stocksLabel(answer.changed) }),
      )
      return { ok: true, name: answer.name, changed: answer.changed, merged: answer.merged }
    } catch (error) {
      if (!(error instanceof ApiError)) throw error
      if (error.status === 404) return { ok: false, gone: true }
      if (error.status === 409 && error.code === 'chain_exists' && isRecord(error.body)) {
        const { existingName, existingCount } = error.body
        if (typeof existingName === 'string' && typeof existingCount === 'number')
          return { ok: false, needsMerge: { name: existingName, count: existingCount } }
      }
      if (error.status === 400 && error.errors.length > 0) return { ok: false, message: i18n.t('chains.action.failed'), errors: error.errors }
      return { ok: false, message: i18n.t('chains.action.failed') }
    }
  }
