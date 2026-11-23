import { ChartPieIcon, PlusIcon, SlidersHorizontalIcon, UploadIcon } from 'lucide-react'
import { useCallback, useMemo, useRef, useState } from 'react'
import { Link, useLoaderData, useSearchParams } from 'react-router'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Controls } from '@/features/concentration/components/controls'
import { GroupTable } from '@/features/concentration/components/group-table'
import { AdviceNote, LeftOutNote, MultiValueNote } from '@/features/concentration/components/notes'
import { ConcentrationSettingsDialog } from '@/features/concentration/components/settings-dialog'
import { FallbackNotes, FlagSummary } from '@/features/concentration/components/summary'
import type { ConcentrationData } from '@/features/concentration/concentration-data'
import { planView, readView, viewSearch, type Measure } from '@/features/concentration/concentration-model'

const DESCRIPTION = 'How your stocks are spread across each lens.'

export function Component() {
  const { stocks, lists, settings } = useLoaderData() as ConcentrationData
  const [params, setParams] = useSearchParams()
  const [settingsFocus, setSettingsFocus] = useState<'threshold' | 'rate' | null>(null)
  const settingsButton = useRef<HTMLButtonElement>(null)
  const openerRef = useRef<HTMLElement | null>(null)

  const view = useMemo(() => readView(params, lists), [params, lists])
  const plan = useMemo(() => planView({ stocks, view, settings }), [stocks, view, settings])

  const change = useCallback(
    (next: { scope?: string; lensKey?: string; measure?: Measure }) => {
      // The full canonical address, with `replace`, so Back leaves the page instead of undoing each tweak.
      setParams(
        viewSearch({
          scope: next.scope ?? view.scope,
          lens: { key: next.lensKey ?? view.lens.key },
          measure: next.measure ?? view.measure,
        }),
        { replace: true },
      )
    },
    [setParams, view],
  )
  const openSettings = (focus: 'threshold' | 'rate', opener: HTMLElement | null) => {
    openerRef.current = opener
    setSettingsFocus(focus)
  }

  if (stocks.length === 0) {
    return (
      <section className="space-y-6">
        <PageHeader title="Concentration" description={DESCRIPTION} />
        <Card className="items-center gap-3 py-12 text-center">
          <ChartPieIcon className="size-8 text-muted-foreground" aria-hidden="true" />
          <h2 className="font-heading text-lg font-semibold">Nothing to group yet</h2>
          <p className="text-sm text-muted-foreground">Add stocks to see how they are spread across each lens.</p>
          <div className="flex flex-wrap justify-center gap-2">
            <Button asChild>
              <Link to="/stocks/new">
                <PlusIcon aria-hidden="true" />
                Add stock
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to="/import-export">
                <UploadIcon aria-hidden="true" />
                Import
              </Link>
            </Button>
          </div>
        </Card>
        <AdviceNote />
      </section>
    )
  }

  const emptyScope = plan.inScope.length === 0
  const setRate = () => openSettings('rate', settingsButton.current)
  return (
    <section className="space-y-6">
      <PageHeader
        title="Concentration"
        description={DESCRIPTION}
        actions={
          <Button
            ref={settingsButton}
            variant="outline"
            className="w-full sm:w-auto"
            onClick={(e) => openSettings('threshold', e.currentTarget)}
          >
            <SlidersHorizontalIcon aria-hidden="true" />
            Settings
          </Button>
        }
      />
      <FallbackNotes notes={view.notes} />
      <Controls view={view} plan={plan} stocks={stocks} lists={lists} onChange={change} onSetRate={setRate} />

      {emptyScope && view.list ? (
        <Card className="items-center gap-3 py-10 text-center">
          <h2 className="font-heading text-lg font-semibold">{`${view.list.name} has no stocks yet.`}</h2>
          <Button variant="outline" asChild>
            <Link to={`/lists/${view.list.id}`}>{`Open ${view.list.name}`}</Link>
          </Button>
        </Card>
      ) : emptyScope ? (
        <Card className="items-center gap-3 py-10 text-center">
          <p className="text-sm">
            No stock is marked as held yet.{' '}
            <Link to="/stocks" className="underline underline-offset-4">
              Mark holdings on a stock's page.
            </Link>
          </p>
        </Card>
      ) : (
        <>
          <FlagSummary plan={plan} settings={settings} />
          {plan.measure === 'value' && plan.value.available && plan.value.zeroTotal ? (
            <p className="text-sm text-muted-foreground">Every valued stock has a cost of 0, so there are no shares.</p>
          ) : null}
          <GroupTable plan={plan} view={view} stocks={stocks} settings={settings} />
          {plan.result.multiValue ? <MultiValueNote lensKey={view.lens.key} /> : null}
          {plan.measure === 'value' ? <LeftOutNote plan={plan} stocks={stocks} onSetRate={setRate} /> : null}
        </>
      )}
      <AdviceNote />
      <ConcentrationSettingsDialog
        open={settingsFocus !== null}
        onOpenChange={(open) => {
          if (!open) setSettingsFocus(null)
        }}
        settings={settings}
        initialFocus={settingsFocus ?? 'threshold'}
        returnFocusTo={openerRef}
      />
    </section>
  )
}
