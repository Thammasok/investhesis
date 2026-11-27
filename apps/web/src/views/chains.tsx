import { useTranslation } from 'react-i18next'
import { ChartPieIcon } from 'lucide-react'
import { chainKey, groupChains } from '@investhesis/domain'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useFetchers, useLoaderData, useSearchParams } from 'react-router'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import type { ChainsData } from '@/features/chains/chains-data'
import { ChainRenameDialog, type RenameSaved } from '@/features/chains/components/chain-rename-dialog'
import { chainStocksHref, concentrationHref, planChains, readChainsView, type RenameTarget } from '@/features/chains/chains-model'
import { ChainSection } from '@/features/chains/components/chain-section'
import { AdviceNote, NoChainNote, RateNote } from '@/features/chains/components/chain-notes'
import { NoChainsCard, NoStocksCard } from '@/features/chains/components/chains-empty'
import { AddressNotes } from '@/features/stock-filters/address-notes'
import { FilterToolbar } from '@/features/stock-filters/filter-toolbar'
import { ScopeSelect } from '@/features/stock-filters/scope-select'
import { stocksInScope } from '@/features/stock-filters/scope'
import { useStockFilters } from '@/features/stock-filters/use-stock-filters'

const DESCRIPTION = 'Your stocks along each chain, from upstream to downstream.'
/** Parameters of this page that the filters leave alone. */
const KEEP = ['scope'] as const

/** Where focus goes once a save has re-read the page: the chain's Rename button, or its heading after a merge. */
type FocusRequest = { key: string; on: 'rename-button' | 'heading' }

const renameButtonOf = (key: string) =>
  Array.from(document.querySelectorAll<HTMLElement>('[data-chain-rename]')).find((b) => b.dataset.chainRename === key)

export function Component() {
  const { t } = useTranslation()
  const { stocks, lists, settings } = useLoaderData() as ChainsData
  const [params] = useSearchParams()
  const view = useMemo(() => readChainsView(params, lists), [params, lists])
  const scoped = useMemo(() => stocksInScope(stocks, view.scope), [stocks, view.scope])
  // Search and filters work inside the scope: the options count over it, and the grouping uses what passes.
  const filters = useStockFilters(scoped, { keep: KEEP, sort: false })
  const plan = useMemo(
    () => planChains({ stocks, scope: view.scope, filters: filters.deferredState, usdThbRate: settings.usdThbRate }),
    [stocks, view.scope, filters.deferredState, settings.usdThbRate],
  )
  const stocksById = useMemo(() => new Map(stocks.map((s) => [s.id, s])), [stocks])
  // All is the default, so it leaves the address.
  const changeScope = useCallback((scope: string) => filters.setKept({ scope: scope === 'all' ? null : scope }), [filters])

  const { chains, noChainIds, needsRate } = plan.result

  // Rename counts every stock of a chain, in view or not, so a merge is known before anything is sent (FR-009, FR-010).
  const allChains = useMemo(() => {
    const map = new Map<string, RenameTarget>()
    for (const c of groupChains({ stocks, usdThbRate: null }).chains) map.set(c.key, { key: c.key, title: c.title, count: c.count })
    return map
  }, [stocks])
  const [rename, setRename] = useState<{ open: boolean; chain: RenameTarget | null }>({ open: false, chain: null })
  const returnFocusTo = useRef<HTMLElement | null>(null)
  const headings = useRef(new Map<string, HTMLHeadingElement>())
  const [focusRequest, setFocusRequest] = useState<FocusRequest | null>(null)
  const focusDone = useRef<FocusRequest | null>(null)
  const openRename = (chain: RenameTarget, button: HTMLButtonElement) => {
    returnFocusTo.current = button
    setFocusRequest(null)
    setRename({ open: true, chain })
  }
  // The re-read of the stocks is a fetcher revalidation, so it is done when no fetcher is busy.
  const busy = useFetchers().some((f) => f.state !== 'idle')
  const saved = (result: RenameSaved) => {
    // The section is re-read under its new key, so focus waits for it (below) instead of returning to the old button.
    returnFocusTo.current = null
    setFocusRequest({ key: chainKey(result.name), on: result.merged ? 'heading' : 'rename-button' })
  }
  useEffect(() => {
    if (!focusRequest || focusDone.current === focusRequest) return
    const target = focusRequest.on === 'heading' ? headings.current.get(focusRequest.key) : renameButtonOf(focusRequest.key)
    if (target) {
      target.focus()
      focusDone.current = focusRequest
    } else if (!busy) {
      // The re-read is in and the chain is not on screen (a filter hides it): keep focus on the page, on its heading.
      document.querySelector<HTMLElement>('h1')?.focus()
      focusDone.current = focusRequest
    }
  }, [focusRequest, chains, busy])
  const noChainHref = chainStocksHref(view.scope, filters.state, null)

  const header = (
    <PageHeader
      title={t("nav.valueChains")}
      description={DESCRIPTION}
      actions={
        <Button variant="outline" className="w-full sm:w-auto" asChild>
          <Link to={concentrationHref(view.scope, filters.state, 'valueChain')}>
            <ChartPieIcon aria-hidden="true" />
            See concentration
          </Link>
        </Button>
      }
    />
  )

  if (stocks.length === 0) {
    return (
      <section className="space-y-6">
        {header}
        <NoStocksCard />
      </section>
    )
  }

  const inViewEmpty = plan.scopeCount > 0 && plan.inView.length === 0
  return (
    <section className="space-y-6">
      {header}
      <AddressNotes notes={[...view.notes, ...filters.notes]} />
      <div className="flex flex-wrap items-end gap-4">
        <ScopeSelect scope={view.scope} stocks={stocks} lists={lists} onChange={changeScope} id="chains-scope" />
        {plan.scopeCount > 0 ? (
          <div className="min-w-0 flex-1">
            <FilterToolbar filters={filters} />
          </div>
        ) : null}
      </div>
      {chains.length > 0 && noChainIds.length > 0 ? <NoChainNote count={noChainIds.length} href={noChainHref} /> : null}
      {needsRate ? <RateNote /> : null}
      {chains.length > 0 ? (
        <div className="space-y-6">
          {chains.map((chain) => (
            <ChainSection
              key={chain.key}
              chain={chain}
              stocksById={stocksById}
              stocksHref={chainStocksHref(view.scope, filters.state, chain.title)}
              onRename={(button) => openRename({ key: chain.key, title: chain.title, count: allChains.get(chain.key)?.count ?? chain.count }, button)}
              headingRef={(el) => {
                if (el) headings.current.set(chain.key, el)
                else headings.current.delete(chain.key)
              }}
            />
          ))}
        </div>
      ) : inViewEmpty ? null : (
        <NoChainsCard noChainCount={noChainIds.length} href={noChainHref} />
      )}
      <AdviceNote />
      <ChainRenameDialog
        open={rename.open}
        onOpenChange={(open) => setRename((r) => ({ ...r, open }))}
        chain={rename.chain}
        all={allChains}
        returnFocusTo={returnFocusTo}
        onSaved={saved}
      />
    </section>
  )
}
