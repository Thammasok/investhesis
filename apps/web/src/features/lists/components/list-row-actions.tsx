import { MoreHorizontalIcon, PencilIcon, Trash2Icon } from 'lucide-react'
import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import type { ListSummary } from '@/features/stocks/types'
import { DeleteListDialog } from './delete-list-dialog'
import { ListNameDialog } from './list-name-dialog'

/** The `⋯` menu of a lists-table row: Rename… and Delete…, each opening its dialog. */
export function ListRowActions({ list }: { list: ListSummary }) {
  const [dialog, setDialog] = useState<'rename' | 'delete' | null>(null)
  const menuRef = useRef<HTMLButtonElement>(null)
  const close = (open: boolean) => {
    if (!open) setDialog(null)
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button ref={menuRef} variant="ghost" size="icon-sm" aria-label={`Actions for ${list.name}`}>
            <MoreHorizontalIcon aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setDialog('rename')}>
            <PencilIcon aria-hidden="true" />
            Rename…
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onSelect={() => setDialog('delete')}>
            <Trash2Icon aria-hidden="true" />
            Delete…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ListNameDialog mode="rename" list={list} open={dialog === 'rename'} onOpenChange={close} returnFocusTo={menuRef} />
      <DeleteListDialog list={list} open={dialog === 'delete'} onOpenChange={close} returnFocusTo={menuRef} />
    </>
  )
}
