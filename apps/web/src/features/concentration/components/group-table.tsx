import { ChevronRightIcon, TriangleAlertIcon } from 'lucide-react'
import { Fragment, useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { Stock } from '@/features/stocks/types'
import { scopeName } from '@/features/stock-filters/scope'
import { groupText, lensName, thb, type Plan, type Settings, type View } from '../concentration-model'

const num = 'text-right tabular-nums'

function FlagBadge({ threshold }: { threshold: number }) {
  const { t } = useTranslation()
  return (
    // The outline badge's own border is 1.3:1 on the page, so it gets a visible one (TC-E-416: at least 3:1 in both themes).
    <Badge variant="outline" className="border-muted-foreground whitespace-nowrap text-foreground">
      <TriangleAlertIcon aria-hidden="true" className="text-destructive" />
      {t('concentration.table.over', { threshold })}
    </Badge>
  )
}

/** The only figure on the page: a table whose Share cells carry a decorative bar (NFR-006). */
export function GroupTable({ plan, view, stocks, settings }: { plan: Plan; view: View; stocks: readonly Stock[]; settings: Settings }) {
  const { t } = useTranslation()
  const idBase = useId()
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set())
  const byId = new Map(stocks.map((s) => [s.id, s]))
  const isValue = plan.measure === 'value'
  const threshold = settings.concentrationThreshold
  const toggle = (label: string) =>
    setOpen((prev) => {
      const next = new Set(prev)
      if (!next.delete(label)) next.add(label)
      return next
    })

  return (
    <div className="rounded-lg border">
      <Table>
        <TableCaption className="sr-only">
          {t('concentration.table.caption', {
            lens: lensName(view.lens),
            measure: isValue ? t('concentration.table.byValue') : t('concentration.table.byCount'),
            scope: scopeName(view),
          })}
        </TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead scope="col">{t('concentration.table.group')}</TableHead>
            {isValue ? <TableHead scope="col" className={`hidden sm:table-cell ${num}`}>{t('concentration.table.valueThb')}</TableHead> : null}
            {isValue ? null : <TableHead scope="col" className={`hidden sm:table-cell ${num}`}>{t('concentration.table.stocks')}</TableHead>}
            <TableHead scope="col" className={num}>{t('concentration.table.share')}</TableHead>
            {isValue ? <TableHead scope="col" className={`hidden sm:table-cell ${num}`}>{t('concentration.table.stocks')}</TableHead> : <TableHead scope="col">{t('concentration.table.flag')}</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {plan.groups.map((group, index) => {
            const share = isValue ? group.valueShare : group.countShare
            const flagged = isValue ? group.valueFlag : group.countFlag
            const expanded = open.has(group.label)
            const subId = `${idBase}-group-${index}`
            const stockLabel = t('concentration.stockCount', { count: group.count, n: group.count.toLocaleString('en-US') })
            const label = groupText(view.lens.key, group)
            return (
              <Fragment key={group.label}>
                <TableRow>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="-ml-2 h-auto min-h-8 max-w-full justify-start whitespace-normal text-left"
                      aria-expanded={expanded}
                      aria-controls={subId}
                      aria-label={t('concentration.table.showStocks', { label })}
                      onClick={() => toggle(group.label)}
                    >
                      <ChevronRightIcon
                        aria-hidden="true"
                        data-state={expanded ? 'open' : 'closed'}
                        className="transition-transform data-[state=open]:rotate-90 motion-reduce:transition-none"
                      />
                      <span title={group.notSet || label === group.label ? undefined : group.label}>{label}</span>
                    </Button>
                    <div className="pl-6 text-xs text-muted-foreground sm:hidden">
                      {isValue ? `${thb(group.value)} · ${stockLabel}` : stockLabel}
                    </div>
                  </TableCell>
                  {isValue ? <TableCell className={`hidden sm:table-cell ${num}`}>{thb(group.value)}</TableCell> : <TableCell className={`hidden sm:table-cell ${num}`}>{group.count}</TableCell>}
                  <TableCell className={num}>
                    <div className="flex flex-col items-end gap-1 sm:flex-row sm:items-center sm:justify-end sm:gap-2">
                      <div aria-hidden="true" className="hidden h-1.5 w-24 rounded-full bg-muted sm:block">
                        <div className="h-full rounded-full bg-primary" style={{ width: `${share ?? 0}%`, maxWidth: "100%" }} />
                      </div>
                      <span>{share === null ? '—' : `${share}%`}</span>
                      {isValue && flagged ? <FlagBadge threshold={threshold} /> : null}
                    </div>
                  </TableCell>
                  {isValue ? (
                    <TableCell className={`hidden sm:table-cell ${num}`}>{group.count}</TableCell>
                  ) : (
                    <TableCell>{flagged ? <FlagBadge threshold={threshold} /> : null}</TableCell>
                  )}
                </TableRow>
                {expanded ? (
                  <TableRow id={subId} className="bg-background hover:bg-background">
                    <TableCell colSpan={4}>
                      <ul className="flex flex-wrap gap-x-3 gap-y-1 pl-6 text-sm">
                        {group.stockIds.map((id) => {
                          const stock = byId.get(id)
                          return stock ? (
                            <li key={id}>
                              <Link to={`/stocks/${stock.id}`} className="underline underline-offset-4 rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                                {stock.ticker}
                              </Link>
                            </li>
                          ) : null
                        })}
                      </ul>
                    </TableCell>
                  </TableRow>
                ) : null}
              </Fragment>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
