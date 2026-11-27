import { SearchXIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

/** Shown instead of the table when search and filters leave nothing (FR-008). */
export function NoMatches({ onClearAll }: { onClearAll: () => void }) {
  return (
    <Card className="items-center gap-3 py-12 text-center">
      <SearchXIcon className="size-8 text-muted-foreground" aria-hidden="true" />
      <h2 className="font-heading text-lg font-semibold">No stocks match</h2>
      <p className="text-sm text-muted-foreground">Try a different search or fewer filters.</p>
      <Button variant="outline" onClick={onClearAll}>
        Clear all
      </Button>
    </Card>
  )
}
