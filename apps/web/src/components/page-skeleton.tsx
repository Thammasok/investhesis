import { Skeleton } from '@/components/ui/skeleton'

/** First-paint placeholder of the signed-in area: five table-row skeletons while the first loaders run. */
export function PageSkeleton() {
  return (
    <div className="mx-auto w-full max-w-5xl space-y-2 p-4" role="status" aria-busy="true" aria-label="Loading">
      {Array.from({ length: 5 }, (_, i) => (
        <Skeleton key={i} className="h-9 w-full" />
      ))}
    </div>
  )
}
