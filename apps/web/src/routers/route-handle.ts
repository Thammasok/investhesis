import type { Params } from "react-router"

/** Per-route data read by the layout. `crumb` labels the route in the header breadcrumb. */
export type RouteHandle = {
  crumb?: string | ((params: Params) => string)
}

export function crumbOf(handle: unknown, params: Params): string | undefined {
  if (typeof handle !== "object" || handle === null || !("crumb" in handle)) return undefined
  const { crumb } = handle as RouteHandle
  return typeof crumb === "function" ? crumb(params) : crumb
}
