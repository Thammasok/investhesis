import type { CatalogueKey, Params } from './catalogue-types.ts'
import { renderRich, type RichComponents } from './render-rich.tsx'
import { template } from './t.ts'
import { useLanguage } from './use-i18n.ts'

export function Rich({ k, params, components }: { k: CatalogueKey; params?: Params; components: RichComponents }) {
  const lang = useLanguage()
  return <>{renderRich(template(lang, k, params), components, params)}</>
}
