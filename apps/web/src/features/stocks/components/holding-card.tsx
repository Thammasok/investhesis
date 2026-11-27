import { PencilIcon, PlusIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useFetcher } from 'react-router'
import { toast } from 'sonner'
import { parseDecimal } from '@investhesis/domain'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { i18n } from '@/i18n/i18n'
import { formatMoney, formatShares, formatUnitMoney } from '@/lib/number-format'
import type { HoldingActionResult } from '../stocks-data'
import type { Holding, Stock } from '../types'
import { HoldingDialog } from './holding-dialog'

/** Shares times average cost, exact: both have 4 places, so the product has 8; shown to the cent, half up. `null` unless both are set. */
function holdingCost(holding: Holding): string | null {
  if (holding.shares === null || holding.averageCost === null) return null
  const shares = parseDecimal(holding.shares, 4)
  const cost = parseDecimal(holding.averageCost, 4)
  if (shares === null || cost === null) return null
  return formatMoney(shares * cost, 8, holding.costCurrency)
}

const UNDO_MS = 5000

/** The Holding card: not held, held without amounts, or held with figures. Edits happen in a dialog. */
export function HoldingCard({ stock }: { stock: Stock }) {
  const { t } = useTranslation()
  const undoFetcher = useFetcher<HoldingActionResult>()
  const [open, setOpen] = useState(false)
  const opener = useRef<HTMLButtonElement | null>(null)
  const markRef = useRef<HTMLButtonElement>(null)
  const editRef = useRef<HTMLButtonElement>(null)
  const restoreFocus = useRef(false)
  const handledUndo = useRef<unknown>(null)
  const holding = stock.holding

  // The page revalidates behind the closed dialog, so the opener can vanish (Mark as held after a save,
  // Edit after Stop holding). When that drops focus on the body, hand it to the button that replaced it.
  useEffect(() => {
    if (restoreFocus.current && !open && (document.activeElement === document.body || document.activeElement === null))
      (holding ? editRef.current : markRef.current)?.focus()
  }, [holding, open])

  useEffect(() => {
    const result = undoFetcher.data
    if (!result || handledUndo.current === result) return
    handledUndo.current = result
    if (!result.ok) toast.error(i18n.t('holdings.restoreFailed'))
  }, [undoFetcher.data])

  const openFrom = (event: React.MouseEvent<HTMLButtonElement>) => {
    opener.current = event.currentTarget
    restoreFocus.current = false
    setOpen(true)
  }

  const done = (result: Extract<HoldingActionResult, { ok: true }>, previous: Holding | null) => {
    if (result.intent === 'set-holding') {
      toast.success(previous ? i18n.t('holdings.saved') : i18n.t('holdings.markedHeld', { ticker: result.ticker }))
    } else {
      toast(i18n.t('holdings.noLongerHeld', { ticker: result.ticker }), {
        duration: UNDO_MS,
        action: {
          label: i18n.t('common.undo'),
          onClick: () =>
            undoFetcher.submit(
              {
                intent: 'set-holding',
                ticker: result.ticker,
                undo: '1',
                shares: previous?.shares ?? '',
                averageCost: previous?.averageCost ?? '',
                costCurrency: previous?.costCurrency ?? stock.currency,
              },
              { method: 'post' },
            ),
        },
      })
    }
    setOpen(false)
  }

  const cost = holding ? holdingCost(holding) : null
  const shares = holding ? formatShares(holding.shares) : null
  const average = holding ? formatUnitMoney(holding.averageCost, holding.costCurrency) : null

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{t('holdings.title')}</h2>
        </CardTitle>
        {holding ? (
          <CardAction>
            <Button ref={editRef} type="button" variant="outline" size="sm" onClick={openFrom}>
              <PencilIcon aria-hidden="true" />
              {t('holdings.edit')}
            </Button>
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {holding ? (
          <>
            <Badge variant="secondary" className="whitespace-nowrap">{t('holdings.held')}</Badge>
            {shares !== null || average !== null ? (
              <dl className="grid grid-cols-[minmax(7rem,auto)_1fr] gap-x-4 gap-y-2">
                {shares !== null ? <Row label={t('holdings.shares')} value={shares} /> : null}
                {average !== null ? <Row label={t('holdings.averageCost')} value={average} /> : null}
                {cost !== null ? <Row label={t('holdings.cost')} value={cost} /> : null}
              </dl>
            ) : null}
            {cost === null ? (
              <p className="text-muted-foreground">
                {shares === null && average === null ? <span className="block text-foreground">{t('holdings.amountNotEntered')}</span> : null}
                {t('holdings.addFigures')}
              </p>
            ) : null}
          </>
        ) : (
          <>
            <p>{t('holdings.notHeld')}</p>
            <Button ref={markRef} type="button" variant="outline" size="sm" onClick={openFrom}>
              <PlusIcon aria-hidden="true" />
              {t('holdings.markAsHeld')}
            </Button>
          </>
        )}
      </CardContent>
      <HoldingDialog
        stock={stock}
        open={open}
        onOpenChange={setOpen}
        onDone={done}
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          restoreFocus.current = true
          if (opener.current?.isConnected) opener.current.focus()
          else (holding ? editRef.current : markRef.current)?.focus()
        }}
      />
    </Card>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="tabular-nums [overflow-wrap:anywhere]">{value}</dd>
    </>
  )
}
