import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { Button } from '@/components/ui/button'

export function Component() {
  const { t } = useTranslation()
  return (
    <section className="space-y-4">
      <h1 className="font-heading text-2xl font-semibold">{t('shell.notFoundTitle')}</h1>
      <p className="text-muted-foreground">{t('shell.notFoundBody')}</p>
      <Button asChild>
        <Link to="/stocks">{t('shell.goToStocks')}</Link>
      </Button>
    </section>
  )
}
