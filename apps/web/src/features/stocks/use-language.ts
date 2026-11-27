import type { Language } from '@investhesis/domain'
import { useTranslation } from 'react-i18next'

/** The language the interface is in now, for components that format by language. */
export function useLanguage(): Language {
  const { i18n } = useTranslation()
  return i18n.language === 'th' ? 'th' : 'en'
}
