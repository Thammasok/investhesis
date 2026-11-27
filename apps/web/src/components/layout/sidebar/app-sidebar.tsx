import type { ComponentProps } from "react"
import { useTranslation } from "react-i18next"
import { Link } from "react-router"
import { TrendingUpIcon } from "lucide-react"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { NavMain } from "./nav-main"
import { NavUser } from "./nav-user"
import type { SidebarUser } from "./sidebar-user"

type AppSidebarProps = ComponentProps<typeof Sidebar> & { user: SidebarUser }

export function AppSidebar({ user, ...props }: AppSidebarProps) {
  const { t } = useTranslation()
  return (
    <Sidebar variant="inset" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link to="/stocks">
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                  <TrendingUpIcon className="size-4" />
                </div>
                <div className="grid flex-1 text-left text-sm leading-snug">
                  <span className="truncate font-medium">Investhesis</span>
                  <span className="truncate text-xs">{t("nav.tagline")}</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <nav aria-label={t("shell.mainNav")}>
          <NavMain />
        </nav>
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={user} />
      </SidebarFooter>
    </Sidebar>
  )
}
