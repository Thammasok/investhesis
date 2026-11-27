import { Suspense } from "react"
import { useTranslation } from "react-i18next"
import { Outlet, useNavigation } from "react-router"
import { Separator } from "@/components/ui/separator"
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { TooltipProvider } from "@/components/ui/tooltip"
import { useCurrentUser } from "@/features/auth/current-user"
import { LanguageAnnouncer } from "@/i18n/language-switch"
import { cn } from "@/lib/utils"
import { AppBreadcrumb } from "./app-breadcrumb"
import { AppSidebar } from "./sidebar/app-sidebar"
import { sidebarUserFromEmail } from "./sidebar/sidebar-user"

/** Shell of the signed-in area, from shadcn's `sidebar-08` block (inset sidebar). */
export function AppLayout() {
  const { t } = useTranslation()
  const navigation = useNavigation()
  const current = useCurrentUser()
  // Shown only when neither GET /me nor the session gave an email.
  const user = current ? sidebarUserFromEmail(current.email) : { name: t("nav.account"), email: t("nav.account") }

  return (
    <TooltipProvider>
      <SidebarProvider>
        <AppSidebar user={user} />
        <LanguageAnnouncer />
        <SidebarInset>
          <header className="flex h-16 shrink-0 items-center gap-2">
            <div className="flex items-center gap-2 px-4">
              <SidebarTrigger className="-ml-1" />
              <Separator orientation="vertical" className="mr-2 data-[orientation=vertical]:h-4" />
              <AppBreadcrumb />
            </div>
          </header>
          <main
            className={cn(
              "flex flex-1 flex-col gap-4 p-4 pt-0 transition-opacity",
              navigation.state === "loading" && "opacity-60",
            )}
          >
            <Suspense>
              <Outlet />
            </Suspense>
          </main>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  )
}
