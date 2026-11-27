import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { Stock } from '../types'
import { LensText } from './lens-text'

/** An unset lens: a dash for the eye, "not set" for a screen reader. */
function Unset() {
  const { t } = useTranslation()
  return (
    <>
      <span aria-hidden="true">—</span>
      <span className="sr-only">{t('stocks.table.notSet')}</span>
    </>
  )
}

/** Marks a value taken from the sector (`lensSources[field] === "default"`). */
function DefaultBadge() {
  const { t } = useTranslation()
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant="outline" tabIndex={0} className="ml-2">
          {t('stocks.classification.default')}
        </Badge>
      </TooltipTrigger>
      <TooltipContent>{t('stocks.classification.defaultHint')}</TooltipContent>
    </Tooltip>
  )
}

function Row({ label, children }: { label: string; children: ReactNode | undefined }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="break-words">{children ?? <Unset />}</dd>
    </>
  )
}

const text = (lens: string, value: string | null): ReactNode => (value === null ? undefined : <LensText lens={lens} value={value} />)
const joined = (lens: string, values: string[]): ReactNode =>
  values.length > 0
    ? values.map((value, i) => (
        <span key={value}>
          {i > 0 ? ', ' : null}
          <LensText lens={lens} value={value} />
        </span>
      ))
    : undefined

/** The 10 lenses of a stock as a description list (ux-design.md §Stock detail). */
export function ClassificationCard({ stock, className }: { stock: Stock; className?: string }) {
  const { t } = useTranslation()
  const isDefault = (field: string) => stock.lensSources[field] === 'default'
  const chain = stock.valueChain
    ? stock.valueChainPosition && stock.valueChainPosition !== 'None'
      ? (
          <>
            {stock.valueChain} · <LensText lens="valueChainPosition" value={stock.valueChainPosition} />
          </>
        )
      : stock.valueChain
    : undefined

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>
          <h2>{t('stocks.classification.title')}</h2>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-[minmax(8rem,auto)_1fr] gap-x-4 gap-y-2 text-sm">
          <Row label={t('stocks.classification.sector')}>
            {stock.gicsSector ? (
              <>
                <LensText lens="gicsSector" value={stock.gicsSector} />
                {stock.market === 'TH' && stock.setIndustryGroup ? (
                  <span className="block text-muted-foreground">
                    <LensText lens="setIndustryGroup" value={stock.setIndustryGroup} />
                  </span>
                ) : null}
              </>
            ) : undefined}
          </Row>
          <Row label={t('stocks.classification.valueChain')}>{chain}</Row>
          <Row label={t('stocks.classification.economicCycle')}>
            {stock.economicCycle ? (
              <>
                <LensText lens="economicCycle" value={stock.economicCycle} />
                {isDefault('economicCycle') ? <DefaultBadge /> : null}
              </>
            ) : undefined}
          </Row>
          <Row label={t('stocks.classification.size')}>{text('size', stock.size)}</Row>
          <Row label={t('stocks.classification.style')}>{text('style', stock.style)}</Row>
          <Row label={t('stocks.classification.lynchType')}>{text('lynchType', stock.lynchType)}</Row>
          <Row label={t('stocks.classification.lifeCycle')}>{text('lifeCycle', stock.lifeCycle)}</Row>
          <Row label={t('stocks.classification.customers')}>{joined('customers', stock.customers)}</Row>
          <Row label={t('stocks.classification.revenueTypes')}>{joined('revenueTypes', stock.revenueTypes)}</Row>
          <Row label={t('stocks.classification.moat')}>{text('moat', stock.moat)}</Row>
          <Row label={t('stocks.classification.themes')}>
            {stock.themes.length > 0 ? (
              <span className="flex flex-wrap gap-1">
                {stock.themes.map((theme) => (
                  <Badge key={theme} variant="secondary">
                    {theme}
                  </Badge>
                ))}
              </span>
            ) : undefined}
          </Row>
          <Row label={t('stocks.classification.volatility')}>{text('volatility', stock.volatility)}</Row>
        </dl>
      </CardContent>
    </Card>
  )
}
