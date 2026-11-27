import { lensValueLabel, type LabelOrder, type Language } from '@investhesis/domain'

const collators = new Map<Language, Intl.Collator>()

/** The `order` object of FR-007: lens value labels in `lang`, compared with that language's collator. */
export function languageOrder(lang: Language): LabelOrder {
  let collator = collators.get(lang)
  if (!collator) collators.set(lang, (collator = new Intl.Collator(lang)))
  const c = collator
  return {
    label: (lens, value) => lensValueLabel(lens, value, lang),
    compare: (a, b) => c.compare(a, b),
  }
}
