import { ChevronDownIcon, CopyIcon, DatabaseIcon, DownloadIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { i18n } from '@/i18n/i18n'
import type { ListSummary, Stock } from '@/features/stocks/types'
import { saveFile } from '@/lib/save-file'
import { exportFileName } from './export-file-name'
import { csvOfRows, listNameMap, tableOfRows } from './export-rows'

const stocksLabel = (count: number) => i18n.t('exports.menu.stockCount', { count, n: count.toLocaleString('en-US') })
const rowsLabel = (count: number) => i18n.t('exports.menu.rowCount', { count, n: count.toLocaleString('en-US') })

type ExportMenuProps = {
  /** The rows on screen, in the order on screen (filtered and sorted). */
  stocks: readonly Stock[]
  /** Every list, to name the lists each stock is in. */
  lists: readonly Pick<ListSummary, 'id' | 'name'>[]
  /** The list page's name for the file; `null` on the Stocks page. */
  listName?: string | null
}

/** Export of the rows shown: Download CSV, Copy as table, and a way to the full backup (ux-design.md: Stocks). */
export function ExportMenu({ stocks, lists, listName = null }: ExportMenuProps) {
  const { t } = useTranslation()
  const none = stocks.length === 0

  const download = () => {
    const blob = new Blob([csvOfRows(stocks, listNameMap(lists))], { type: 'text/csv;charset=utf-8' })
    saveFile(blob, exportFileName(listName))
  }

  // `writeText` is called inside the click that chose the item, before anything is awaited: some browsers
  // refuse the clipboard once the user gesture is over.
  const copy = () => {
    const text = tableOfRows(stocks, listNameMap(lists))
    const done = () => toast.success(t('exports.menu.copied', { rows: rowsLabel(stocks.length) }))
    const refused = () => toast.error(t('exports.menu.copyRefused'))
    try {
      const write = navigator.clipboard?.writeText(text)
      if (!write) refused()
      else write.then(done, refused)
    } catch {
      refused()
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline">
          <DownloadIcon aria-hidden="true" />
          {t('exports.menu.trigger')}
          <ChevronDownIcon aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {none ? <DropdownMenuLabel>{t('exports.menu.none')}</DropdownMenuLabel> : null}
        <DropdownMenuItem disabled={none} onSelect={download}>
          <DownloadIcon aria-hidden="true" />
          {t('exports.menu.downloadCsv')}
          <span className="text-muted-foreground">({stocksLabel(stocks.length)})</span>
        </DropdownMenuItem>
        <DropdownMenuItem disabled={none} onSelect={copy}>
          <CopyIcon aria-hidden="true" />
          {t('exports.menu.copyTable')}
          <span className="text-muted-foreground">({rowsLabel(stocks.length)})</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/import-export">
            <DatabaseIcon aria-hidden="true" />
            {t('exports.menu.backup')}
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
