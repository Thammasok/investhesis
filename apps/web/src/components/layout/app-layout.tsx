import { Suspense } from "react"
import { Outlet, useNavigation } from "react-router"
import { Separator } from "@/components/ui/separator"
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { TooltipProvider } from "@/components/ui/tooltip"
import { useCurrentUser } from "@/features/auth/current-user"
import { cn } from "@/lib/utils"
import { AppBreadcrumb } from "./app-breadcrumb"
import { AppSidebar } from "./sidebar/app-sidebar"
import { sidebarUserFromEmail, type SidebarUser } from "./sidebar/nav-user"

// Shown only when neither GET /me nor the session gave an email.
const unknownUser: SidebarUser = { name: "Account", email: "Account" }

/** Shell of the signed-in area, from shadcn's `sidebar-08` block (inset sidebar). */
export function AppLayout() {
  const navigation = useNavigation()
  const current = useCurrentUser()
  const user = current ? sidebarUserFromEmail(current.email) : unknownUser

  return (
    <TooltipProvider>
      <SidebarProvider>
        <AppSidebar user={user} />
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
