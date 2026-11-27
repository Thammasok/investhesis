import type { Chain } from '@investhesis/domain'
import { ArrowRightIcon, PencilIcon } from 'lucide-react'
import { useId, type Ref } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import type { Stock } from '@/features/stocks/types'
import { countsText, leftOutText } from '../chains-model'
import { Lane } from './lane'

type Props = {
  chain: Chain
  stocksById: ReadonlyMap<string, Stock>
  /** `/stocks` filtered to this chain (FR-008). */
  stocksHref: string
  /** Wired by the rename dialog (T-006); the button is present until then. */
  onRename?: (button: HTMLButtonElement) => void
  headingRef?: Ref<HTMLHeadingElement>
}

/** One chain: title and actions, summary, the three lanes, then Integrated and No position when used. */
export function ChainSection({ chain, stocksById, stocksHref, onRename, headingRef }: Props) {
  const { t } = useTranslation()
  const headingId = useId()
  const lanes = chain.areas.filter((a) => a.position === 'Upstream' || a.position === 'Midstream' || a.position === 'Downstream')
  const extra = chain.areas.filter((a) => a.position === 'Integrated' || a.position === 'NoPosition')
  const valued = chain.areas.some((a) => a.stocks.some((s) => s.value !== null))
  const leftOut = leftOutText(chain.leftOut)
  const others = chain.spellings.slice(1)
  return (
    <Card role="region" aria-labelledby={headingId}>
      <CardHeader>
        <h2
          id={headingId}
          ref={headingRef}
          tabIndex={-1}
          className="font-heading text-base font-semibold break-words outline-none"
        >
          {chain.title}
        </h2>
        <CardAction className="flex flex-wrap gap-2">
          <Button variant="ghost" size="sm" asChild>
            <Link to={stocksHref}>
              {t('chains.section.stocks')}
              <ArrowRightIcon aria-hidden="true" />
            </Link>
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            data-chain-rename={chain.key}
            onClick={(e) => onRename?.(e.currentTarget)}
          >
            <PencilIcon aria-hidden="true" />
            {t('common.rename')}
          </Button>
        </CardAction>
        <CardDescription className="tabular-nums">
          {countsText({ count: chain.count, held: chain.held, value: chain.value, valued })}
        </CardDescription>
        {others.length > 0 ? (
          <p className="text-xs text-muted-foreground break-words">{t('chains.section.alsoSpelled', { names: others.join(', ') })}</p>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-3">
          {lanes.map((area, i) => (
            <div key={area.position} className="contents">
              {i > 0 ? <Separator className="md:hidden" /> : null}
              <Lane area={area} stocksById={stocksById} />
            </div>
          ))}
        </div>
        {extra.map((area) => (
          <div key={area.position} className="space-y-4">
            <Separator className="md:hidden" />
            <Lane area={area} stocksById={stocksById} />
          </div>
        ))}
        {leftOut ? <p className="text-sm text-muted-foreground">{leftOut}</p> : null}
      </CardContent>
    </Card>
  )
}
