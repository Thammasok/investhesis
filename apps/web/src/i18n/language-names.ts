import type { Language } from '@investhesis/domain'

/** Each language is named in itself and never translated (ux-design.md: Language switch). */
export const LANGUAGE_NAMES: Record<Language, string> = { th: 'ไทย', en: 'English' }
/** What a screen reader hears when the language changes. */
export const LANGUAGE_ANNOUNCEMENTS: Record<Language, string> = { th: 'ภาษาไทย', en: 'English' }
/** The group label, always both languages so an investor in the wrong one can still find it. */
export const LANGUAGE_GROUP_LABEL = 'ภาษา · Language'
