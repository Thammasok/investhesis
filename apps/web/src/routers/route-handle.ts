import type { TFunction } from "i18next"
import type { nav } from "@/i18n/catalogue/en/nav"
import type { Params } from "react-router"

/** A page name in the `nav` group of the catalogue. */
export type CatalogueKey = `nav.${keyof typeof nav}`

/** Per-route data read by the layout. `crumb` labels the route in the header breadcrumb. */
export type RouteHandle = {
  /** A catalogue key, or a function of the route params, its loader data (`undefined` without a loader) and `t`. */
  crumb?: CatalogueKey | ((params: Params, data: unknown, t: TFunction) => string)
}

export function crumbOf(handle: unknown, params: Params, data: unknown, t: TFunction): string | undefined {
  if (typeof handle !== "object" || handle === null || !("crumb" in handle)) return undefined
  const { crumb } = handle as RouteHandle
  return typeof crumb === "function" ? crumb(params, data, t) : crumb === undefined ? undefined : t(crumb)
}
