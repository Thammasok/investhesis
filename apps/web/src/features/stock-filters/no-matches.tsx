import { SearchXIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

/** Shown instead of the table when search and filters leave nothing (FR-008). */
export function NoMatches({ onClearAll }: { onClearAll: () => void }) {
  const { t } = useTranslation()
  return (
    <Card className="items-center gap-3 py-12 text-center">
      <SearchXIcon className="size-8 text-muted-foreground" aria-hidden="true" />
      <h2 className="font-heading text-lg font-semibold">{t('filters.noMatches.title')}</h2>
      <p className="text-sm text-muted-foreground">{t('filters.noMatches.hint')}</p>
      <Button variant="outline" onClick={onClearAll}>
        {t('filters.noMatches.clearAll')}
      </Button>
    </Card>
  )
}
