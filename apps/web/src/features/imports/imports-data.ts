import type { ListSummary } from '@/features/stocks/types'
import type { ApiClient } from '@/lib/api-client'

export type ImportPageData = { lists: ListSummary[] }

/** Loader of `/import-export`: the lists for "Add to list". */
export const createImportLoader = (api: ApiClient) => async (): Promise<ImportPageData> => ({
  lists: (await api.get<{ items: ListSummary[] }>('/lists')).items,
})
