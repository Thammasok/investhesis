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
import { planView, readView, stocksInScope, type Measure } from '@/features/concentration/concentration-model'
import { AddressNotes } from '@/features/stock-filters/address-notes'
import { FilterToolbar } from '@/features/stock-filters/filter-toolbar'
import { SEARCH_ID } from '@/features/stock-filters/filter-toolbar-model'
import { NoMatches } from '@/features/stock-filters/no-matches'
import { useStockFilters } from '@/features/stock-filters/use-stock-filters'

const DESCRIPTION = 'How your stocks are spread across each lens.'
/** Parameters of this page that the filters leave alone. */
const KEEP = ['scope', 'lens', 'measure'] as const

export function Component() {
  const { stocks, lists, settings } = useLoaderData() as ConcentrationData
  const [params] = useSearchParams()
  const [settingsFocus, setSettingsFocus] = useState<'threshold' | 'rate' | null>(null)
  const settingsButton = useRef<HTMLButtonElement>(null)
  const openerRef = useRef<HTMLElement | null>(null)

  const view = useMemo(() => readView(params, lists), [params, lists])
  const scoped = useMemo(() => stocksInScope(stocks, view.scope), [stocks, view.scope])
  // Search and filters work inside the scope: the options count over it, and the grouping uses what passes.
  const filters = useStockFilters(scoped, { keep: KEEP, sort: false })
  const plan = useMemo(
    () => planView({ stocks, view, settings, filters: filters.deferredState }),
    [stocks, view, settings, filters.deferredState],
  )

  const change = useCallback(
    (next: { scope?: string; lensKey?: string; measure?: Measure }) => {
      // The full canonical address, with `replace`, so Back leaves the page instead of undoing each tweak.
      filters.setKept({
        scope: next.scope ?? view.scope,
        lens: next.lensKey ?? view.lens.key,
        measure: next.measure ?? view.measure,
      })
    },
    [filters, view],
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

  const emptyScope = plan.scopeCount === 0
  const noMatch = !emptyScope && plan.inScope.length === 0
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
            // The outline variant's dark border wins over focus-visible:border-ring, which would leave only the translucent ring.
            className="w-full sm:w-auto dark:focus-visible:border-ring"
            onClick={(e) => openSettings('threshold', e.currentTarget)}
          >
            <SlidersHorizontalIcon aria-hidden="true" />
            Settings
          </Button>
        }
      />
      <FallbackNotes notes={view.notes} />
      <Controls view={view} plan={plan} stocks={stocks} lists={lists} onChange={change} onSetRate={setRate} />
      {emptyScope ? null : (
        <div className="space-y-3">
          <AddressNotes notes={filters.notes} />
          <FilterToolbar filters={filters} countSuffix=" in scope" />
        </div>
      )}

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
            <Link to="/stocks" className="underline underline-offset-4 rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
              Mark holdings on a stock's page.
            </Link>
          </p>
        </Card>
      ) : noMatch ? (
        <NoMatches
          onClearAll={() => {
            filters.clearFilters(true)
            document.getElementById(SEARCH_ID)?.focus()
          }}
        />
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
