import { lensValueLabel } from '@investhesis/domain'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { getLanguage } from '@/i18n/language'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { thb } from '@/features/concentration/concentration-model'
import type { Stock } from '@/features/stocks/types'

type Props = {
  stock: Stock
  held: boolean
  /** THB at cost, two decimals; `null` when the stock is not held or cannot be valued. */
  value: string | null
  /** Offers Set position (the No position area only). */
  setPosition?: boolean
}

/** One stock of a lane: a single link to its page (ticker, Held, name and market, value). */
export function ChainStockEntry({ stock, held, value, setPosition = false }: Props) {
  const { t } = useTranslation()
  return (
    <li className="flex flex-wrap items-center justify-between gap-x-2">
      <Link
        to={`/stocks/${stock.id}`}
        className="block min-w-0 flex-1 rounded-md px-2 py-1.5 outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="font-medium break-words">{stock.ticker}</span>
        {held ? (
          <Badge variant="secondary" className="ml-2">
            {t('chains.entry.held')}
          </Badge>
        ) : null}
        <span className="block text-sm text-muted-foreground break-words">{`${stock.name} · ${lensValueLabel('market', stock.market, getLanguage())}`}</span>
        {value !== null ? <span className="block text-sm tabular-nums">{thb(value)}</span> : null}
      </Link>
      {setPosition ? (
        <Button variant="link" size="sm" asChild>
          <Link to={`/stocks/${stock.id}/edit`} aria-label={t('chains.entry.setPositionOf', { ticker: stock.ticker })}>
            {t('chains.entry.setPosition')}
          </Link>
        </Button>
      ) : null}
    </li>
  )
}
