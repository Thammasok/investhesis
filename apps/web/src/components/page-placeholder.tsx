import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

type PagePlaceholderProps = { title: string; description: string }

/** Stand-in for a page that isn't built yet. Focuses its heading so route changes are announced. */
export function PagePlaceholder({ title, description }: PagePlaceholderProps) {
  const { t } = useTranslation()
  const headingRef = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    document.title = `${title} · Investhesis`
    headingRef.current?.focus()
  }, [title])

  return (
    <section className="space-y-6">
      <h1 ref={headingRef} tabIndex={-1} className="font-heading text-2xl font-semibold outline-none">
        {title}
      </h1>
      <Card>
        <CardHeader>
          <CardTitle>{t('placeholder.comingSoon')}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          {t('placeholder.body')}
        </CardContent>
      </Card>
    </section>
  )
}
