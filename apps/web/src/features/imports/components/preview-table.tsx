import { CircleAlertIcon, CopyIcon, PlusIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { getLanguage } from '@/i18n/language'
import { cn } from '@/lib/utils'
import { rowProblemText } from '../row-problem'
import type { PreviewRow, PreviewStatus } from '../types'

type Filter = 'all' | PreviewStatus

const FILTERS: Filter[] = ['all', 'new', 'duplicate', 'error']

/**
 * Status by icon and text, never colour alone. The error badge keeps `text-foreground` with a
 * destructive icon: the tinted destructive text measures below AA in the light theme.
 */
export function StatusBadge({ status }: { status: PreviewStatus }) {
  const { t } = useTranslation()
  if (status === 'new')
    return (
      <Badge variant="secondary">
        <PlusIcon aria-hidden="true" />
        {t('imports.preview.badge.new')}
      </Badge>
    )
  if (status === 'duplicate')
    return (
      <Badge variant="outline">
        <CopyIcon aria-hidden="true" />
        {t('imports.preview.badge.duplicate')}
      </Badge>
    )
  return (
    <Badge variant="destructive" className="text-foreground">
      <CircleAlertIcon aria-hidden="true" className="text-destructive" />
      {t('imports.preview.badge.error')}
    </Badge>
  )
}

function Details({ row }: { row: PreviewRow }) {
  const { t } = useTranslation()
  const lang = getLanguage()
  if (row.status === 'duplicate') return <span>{t('imports.preview.alreadySaved')}</span>
  if (row.errors.length === 0) return null
  return (
    <ul className="space-y-0.5">
      {row.errors.map((e) => (
        <li key={`${e.path}:${e.message}`} className="break-words">{rowProblemText(e, lang)}</li>
      ))}
    </ul>
  )
}

/** The status filter and the scrollable table; below `md` market, name and details sit under the ticker. */
export function PreviewTable({ fileName, rows }: { fileName: string; rows: readonly PreviewRow[] }) {
  const { t } = useTranslation()
  const [filter, setFilter] = useState<Filter>('all')
  const shown = filter === 'all' ? rows : rows.filter((r) => r.status === filter)

  // Whether the rows overflow the box, re-checked when the rows or the box change size.
  const scroller = useRef<HTMLDivElement>(null)
  const [scrolls, setScrolls] = useState(false)
  useEffect(() => {
    const el = scroller.current
    if (!el) return setScrolls(false)
    const measure = () => setScrolls(el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [shown.length, filter])

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span aria-hidden="true" className="text-sm font-medium">
          {t('imports.preview.showColon')}
        </span>
        <RadioGroup
          aria-label={t('imports.preview.show')}
          value={filter}
          onValueChange={(value) => setFilter(value as Filter)}
          className="flex w-auto flex-wrap gap-4"
        >
          {FILTERS.map((f) => (
            <div key={f} className="flex items-center gap-2">
              <RadioGroupItem id={`import-filter-${f}`} value={f} />
              <Label htmlFor={`import-filter-${f}`} className="font-normal">
                {t(`imports.preview.filters.${f}`)}
              </Label>
            </div>
          ))}
        </RadioGroup>
      </div>
      {shown.length === 0 ? (
        <p className="rounded-lg border p-4 text-sm">{filter === 'all' ? '' : t(`imports.preview.empty.${filter}`)}</p>
      ) : (
        <div
          ref={scroller}
          // A region that scrolls must be reachable and scrollable from the keyboard; one that does not is no tab stop.
          {...(scrolls ? { tabIndex: 0, role: 'region', 'aria-label': t('imports.preview.region') } : {})}
          className="max-h-[28rem] overflow-auto rounded-lg border focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <table className="w-full caption-bottom text-sm">
            <caption className="sr-only">{t('imports.preview.caption', { fileName, shown: t(`imports.preview.shown.${filter}`) })}</caption>
            <TableHeader className="sticky top-0 z-10 bg-background">
              <TableRow>
                <TableHead className="bg-background text-right">{t('imports.preview.columns.row')}</TableHead>
                <TableHead className="bg-background">{t('imports.preview.columns.ticker')}</TableHead>
                <TableHead className="hidden bg-background md:table-cell">{t('imports.preview.columns.market')}</TableHead>
                <TableHead className="hidden bg-background md:table-cell">{t('imports.preview.columns.name')}</TableHead>
                <TableHead className="bg-background">{t('imports.preview.columns.status')}</TableHead>
                <TableHead className="hidden bg-background md:table-cell">{t('imports.preview.columns.details')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.map((row) => (
                <TableRow key={row.rowNumber} className={cn('align-top', row.status === 'error' && 'bg-destructive/5')}>
                  <TableCell className="text-right tabular-nums">{row.rowNumber}</TableCell>
                  <TableCell className="font-medium">
                    {row.ticker}
                    <div className="space-y-0.5 text-sm font-normal md:hidden">
                      <div className="break-words">{`${row.market} · ${row.name}`}</div>
                      <Details row={row} />
                    </div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">{row.market}</TableCell>
                  <TableCell className="hidden max-w-64 whitespace-normal break-words md:table-cell">{row.name}</TableCell>
                  <TableCell>
                    <StatusBadge status={row.status} />
                  </TableCell>
                  <TableCell className="hidden max-w-80 whitespace-normal md:table-cell">
                    <Details row={row} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </table>
        </div>
      )}
    </div>
  )
}
