import { ChevronDownIcon, PlusIcon, XIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useFetcher } from 'react-router'
import { toast } from 'sonner'
import { i18n } from '@/i18n/i18n'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { DetailActionResult } from '../stocks-data'
import type { ListSummary, Stock } from '../types'

const byName = (a: ListSummary, b: ListSummary) => a.name.localeCompare(b.name)

/** Lists the stock is in (remove with Undo) and a picker for the lists it is not in. */
export function StockListsCard({ stock, lists }: { stock: Stock; lists: ListSummary[] }) {
  const { t } = useTranslation()
  const fetcher = useFetcher<DetailActionResult>()
  const [open, setOpen] = useState(false)
  const handled = useRef<unknown>(null)
  const member = lists.filter((l) => stock.listIds.includes(l.id)).sort(byName)
  const others = lists.filter((l) => !stock.listIds.includes(l.id)).sort(byName)

  const submit = (intent: string, list: { id: string; name: string }) =>
    fetcher.submit({ intent, listId: list.id, listName: list.name }, { method: 'post' })

  // Report each action result once: a toast, with Undo after a removal.
  useEffect(() => {
    const result = fetcher.data
    if (!result || handled.current === result) return
    handled.current = result
    if (!result.ok) toast.error(result.message)
    else if (result.intent === 'remove-from-list')
      toast(i18n.t('stocks.listsCard.removedFrom', { name: result.listName }), {
        action: {
          label: i18n.t('common.undo'),
          onClick: () =>
            fetcher.submit(
              { intent: 'undo-remove', listId: result.listId, listName: result.listName },
              { method: 'post' },
            ),
        },
      })
    else if (result.intent === 'add-to-list') toast.success(i18n.t('stocks.listsCard.addedTo', { name: result.listName }))
  }, [fetcher])

  const busy = fetcher.state !== 'idle'

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{t('stocks.listsCard.title')}</h2>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {member.length > 0 ? (
          <ul className="divide-y text-sm">
            {member.map((list) => (
              <li key={list.id} className="flex items-center justify-between gap-2 py-1">
                <Link to={`/lists/${list.id}`} className="break-words underline-offset-4 hover:underline">
                  {list.name}
                </Link>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t('stocks.listsCard.removeFrom', { name: list.name })}
                  disabled={busy}
                  onClick={() => submit('remove-from-list', list)}
                >
                  <XIcon aria-hidden="true" />
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">{t('stocks.listsCard.notInAny')}</p>
        )}
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button type="button" variant="outline" size="sm">
              <PlusIcon aria-hidden="true" />
              {t('stocks.listsCard.addToList')}
              <ChevronDownIcon aria-hidden="true" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-0" align="start">
            {lists.length === 0 ? (
              <p className="p-3 text-sm">
                {t('stocks.listsCard.noLists')}{' '}
                <Link to="/lists" className="underline underline-offset-4">
                  {t('stocks.listsCard.createList')}
                </Link>
              </p>
            ) : others.length === 0 ? (
              <p className="p-3 text-sm">{t('stocks.listsCard.inEvery')}</p>
            ) : (
              <Command>
                <CommandInput placeholder={t('stocks.listsCard.findList')} />
                <CommandList>
                  <CommandEmpty>{t('stocks.listsCard.noMatch')}</CommandEmpty>
                  {others.map((list) => (
                    <CommandItem
                      key={list.id}
                      value={list.name}
                      onSelect={() => {
                        setOpen(false)
                        submit('add-to-list', list)
                      }}
                    >
                      {list.name}
                    </CommandItem>
                  ))}
                </CommandList>
              </Command>
            )}
          </PopoverContent>
        </Popover>
      </CardContent>
    </Card>
  )
}
