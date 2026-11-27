import { lensValueLabel, type Language, type LabelOrder } from '@investhesis/domain'

/** Label and compare functions of a language, for the domain's ordering helpers (FR-007). */
export function languageOrder(lang: Language): LabelOrder {
  const collator = new Intl.Collator(lang)
  return {
    label: (lens, value) => lensValueLabel(lens, value, lang),
    compare: (a, b) => collator.compare(a, b),
  }
}
