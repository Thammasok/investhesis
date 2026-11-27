import type { Params } from "react-router"
import type { Language } from "@investhesis/domain"
import type { TFunction } from "@/i18n/t"
import { tLoose } from "@/i18n/t"

/** Per-route data read by the layout. `crumb` labels the route in the header breadcrumb. */
export type RouteHandle = {
  /**
   * A catalogue key (text that is not a key is shown as written), or a function of the route
   * params, its loader data (`undefined` without a loader) and `t` for the current language.
   */
  crumb?: string | ((params: Params, data: unknown, t: TFunction) => string)
}

export function crumbOf(
  handle: unknown,
  params: Params,
  data: unknown,
  lang: Language,
  t: TFunction,
): string | undefined {
  if (typeof handle !== "object" || handle === null || !("crumb" in handle)) return undefined
  const { crumb } = handle as RouteHandle
  return typeof crumb === "function" ? crumb(params, data, t) : crumb === undefined ? undefined : tLoose(lang, crumb)
}
