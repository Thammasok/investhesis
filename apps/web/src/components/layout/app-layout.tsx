import { Suspense } from "react"
import { Outlet, useNavigation } from "react-router"
import { Separator } from "@/components/ui/separator"
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { TooltipProvider } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { AppBreadcrumb } from "./app-breadcrumb"
import { AppSidebar } from "./sidebar/app-sidebar"
import type { SidebarUser } from "./sidebar/nav-user"

// Stand-in until sign-in exists; then the user comes from the session.
const placeholderUser: SidebarUser = { name: "Investor", email: "investor@example.com" }

/** Shell of the signed-in area, from shadcn's `sidebar-08` block (inset sidebar). */
export function AppLayout() {
  const navigation = useNavigation()

  return (
    <TooltipProvider>
      <SidebarProvider>
        <AppSidebar user={placeholderUser} />
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
