import { lensValueLabel } from '@investhesis/domain'
import { useLanguage } from '../use-language'

/**
 * The text of one lens value in the interface language. When the label differs from the stored value
 * (Thai), the canonical English value is the hover `title`, so an investor can see the term they know.
 */
export function LensText({ lens, value }: { lens: string; value: string }) {
  const label = lensValueLabel(lens, value, useLanguage())
  return label === value ? <>{value}</> : <span title={value}>{label}</span>
}
