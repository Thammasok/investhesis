import { CircleAlertIcon, CopyIcon, PlusIcon } from 'lucide-react'
import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'
import type { PreviewRow, PreviewStatus } from '../types'

type Filter = 'all' | PreviewStatus

const FILTERS: { value: Filter; label: string; shown: string; empty: string }[] = [
  { value: 'all', label: 'All', shown: 'all', empty: '' },
  { value: 'new', label: 'New', shown: 'new', empty: 'No new rows.' },
  { value: 'duplicate', label: 'Duplicates', shown: 'duplicates', empty: 'No duplicate rows.' },
  { value: 'error', label: 'Errors', shown: 'errors', empty: 'No rows with errors.' },
]

/**
 * Status by icon and text, never colour alone. The error badge keeps `text-foreground` with a
 * destructive icon: the tinted destructive text measures below AA in the light theme.
 */
export function StatusBadge({ status }: { status: PreviewStatus }) {
  if (status === 'new')
    return (
      <Badge variant="secondary">
        <PlusIcon aria-hidden="true" />
        New
      </Badge>
    )
  if (status === 'duplicate')
    return (
      <Badge variant="outline">
        <CopyIcon aria-hidden="true" />
        Duplicate
      </Badge>
    )
  return (
    <Badge variant="destructive" className="text-foreground">
      <CircleAlertIcon aria-hidden="true" className="text-destructive" />
      Error
    </Badge>
  )
}

function Details({ row }: { row: PreviewRow }) {
  if (row.status === 'duplicate') return <span>Already saved</span>
  if (row.errors.length === 0) return null
  return (
    <ul className="space-y-0.5">
      {row.errors.map((e) => (
        <li key={`${e.path}:${e.message}`} className="break-words">{`${e.path}: ${e.message}`}</li>
      ))}
    </ul>
  )
}

/** The status filter and the scrollable table; below `md` market, name and details sit under the ticker. */
export function PreviewTable({ fileName, rows }: { fileName: string; rows: readonly PreviewRow[] }) {
  const [filter, setFilter] = useState<Filter>('all')
  const current = FILTERS.find((f) => f.value === filter) ?? FILTERS[0]
  const shown = filter === 'all' ? rows : rows.filter((r) => r.status === filter)

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span aria-hidden="true" className="text-sm font-medium">
          Show:
        </span>
        <RadioGroup
          aria-label="Show"
          value={filter}
          onValueChange={(value) => setFilter(value as Filter)}
          className="flex w-auto flex-wrap gap-4"
        >
          {FILTERS.map((f) => (
            <div key={f.value} className="flex items-center gap-2">
              <RadioGroupItem id={`import-filter-${f.value}`} value={f.value} />
              <Label htmlFor={`import-filter-${f.value}`} className="font-normal">
                {f.label}
              </Label>
            </div>
          ))}
        </RadioGroup>
      </div>
      {shown.length === 0 ? (
        <p className="rounded-lg border p-4 text-sm">{current.empty}</p>
      ) : (
        <div
          // A region that scrolls must be reachable and scrollable from the keyboard.
          tabIndex={0}
          role="region"
          aria-label="Rows of the file"
          className="max-h-[28rem] overflow-auto rounded-lg border focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <table className="w-full caption-bottom text-sm">
            <caption className="sr-only">{`Rows in ${fileName}, showing ${current.shown}`}</caption>
            <TableHeader className="sticky top-0 z-10 bg-background">
              <TableRow>
                <TableHead className="bg-background text-right">Row</TableHead>
                <TableHead className="bg-background">Ticker</TableHead>
                <TableHead className="hidden bg-background md:table-cell">Market</TableHead>
                <TableHead className="hidden bg-background md:table-cell">Name</TableHead>
                <TableHead className="bg-background">Status</TableHead>
                <TableHead className="hidden bg-background md:table-cell">Details</TableHead>
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
