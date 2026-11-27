import type { Language } from '@investhesis/domain'
import { toast } from 'sonner'
import { i18n } from '@/i18n/i18n'
import { LANGUAGE_NAMES } from '@/i18n/language-names'
import type { ApiClient } from '@/lib/api-client'

/**
 * Saves the account language (`PATCH /settings`). The screen has already changed, so a failure does
 * not roll it back: a toast says it stays on for this device and offers Retry. Success is silent.
 */
export async function saveLanguage(api: ApiClient, language: Language): Promise<void> {
  try {
    await api.patch('/settings', { body: { language } })
  } catch {
    toast.error(i18n.t('language.saveFailed'), {
      description: i18n.t('language.keptOnDevice', { language: LANGUAGE_NAMES[language] }),
      duration: 10_000,
      action: { label: i18n.t('common.retry'), onClick: () => void saveLanguage(api, language) },
    })
  }
}
