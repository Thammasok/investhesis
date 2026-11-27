// `collate.ts` and `describe-issue.ts` import values from @investhesis/domain (Thai messages and
// labels, zod schemas). Import them by path where needed, so this barrel does not drag the domain
// into every chunk that only wants `useT`.
export { detect, LANGUAGE_STORAGE_KEY } from './detect.ts'
export { getLanguage, init, resetLanguage, setLanguage, subscribe } from './store.ts'
export { t, translate } from './t.ts'
export type { TFunction } from './t.ts'
export { useLanguage, useT } from './use-i18n.ts'
export { Rich } from './rich.tsx'
export { formatDate, formatTimestamp } from './format-date.ts'
export type { CatalogueKey } from './catalogue-types.ts'
