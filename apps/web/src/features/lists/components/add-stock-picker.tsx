import { ChevronDownIcon, PlusIcon } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { Stock } from '@/features/stocks/types'

type AddStockPickerProps = {
  /** Saved stocks that are not in the list. */
  candidates: readonly Stock[]
  /** The user has no saved stocks at all (so the way forward is to add one). */
  noStocks: boolean
  onPick: (stock: Stock) => void
  disabled?: boolean
  className?: string
}

/** Case-insensitive substring match on ticker and name, so a Thai fragment works too (cmdk's fuzzy filter would not). */
const matches = (stock: Stock, query: string) =>
  `${stock.ticker} ${stock.name}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())

/** Add stock: a popover with a search box over the saved stocks that are not in the list yet. */
export function AddStockPicker({ candidates, noStocks, onPick, disabled, className }: AddStockPickerProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const shown = candidates.filter((s) => matches(s, query))

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) setQuery('')
      }}
    >
      <PopoverTrigger asChild>
        <Button type="button" className={className} disabled={disabled}>
          <PlusIcon aria-hidden="true" />
          {t('lists.picker.addStock')}
          <ChevronDownIcon aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        {noStocks ? (
          <p className="p-3 text-sm">
            {t('lists.picker.noSavedStocks')}{' '}
            <Link to="/stocks/new" className="underline underline-offset-4">
              {t('lists.picker.addAStock')}
            </Link>
          </p>
        ) : candidates.length === 0 ? (
          <p className="p-3 text-sm">{t('lists.picker.allInList')}</p>
        ) : (
          <Command shouldFilter={false}>
            <CommandInput placeholder={t('lists.picker.search')} value={query} onValueChange={setQuery} />
            <CommandList>
              <CommandEmpty>{t('lists.picker.noMatch')}</CommandEmpty>
              {shown.map((stock) => (
                <CommandItem
                  key={stock.id}
                  value={stock.id}
                  onSelect={() => {
                    setOpen(false)
                    setQuery('')
                    onPick(stock)
                  }}
                >
                  <span className="font-medium tabular-nums">{stock.ticker}</span>
                  <span className="min-w-0 flex-1 truncate">{stock.name}</span>
                  <Badge variant="outline" className="font-mono">
                    {stock.market}
                  </Badge>
                </CommandItem>
              ))}
            </CommandList>
          </Command>
        )}
      </PopoverContent>
    </Popover>
  )
}
