import { Suspense } from "react"
import { Link, Outlet } from "react-router"
import { TrendingUpIcon } from "lucide-react"

/** Shell of the sign-in pages, from shadcn's `login-02` block (form left, panel right). */
export function AuthLayout() {
  return (
    <div className="grid min-h-svh lg:grid-cols-2">
      <div className="flex flex-col gap-4 p-6 md:p-10">
        <div className="flex justify-center gap-2 md:justify-start">
          <Link to="/auth/sign-in" className="flex items-center gap-2 font-medium">
            <div className="flex size-6 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <TrendingUpIcon className="size-4" />
            </div>
            Investhesis
          </Link>
        </div>
        <main className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-xs">
            <Suspense>
              <Outlet />
            </Suspense>
          </div>
        </main>
      </div>
      {/* The block's placeholder image, replaced by a decorative panel until there's artwork. */}
      <div
        aria-hidden="true"
        className="relative hidden overflow-hidden bg-muted lg:flex lg:flex-col lg:justify-end lg:p-10"
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,color-mix(in_oklch,var(--color-primary)_12%,transparent),transparent_60%)]" />
        <div className="relative max-w-md space-y-2">
          <p className="font-heading text-2xl font-semibold">One thesis for every stock you own.</p>
          <p className="text-muted-foreground">
            US and Thai stocks on the same 10 lenses, with your concentration in plain view.
          </p>
        </div>
      </div>
    </div>
  )
}
