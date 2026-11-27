import { useTranslation } from "react-i18next"
import { NavLink, useLocation } from "react-router"
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"
import { navItems } from "./nav-items"

function isActivePath(pathname: string, to: string) {
  return pathname === to || pathname.startsWith(`${to}/`)
}

export function NavMain() {
  const { t } = useTranslation()
  const { pathname } = useLocation()
  const { isMobile, setOpenMobile } = useSidebar()

  return (
    <SidebarGroup>
      <SidebarGroupLabel>Portfolio</SidebarGroupLabel>
      <SidebarMenu>
        {navItems.map(({ to, labelKey, icon: Icon }) => {
          const label = t(labelKey)
          return (
          <SidebarMenuItem key={to}>
            <SidebarMenuButton asChild isActive={isActivePath(pathname, to)} tooltip={label}>
              {/* On a phone the sidebar is a sheet; close it once a page is picked. */}
              <NavLink to={to} onClick={() => isMobile && setOpenMobile(false)}>
                <Icon />
                <span>{label}</span>
              </NavLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
          )
        })}
      </SidebarMenu>
    </SidebarGroup>
  )
}
