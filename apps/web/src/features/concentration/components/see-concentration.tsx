import type { FilterState } from '@investhesis/domain'
import { ChartPieIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { Button } from '@/components/ui/button'
import { concentrationHref } from '../concentration-model'

/** The link from a stocks table to the concentration of the same stocks, with the same search and filters (FR-009). */
export function SeeConcentration({ scope, filters }: { scope: string; filters: FilterState }) {
  const { t } = useTranslation()
  return (
    <Button variant="link" size="sm" className="h-auto min-h-6 p-0" asChild>
      <Link to={concentrationHref(scope, filters)}>
        <ChartPieIcon aria-hidden="true" />
        {t('concentration.seeConcentration')}
      </Link>
    </Button>
  )
}
