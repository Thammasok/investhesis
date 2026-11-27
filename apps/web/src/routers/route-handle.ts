import type { Params } from "react-router"
import type { TFunction } from "@/i18n"

/** Per-route data read by the layout. `crumb` labels the route in the header breadcrumb. */
export type RouteHandle = {
  /**
   * A catalogue key (`nav.stocks`; text that is not a key shows as written), or a function of the
   * route params, its loader data (`undefined` without a loader) and `t` for the current language
   * (a ticker or a list name needs no key). `routes-crumbs.test.tsx` checks every key exists.
   */
  crumb?: string | ((params: Params, data: unknown, t: TFunction) => string)
}

export function crumbOf(handle: unknown, params: Params, data: unknown, t: TFunction): string | undefined {
  if (typeof handle !== "object" || handle === null || !("crumb" in handle)) return undefined
  const { crumb } = handle as RouteHandle
  return typeof crumb === "function" ? crumb(params, data, t) : crumb === undefined ? undefined : (t as (key: string) => string)(crumb)
}
