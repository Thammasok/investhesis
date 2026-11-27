import type { ChainAreaGroup, ChainArea } from '@investhesis/domain'
import { lensValueLabel } from '@investhesis/domain'
import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import { getLanguage } from '@/i18n/language'
import type { Stock } from '@/features/stocks/types'
import { countsText } from '../chains-model'
import { ChainStockEntry } from './chain-stock-entry'

/** Upstream, Midstream and Downstream are the lens's own values (glossary); the other two areas are named here. */
function useHeading() {
  const { t } = useTranslation()
  return (area: ChainArea): string =>
    area === 'Integrated'
      ? t('chains.lane.integrated')
      : area === 'NoPosition'
        ? t('chains.lane.noPosition')
        : lensValueLabel('valueChainPosition', area, getLanguage())
}

/** One area of a chain: heading, counts line, then its stocks as a list (or "No stocks"). */
export function Lane({ area, stocksById }: { area: ChainAreaGroup; stocksById: ReadonlyMap<string, Stock> }) {
  const { t } = useTranslation()
  const heading = useHeading()
  const headingId = useId()
  const valued = area.stocks.some((s) => s.value !== null)
  return (
    <section aria-labelledby={headingId} className="space-y-1 md:rounded-lg md:border md:p-3">
      <h3 id={headingId} className="text-sm font-medium break-words">
        {heading(area.position)}
      </h3>
      {area.count === 0 ? (
        <p className="text-sm text-muted-foreground">{t('chains.lane.noStocks')}</p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground tabular-nums">
            {countsText({ count: area.count, held: area.held, value: area.value, valued, share: area.valueShare })}
          </p>
          <ul className="space-y-0.5">
            {area.stocks.map((entry) => {
              const stock = stocksById.get(entry.id)
              return stock ? (
                <ChainStockEntry
                  key={entry.id}
                  stock={stock}
                  held={entry.held}
                  value={entry.value}
                  setPosition={area.position === 'NoPosition'}
                />
              ) : null
            })}
          </ul>
        </>
      )}
    </section>
  )
}
