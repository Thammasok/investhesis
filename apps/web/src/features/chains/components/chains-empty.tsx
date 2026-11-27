import { NetworkIcon, PlusIcon, UploadIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

/** FR-012, no saved stocks. */
export function NoStocksCard() {
  const { t } = useTranslation()
  return (
    <Card className="items-center gap-3 py-12 text-center">
      <NetworkIcon className="size-8 text-muted-foreground" aria-hidden="true" />
      <h2 className="font-heading text-lg font-semibold">{t('chains.empty.noStocksTitle')}</h2>
      <p className="text-sm text-muted-foreground">{t('chains.empty.noStocksHint')}</p>
      <div className="flex flex-wrap justify-center gap-2">
        <Button asChild>
          <Link to="/stocks/new">
            <PlusIcon aria-hidden="true" />
            {t('chains.empty.addStock')}
          </Link>
        </Button>
        <Button variant="outline" asChild>
          <Link to="/import-export">
            <UploadIcon aria-hidden="true" />
            {t('chains.empty.import')}
          </Link>
        </Button>
      </div>
    </Card>
  )
}

/** FR-012, stocks in scope but none in view has a chain. `noChainCount` is 0 for an empty scope: no button then. */
export function NoChainsCard({ noChainCount, href }: { noChainCount: number; href: string }) {
  const { t } = useTranslation()
  return (
    <Card className="items-center gap-3 px-4 py-12 text-center">
      <NetworkIcon className="size-8 text-muted-foreground" aria-hidden="true" />
      <h2 className="font-heading text-lg font-semibold">{t('chains.empty.noChainsTitle')}</h2>
      <p className="max-w-prose text-sm text-muted-foreground">
        {t('chains.empty.noChainsHint')}
      </p>
      {noChainCount > 0 ? (
        <Button variant="outline" asChild>
          <Link to={href}>{t('chains.empty.showNoChain', { count: noChainCount, n: noChainCount })}</Link>
        </Button>
      ) : null}
    </Card>
  )
}
