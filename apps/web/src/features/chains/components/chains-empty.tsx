import { NetworkIcon, PlusIcon, UploadIcon } from 'lucide-react'
import { Link } from 'react-router'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

/** FR-012, no saved stocks. */
export function NoStocksCard() {
  return (
    <Card className="items-center gap-3 py-12 text-center">
      <NetworkIcon className="size-8 text-muted-foreground" aria-hidden="true" />
      <h2 className="font-heading text-lg font-semibold">No value chains yet</h2>
      <p className="text-sm text-muted-foreground">Add stocks, then give each a value chain and a position.</p>
      <div className="flex flex-wrap justify-center gap-2">
        <Button asChild>
          <Link to="/stocks/new">
            <PlusIcon aria-hidden="true" />
            Add stock
          </Link>
        </Button>
        <Button variant="outline" asChild>
          <Link to="/import-export">
            <UploadIcon aria-hidden="true" />
            Import
          </Link>
        </Button>
      </div>
    </Card>
  )
}

/** FR-012, stocks in scope but none in view has a chain. `noChainCount` is 0 for an empty scope: no button then. */
export function NoChainsCard({ noChainCount, href }: { noChainCount: number; href: string }) {
  return (
    <Card className="items-center gap-3 px-4 py-12 text-center">
      <NetworkIcon className="size-8 text-muted-foreground" aria-hidden="true" />
      <h2 className="font-heading text-lg font-semibold">No value chains in this view</h2>
      <p className="max-w-prose text-sm text-muted-foreground">
        Give a stock a value chain name and a position (Upstream, Midstream, Downstream) on its edit page.
      </p>
      {noChainCount > 0 ? (
        <Button variant="outline" asChild>
          <Link to={href}>{`Show the ${noChainCount} ${noChainCount === 1 ? 'stock' : 'stocks'} with no chain`}</Link>
        </Button>
      ) : null}
    </Card>
  )
}
