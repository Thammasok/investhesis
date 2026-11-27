import { useTranslation } from 'react-i18next'
import { useLoaderData, useSearchParams } from 'react-router'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ImportWizard } from '@/features/imports/import-wizard'
import type { ImportPageData } from '@/features/imports/imports-data'
import { useRouteDialogClose } from '@/hooks/use-route-dialog-close'
import type { ApiClient } from '@/lib/api-client'

/** `/import-export/import`: the wizard as a dialog; the route hands it the client it calls the API with. */
export function createImportDialog(api: ApiClient) {
  return function ImportDialog() {
    const { t } = useTranslation()
    const { lists } = useLoaderData() as ImportPageData
    const [params] = useSearchParams()
    const close = useRouteDialogClose('/import-export')
    return (
      <Dialog open onOpenChange={(open) => (open ? undefined : close())}>
        {/* An outside click would throw away the chosen file, so only Esc and the buttons close it. */}
        <DialogContent className="flex max-h-[90dvh] flex-col gap-4 overflow-hidden sm:max-w-5xl" onInteractOutside={(event) => event.preventDefault()}>
          <DialogHeader>
            <DialogTitle>{t('imports.title')}</DialogTitle>
            <DialogDescription>{t('imports.dialogDescription')}</DialogDescription>
          </DialogHeader>
          <div className="-mx-4 min-h-0 flex-1 overflow-y-auto px-4">
            <ImportWizard api={api} lists={lists} initialListId={params.get('listId') ?? undefined} inDialog />
          </div>
        </DialogContent>
      </Dialog>
    )
  }
}
