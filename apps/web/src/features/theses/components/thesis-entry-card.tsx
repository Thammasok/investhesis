import { ArrowDownRightIcon, ArrowUpRightIcon, ClipboardCheckIcon, RefreshCwIcon } from 'lucide-react'
import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { formatUnitMoney } from '@/lib/number-format'
import { formatEditedDate, formatEntryDate, isEdited, needsClamp, typeLabel } from '../format'
import type { Thesis, ThesisType } from '../types'

const TYPE_ICON = {
  buy: ArrowUpRightIcon,
  sell: ArrowDownRightIcon,
  update: RefreshCwIcon,
  review: ClipboardCheckIcon,
} satisfies Record<ThesisType, unknown>

type ThesisEntryCardProps = {
  entry: Thesis
  /** The stock's current currency: a target price has no currency of its own (FR-006). */
  currency: 'USD' | 'THB'
  /** Edit and Delete buttons, supplied by the dialogs (T-006, T-007). */
  actions?: React.ReactNode
}

/** One dated entry. Every piece of text is rendered as text, so markup in a note is shown, never run. */
export function ThesisEntryCard({ entry, currency, actions }: ThesisEntryCardProps) {
  const { t } = useTranslation()
  const headingId = useId()
  const noteId = useId()
  const [expanded, setExpanded] = useState(false)
  const Icon = TYPE_ICON[entry.type]
  const clampable = needsClamp(entry.note)
  const target = formatUnitMoney(entry.targetPrice, currency)

  return (
    <article aria-labelledby={headingId} className="space-y-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span id={headingId} className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <Badge variant="secondary">
            <Icon className="size-3.5" aria-hidden="true" />
            {typeLabel(entry.type)}
          </Badge>
          <time dateTime={entry.date} className="text-sm font-medium tabular-nums">
            {formatEntryDate(entry.date)}
          </time>
          {isEdited(entry) ? (
            <span className="text-sm text-muted-foreground">{t('theses.entry.edited', { date: formatEditedDate(entry.updatedAt) })}</span>
          ) : null}
        </span>
        {actions ? <div className="ms-auto flex items-center gap-1">{actions}</div> : null}
      </div>
      <p
        id={noteId}
        className={cn('max-w-prose text-sm wrap-anywhere whitespace-pre-wrap', clampable && !expanded && 'line-clamp-8')}
      >
        {entry.note}
      </p>
      {clampable ? (
        <Button
          type="button"
          variant="link"
          size="sm"
          className="px-0"
          aria-expanded={expanded}
          aria-controls={noteId}
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? t('theses.entry.showLess') : t('theses.entry.showMore')}
        </Button>
      ) : null}
      {target !== null || entry.invalidation !== null ? (
        <dl className="grid gap-y-1 text-sm sm:grid-cols-[auto_1fr] sm:gap-x-4">
          {target !== null ? (
            <>
              <dt className="text-muted-foreground">{t('theses.entry.targetPrice')}</dt>
              <dd className="tabular-nums">{target}</dd>
            </>
          ) : null}
          {entry.invalidation !== null ? (
            <>
              <dt className="text-muted-foreground">{t('theses.entry.invalidation')}</dt>
              <dd className="max-w-prose wrap-anywhere whitespace-pre-wrap">{entry.invalidation}</dd>
            </>
          ) : null}
        </dl>
      ) : null}
    </article>
  )
}
