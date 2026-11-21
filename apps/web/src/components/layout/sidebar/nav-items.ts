import {
  ArrowDownUpIcon,
  ChartPieIcon,
  LineChartIcon,
  ListIcon,
  NetworkIcon,
  type LucideIcon,
} from "lucide-react"

export type NavItem = { to: string; label: string; icon: LucideIcon }

/** The signed-in area's pages, in sidebar order. */
export const navItems: NavItem[] = [
  { to: "/stocks", label: "Stocks", icon: LineChartIcon },
  { to: "/concentration", label: "Concentration", icon: ChartPieIcon },
  { to: "/chains", label: "Value chains", icon: NetworkIcon },
  { to: "/lists", label: "Lists", icon: ListIcon },
  { to: "/import-export", label: "Import / export", icon: ArrowDownUpIcon },
]
