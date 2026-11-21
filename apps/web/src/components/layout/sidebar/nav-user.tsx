import { ChevronsUpDownIcon, LogOutIcon, UserIcon } from "lucide-react"
import { Link, useNavigate } from "react-router"
import { useAuthClient } from "@/features/auth/auth-client-context"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"

export type SidebarUser = { name: string; email: string }

/** v1 has no display name: the email is the name (ux-design.md, Account menu). */
export function sidebarUserFromEmail(email: string): SidebarUser {
  return { name: email, email }
}

/** First two letters of the email's local part, upper-cased. */
function initials(name: string) {
  const letters = name.split("@")[0].replace(/[^\p{L}\p{N}]/gu, "")
  return letters.slice(0, 2).toUpperCase() || "?"
}

function UserSummary({ user }: { user: SidebarUser }) {
  return (
    <>
      <Avatar className="size-8 rounded-lg">
        <AvatarFallback className="rounded-lg">{initials(user.name)}</AvatarFallback>
      </Avatar>
      <div className="grid flex-1 text-left text-sm leading-tight">
        <span className="truncate font-medium">{user.name}</span>
        {user.email !== user.name ? <span className="truncate text-xs">{user.email}</span> : null}
      </div>
    </>
  )
}

/**
 * Account menu at the foot of the sidebar. Sign out ends the session, then replaces the history
 * entry with the sign-in page, so Back can't return to the app.
 */
export function NavUser({ user }: { user: SidebarUser }) {
  const { isMobile } = useSidebar()
  const authClient = useAuthClient()
  const navigate = useNavigate()

  async function signOut() {
    await authClient.signOut()
    void navigate("/auth/sign-in", { replace: true })
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              aria-label="Account menu"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <UserSummary user={user} />
              <ChevronsUpDownIcon className="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
            side={isMobile ? "bottom" : "right"}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                <UserSummary user={user} />
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem asChild>
                <Link to="/account">
                  <UserIcon />
                  Account
                </Link>
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => void signOut()}>
              <LogOutIcon />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
