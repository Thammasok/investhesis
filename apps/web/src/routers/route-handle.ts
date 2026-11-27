import type { Params } from "react-router"

/** Per-route data read by the layout. `crumb` labels the route in the header breadcrumb. */
export type RouteHandle = {
  /** A label, or a function of the route params and its loader data (`undefined` without a loader). */
  crumb?: string | ((params: Params, data: unknown) => string)
}

export function crumbOf(handle: unknown, params: Params, data?: unknown): string | undefined {
  if (typeof handle !== "object" || handle === null || !("crumb" in handle)) return undefined
  const { crumb } = handle as RouteHandle
  return typeof crumb === "function" ? crumb(params, data) : crumb
}
