import { Fragment } from 'react'
import { Link } from 'react-router'
import { Button } from '@/components/ui/button'
import { countLabel } from '@/features/stocks/format'
import type { Stock } from '@/features/stocks/types'
import type { Plan } from '../concentration-model'

const MANY: Record<string, string> = {
  customers: 'customers',
  revenueTypes: 'revenue types',
  themes: 'themes',
  indexMembership: 'index memberships',
}

function Tickers({ ids, stocks }: { ids: readonly string[]; stocks: ReadonlyMap<string, Stock> }) {
  const found = ids.map((id) => stocks.get(id)).filter((s): s is Stock => s !== undefined)
  return (
    <span>
      (
      {found.map((s, i) => (
        <Fragment key={s.id}>
          {i > 0 ? ', ' : null}
          <Link to={`/stocks/${s.id}`} className="underline underline-offset-4">
            {s.ticker}
          </Link>
        </Fragment>
      ))}
      )
    </span>
  )
}

/** Who is not in the value view (FR-009), with a link to each stock; the not-held count links to /stocks (G-18). */
export function LeftOutNote({ plan, stocks, onSetRate }: { plan: Plan; stocks: readonly Stock[]; onSetRate: () => void }) {
  const { noAmount, needsRate, notHeld } = plan.result.leftOut
  const byId = new Map(stocks.map((s) => [s.id, s]))
  const parts: React.ReactNode[] = []
  if (noAmount.length > 0)
    parts.push(
      <span key="amount">
        <span>{`${noAmount.length} held ${noAmount.length === 1 ? 'stock' : 'stocks'} without shares or cost`}</span>{' '}
        <Tickers ids={noAmount} stocks={byId} />
      </span>,
    )
  if (needsRate.length > 0)
    parts.push(
      <span key="rate">
        <span>{`${needsRate.length} USD ${needsRate.length === 1 ? 'holding needs' : 'holdings need'} a rate`}</span>{' '}
        <Tickers ids={needsRate} stocks={byId} />{' '}
        <Button variant="link" size="sm" className="h-auto p-0" onClick={onSetRate}>
          Set rate
        </Button>
      </span>,
    )
  if (notHeld.length > 0)
    parts.push(
      <Link key="held" to="/stocks" className="underline underline-offset-4">
        {`${countLabel(notHeld.length, 'stock')} not held`}
      </Link>,
    )
  if (parts.length === 0) return null
  return (
    <p className="text-sm">
      Not in the value:{' '}
      {parts.map((part, i) => (
        <Fragment key={i}>
          {i > 0 ? ' · ' : null}
          {part}
        </Fragment>
      ))}
    </p>
  )
}

export function MultiValueNote({ lensKey }: { lensKey: string }) {
  return (
    <p className="text-sm text-muted-foreground">
      {`A stock with several ${MANY[lensKey] ?? lensKey} counts in each of them, so the shares add up to more than 100%.`}
    </p>
  )
}

export function AdviceNote() {
  return <p className="text-xs text-muted-foreground">These groupings and costs are your own classifications, not advice.</p>
}
