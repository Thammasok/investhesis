import { Fragment } from "react"
import { useTranslation } from "react-i18next"
import { Link, useMatches } from "react-router"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { crumbOf } from "@/routers/route-handle"

/** Builds the trail from the `crumb` of each matched route (see `routers/route-handle.ts`). */
export function AppBreadcrumb() {
  const { t } = useTranslation()
  const crumbs = useMatches().flatMap((match) => {
    const label = crumbOf(match.handle, match.params, match.loaderData, t)
    return label ? [{ id: match.id, label, to: match.pathname }] : []
  })

  if (crumbs.length === 0) return null

  return (
    <Breadcrumb>
      <BreadcrumbList>
        {crumbs.map((crumb, index) => {
          const isLast = index === crumbs.length - 1
          return (
            <Fragment key={crumb.id}>
              {index > 0 && <BreadcrumbSeparator />}
              <BreadcrumbItem>
                {isLast ? (
                  <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink asChild>
                    <Link to={crumb.to}>{crumb.label}</Link>
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
            </Fragment>
          )
        })}
      </BreadcrumbList>
    </Breadcrumb>
  )
}
