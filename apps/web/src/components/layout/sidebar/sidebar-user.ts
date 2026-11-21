export type SidebarUser = { name: string; email: string }

/** v1 has no display name: the email is the name (ux-design.md, Account menu). */
export function sidebarUserFromEmail(email: string): SidebarUser {
  return { name: email, email }
}
