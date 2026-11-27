import { useTranslation } from 'react-i18next'
import { ListIcon, PlusIcon } from 'lucide-react'
import { useRef, useState } from 'react'
import { useLoaderData } from 'react-router'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ListNameDialog } from '@/features/lists/components/list-name-dialog'
import { ListsTable } from '@/features/lists/components/lists-table'
import type { ListSummary } from '@/features/stocks/types'

export function Component() {
  const { t } = useTranslation()
  const { lists } = useLoaderData() as { lists: ListSummary[] }
  const [creating, setCreating] = useState(false)
  const newRef = useRef<HTMLButtonElement>(null)
  const newButton = (
    <Button ref={newRef} className="w-full sm:w-auto" onClick={() => setCreating(true)}>
      <PlusIcon aria-hidden="true" />
      {t('lists.newList')}
    </Button>
  )

  return (
    <section className="space-y-6">
      {lists.length === 0 ? (
        <>
          <PageHeader title={t('nav.lists')} />
          <Card className="items-center gap-3 py-12 text-center">
            <ListIcon className="size-8 text-muted-foreground" aria-hidden="true" />
            <h2 className="font-heading text-lg font-semibold">{t('lists.empty.title')}</h2>
            <p className="text-sm text-muted-foreground">{t('lists.empty.hint')}</p>
            {newButton}
          </Card>
        </>
      ) : (
        <>
          <PageHeader title={t('nav.lists')} description={t('lists.count', { count: lists.length, n: lists.length.toLocaleString('en-US') })} actions={newButton} />
          <ListsTable lists={lists} />
        </>
      )}
      <ListNameDialog mode="create" open={creating} onOpenChange={setCreating} returnFocusTo={newRef} />
    </section>
  )
}
