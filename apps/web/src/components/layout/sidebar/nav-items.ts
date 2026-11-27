import {
  ArrowDownUpIcon,
  ChartPieIcon,
  LineChartIcon,
  ListIcon,
  NetworkIcon,
  type LucideIcon,
} from "lucide-react"
import type { CatalogueKey } from "@/routers/route-handle"

export type NavItem = { to: string; labelKey: CatalogueKey; icon: LucideIcon }

/** The signed-in area's pages, in sidebar order. */
export const navItems: NavItem[] = [
  { to: "/stocks", labelKey: "nav.stocks", icon: LineChartIcon },
  { to: "/concentration", labelKey: "nav.concentration", icon: ChartPieIcon },
  { to: "/chains", labelKey: "nav.valueChains", icon: NetworkIcon },
  { to: "/lists", labelKey: "nav.lists", icon: ListIcon },
  { to: "/import-export", labelKey: "nav.importExport", icon: ArrowDownUpIcon },
]
