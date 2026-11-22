import type { ReactNode } from 'react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { Stock } from '../types'

/** An unset lens: a dash for the eye, "not set" for a screen reader. */
function Unset() {
  return (
    <>
      <span aria-hidden="true">—</span>
      <span className="sr-only">not set</span>
    </>
  )
}

/** Marks a value taken from the sector (`lensSources[field] === "default"`). */
function DefaultBadge() {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant="outline" tabIndex={0} className="ml-2">
          Default
        </Badge>
      </TooltipTrigger>
      <TooltipContent>Set from the sector. Pick a value to override.</TooltipContent>
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

const text = (value: string | null): string | undefined => value ?? undefined
const joined = (values: string[]): string | undefined => (values.length > 0 ? values.join(', ') : undefined)

/** The 10 lenses of a stock as a description list (ux-design.md §Stock detail). */
export function ClassificationCard({ stock, className }: { stock: Stock; className?: string }) {
  const isDefault = (field: string) => stock.lensSources[field] === 'default'
  const chain = stock.valueChain
    ? stock.valueChainPosition && stock.valueChainPosition !== 'None'
      ? `${stock.valueChain} · ${stock.valueChainPosition}`
      : stock.valueChain
    : undefined

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>
          <h2>Classification</h2>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-[minmax(8rem,auto)_1fr] gap-x-4 gap-y-2 text-sm">
          <Row label="Sector">
            {stock.gicsSector ? (
              <>
                {stock.gicsSector}
                {stock.market === 'TH' && stock.setIndustryGroup ? (
                  <span className="block text-muted-foreground">{stock.setIndustryGroup}</span>
                ) : null}
              </>
            ) : undefined}
          </Row>
          <Row label="Value chain">{chain}</Row>
          <Row label="Economic cycle">
            {stock.economicCycle ? (
              <>
                {stock.economicCycle}
                {isDefault('economicCycle') ? <DefaultBadge /> : null}
              </>
            ) : undefined}
          </Row>
          <Row label="Size">{text(stock.size)}</Row>
          <Row label="Style">{text(stock.style)}</Row>
          <Row label="Lynch type">{text(stock.lynchType)}</Row>
          <Row label="Life cycle">{text(stock.lifeCycle)}</Row>
          <Row label="Customers">{joined(stock.customers)}</Row>
          <Row label="Revenue types">{joined(stock.revenueTypes)}</Row>
          <Row label="Moat">{text(stock.moat)}</Row>
          <Row label="Themes">
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
          <Row label="Volatility">{text(stock.volatility)}</Row>
        </dl>
      </CardContent>
    </Card>
  )
}
