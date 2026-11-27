import { InfoIcon } from 'lucide-react'
import { Link } from 'react-router'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { countLabel } from '@/features/stocks/format'

/** FR-006: how many stocks in view have no chain, and a link to them. */
export function NoChainNote({ count, href }: { count: number; href: string }) {
  return (
    <Alert role="status">
      <InfoIcon aria-hidden="true" />
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <p>{`${countLabel(count, 'stock')} in view ${count === 1 ? 'has' : 'have'} no value chain.`}</p>
        <Button variant="link" size="sm" className="h-auto p-0" asChild>
          <Link to={href}>Show them</Link>
        </Button>
      </div>
    </Alert>
  )
}

/** FR-005: a held USD stock with amounts has no rate to value it, so it is left out. Shown once for the page. */
export function RateNote() {
  return (
    <Alert role="status">
      <InfoIcon aria-hidden="true" />
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <p>USD holdings are left out of values until you save a rate.</p>
        <Button variant="link" size="sm" className="h-auto p-0" asChild>
          <Link to="/concentration">Set rate on Concentration</Link>
        </Button>
      </div>
    </Alert>
  )
}

/** FR-013: the brief's constraint, as on the concentration page. */
export function AdviceNote() {
  return <p className="text-sm text-muted-foreground">These chains and costs are your own classifications, not advice.</p>
}
