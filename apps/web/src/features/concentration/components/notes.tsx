import { Fragment } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { Button } from '@/components/ui/button'
import type { Stock } from '@/features/stocks/types'
import type { Plan } from '../concentration-model'

const MANY = ['customers', 'revenueTypes', 'themes', 'indexMembership'] as const

function Tickers({ ids, stocks }: { ids: readonly string[]; stocks: ReadonlyMap<string, Stock> }) {
  const found = ids.map((id) => stocks.get(id)).filter((s): s is Stock => s !== undefined)
  return (
    <span>
      (
      {found.map((s, i) => (
        <Fragment key={s.id}>
          {i > 0 ? ', ' : null}
          <Link to={`/stocks/${s.id}`} className="underline underline-offset-4 rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
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
  const { t } = useTranslation()
  const { noAmount, needsRate, notHeld } = plan.result.leftOut
  const byId = new Map(stocks.map((s) => [s.id, s]))
  const parts: React.ReactNode[] = []
  if (noAmount.length > 0)
    parts.push(
      <span key="amount">
        <span>{t('concentration.notes.noAmount', { count: noAmount.length, n: noAmount.length })}</span>{' '}
        <Tickers ids={noAmount} stocks={byId} />
      </span>,
    )
  if (needsRate.length > 0)
    parts.push(
      <span key="rate">
        <span>{t('concentration.notes.needsRate', { count: needsRate.length, n: needsRate.length })}</span>{' '}
        <Tickers ids={needsRate} stocks={byId} />{' '}
        <Button variant="link" size="sm" className="h-auto p-0" onClick={onSetRate}>
          {t('concentration.controls.setRate')}
        </Button>
      </span>,
    )
  if (notHeld.length > 0)
    parts.push(
      <Link key="held" to="/stocks" className="underline underline-offset-4 rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
        {t('concentration.notes.notHeld', { stocks: t('concentration.stockCount', { count: notHeld.length, n: notHeld.length.toLocaleString('en-US') }) })}
      </Link>,
    )
  if (parts.length === 0) return null
  return (
    <p className="text-sm">
      {t('concentration.notes.notInValue')}{' '}
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
  const { t } = useTranslation()
  const what = (MANY as readonly string[]).includes(lensKey) ? t(`concentration.notes.many.${lensKey as (typeof MANY)[number]}`) : lensKey
  return <p className="text-sm text-muted-foreground">{t('concentration.notes.multi', { what })}</p>
}

export function AdviceNote() {
  const { t } = useTranslation()
  return <p className="text-xs text-muted-foreground">{t('concentration.advice')}</p>
}
