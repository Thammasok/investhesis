import { InfoIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { stocksLabel } from '../chains-model'

/** FR-006: how many stocks in view have no chain, and a link to them. */
export function NoChainNote({ count, href }: { count: number; href: string }) {
  const { t } = useTranslation()
  return (
    <Alert role="status">
      <InfoIcon aria-hidden="true" />
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <p>{t('chains.notes.noChain', { count, stocks: stocksLabel(count) })}</p>
        <Button variant="link" size="sm" className="h-auto p-0" asChild>
          <Link to={href}>{t('chains.notes.showThem')}</Link>
        </Button>
      </div>
    </Alert>
  )
}

/** FR-005: a held USD stock with amounts has no rate to value it, so it is left out. Shown once for the page. */
export function RateNote() {
  const { t } = useTranslation()
  return (
    <Alert role="status">
      <InfoIcon aria-hidden="true" />
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <p>{t('chains.notes.rate')}</p>
        <Button variant="link" size="sm" className="h-auto p-0" asChild>
          <Link to="/concentration">{t('chains.notes.setRate')}</Link>
        </Button>
      </div>
    </Alert>
  )
}

/** FR-013: the brief's constraint, as on the concentration page. */
export function AdviceNote() {
  const { t } = useTranslation()
  return <p className="text-sm text-muted-foreground">{t('chains.notes.advice')}</p>
}
