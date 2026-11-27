import {
  CURRENCY_BY_MARKET,
  EXCHANGES_BY_MARKET,
  INDEXES_BY_MARKET,
  LENS_VALUES,
  MARKET_LABELS,
  type Language,
  type Market,
} from '@investhesis/domain'
import { Loader2Icon, TriangleAlertIcon } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useFetcher } from 'react-router'
import { toast } from 'sonner'
import { i18n as i18nInstance } from '@/i18n/i18n'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import type { StockFormResult } from '../stocks-data'
import {
  checkValues,
  costCurrencyOf,
  createBody,
  defaultCycle,
  emptyValues,
  firstInvalid,
  patchBody,
  splitServerErrors,
  valuesFromStock,
  type FieldErrors,
  type FieldName,
  type FormValues,
  fieldLabelOf,
} from '../stock-form-model'
import { useLanguage } from '../use-language'
import type { ListSummary, Stock } from '../types'
import { CheckGroup, FieldMessage, Required, SelectField } from './form-controls'
import { errorProps } from './form-field-props'
import { TagInput } from './tag-input'

type StockFormProps =
  | { mode: 'create'; lists: ListSummary[]; inDialog?: boolean; onCancel?: () => void }
  | { mode: 'edit'; stock: Stock; inDialog?: never; onCancel?: never }

type FormAlert = { kind: 'exists'; existingStockId: string } | { kind: 'missing' } | { kind: 'message'; text: string }
type Focus = { target: FieldName | 'alert'; n: number }

const half = 'md:col-span-2'

/** What the form shows for an answer that was not a success. */
function interpret(result: StockFormResult, mode: StockFormProps['mode'], lang: Language): { alert: FormAlert | null; errors?: FieldErrors; focus: FieldName | 'alert' } {
  if (result.code === 'stock_exists' && result.existingStockId) {
    return { alert: { kind: 'exists', existingStockId: result.existingStockId }, focus: 'alert' }
  }
  if (result.status === 404) {
    return {
      alert:
        mode === 'edit'
          ? { kind: 'missing' }
          : { kind: 'message', text: i18nInstance.t('stocks.form.listGone', { lng: lang }) },
      focus: 'alert',
    }
  }
  if (result.status === 400 && result.errors.length > 0) {
    const { fields, rest } = splitServerErrors(result.errors, lang)
    return {
      alert: rest.length > 0 ? { kind: 'message', text: rest.join('. ') } : null,
      errors: fields,
      focus: rest.length > 0 ? 'alert' : (firstInvalid(fields) ?? 'alert'),
    }
  }
  const text =
    result.status === 0
      ? i18nInstance.t('stocks.form.offline', { lng: lang })
      : i18nInstance.t('stocks.form.saveFailed', { lng: lang })
  return { alert: { kind: 'message', text }, focus: 'alert' }
}

/** Add stock and Edit stock (ux-design.md): one form, the market and ticker locked in edit mode. */
export function StockForm(props: StockFormProps) {
  const { t } = useTranslation()
  const lang = useLanguage()
  const stock = props.mode === 'edit' ? props.stock : undefined
  const fetcher = useFetcher<StockFormResult>()
  const formRef = useRef<HTMLFormElement>(null)
  const alertRef = useRef<HTMLDivElement>(null)
  const sending = useRef(false)
  const [values, setValues] = useState<FormValues>(() => (stock ? valuesFromStock(stock) : emptyValues()))
  const [errors, setErrors] = useState<FieldErrors>({})
  const [alert, setAlert] = useState<FormAlert | null>(null)
  const [focus, setFocus] = useState<Focus | null>(null)
  const [answered, setAnswered] = useState<unknown>(null)
  const pending = fetcher.state !== 'idle'
  const { market } = values
  const ticker = stock?.ticker ?? values.ticker

  const requestFocus = (target: FieldName | 'alert') => setFocus((f) => ({ target, n: (f?.n ?? 0) + 1 }))

  useEffect(() => {
    if (!focus) return
    if (focus.target === 'alert') alertRef.current?.focus()
    else formRef.current?.querySelector<HTMLElement>(`[data-field="${focus.target}"]`)?.focus()
  }, [focus])

  useEffect(() => {
    if (fetcher.state === 'idle') sending.current = false
  }, [fetcher.state])

  // A new answer from the action becomes the form's alert and field errors (adjusted during render, not in an effect).
  if (fetcher.data && fetcher.data !== answered) {
    const outcome = interpret(fetcher.data, props.mode, lang)
    setAnswered(fetcher.data)
    setAlert(outcome.alert)
    if (outcome.errors) setErrors(outcome.errors)
    requestFocus(outcome.focus)
  }

  const set = <K extends keyof FormValues>(key: K, value: FormValues[K]) => {
    setValues((v) => ({ ...v, [key]: value }))
    if (key in errors) setErrors(({ [key as FieldName]: _gone, ...rest }) => rest)
    if (key === 'held' && value === false) setErrors(({ holdingShares: _s, holdingAverageCost: _c, ...rest }) => rest)
  }

  const setMarket = (next: Market) => {
    setValues((v) => ({ ...v, market: next, exchange: '', indexMembership: [], setIndustryGroup: '' }))
    setErrors(({ market: _m, exchange: _e, indexMembership: _i, setIndustryGroup: _s, ...rest }) => rest)
  }

  const setValueChain = (text: string) => {
    setValues((v) => ({
      ...v,
      valueChain: text,
      // A position other than None needs a chain name (FR-003); clearing the name resets it.
      valueChainPosition: text.trim() === '' && v.valueChainPosition !== 'None' ? '' : v.valueChainPosition,
    }))
    setErrors(({ valueChain: _c, valueChainPosition: _p, ...rest }) => rest)
  }

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (sending.current) return
    setAlert(null)
    const checked = checkValues(values, lang)
    if (!checked.ok) {
      setErrors(checked.errors)
      const first = firstInvalid(checked.errors)
      if (first) requestFocus(first)
      return
    }
    setErrors({})
    const body = stock
      ? patchBody(checked.input, values, stock, checked.holding)
      : createBody(checked.input, values, values.economicCycle !== '', checked.holding)
    if (stock && Object.keys(body).length === 0) {
      toast(t('stocks.form.noChanges'))
      return
    }
    sending.current = true
    void fetcher.submit(body as Parameters<typeof fetcher.submit>[0], { method: stock ? 'patch' : 'post', encType: 'application/json' })
  }

  const exchanges = market ? EXCHANGES_BY_MARKET[market] : []
  const indexes = market ? INDEXES_BY_MARKET[market] : []
  const chainNamed = values.valueChain.trim() !== ''
  const cycleDefault = values.economicCycle === '' ? defaultCycle(values.gicsSector) : ''
  const lists = props.mode === 'create' ? props.lists : []
  const costCurrency = costCurrencyOf(values)

  return (
    <form ref={formRef} onSubmit={onSubmit} noValidate className={props.inDialog ? 'space-y-6' : 'max-w-4xl space-y-6'}>
      {alert ? (
        <Alert ref={alertRef} variant="destructive" tabIndex={-1} className="outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
          <TriangleAlertIcon aria-hidden="true" />
          <AlertDescription>
            {alert.kind === 'exists' ? (
              <>
                {t('stocks.form.alreadySaved', { ticker, market })}{' '}
                <Link to={`/stocks/${encodeURIComponent(alert.existingStockId)}`} className="underline">
                  {t('stocks.form.open', { ticker })}
                </Link>
              </>
            ) : alert.kind === 'missing' ? (
              <>
                {t('stocks.form.gone')}{' '}
                <Link to="/stocks" className="underline">
                  {t('stocks.form.goToStocks')}
                </Link>
              </>
            ) : (
              alert.text
            )}
          </AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>
            <h2>{t('stocks.form.identity')}</h2>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <FieldGroup className="grid gap-4 md:grid-cols-2">
            {stock ? (
              <>
                <div className="space-y-0.5">
                  <p className="text-sm font-medium">{fieldLabelOf('market', lang)}</p>
                  <p className="text-sm">{MARKET_LABELS[lang][stock.market]}</p>
                </div>
                <div className="space-y-0.5">
                  <p className="text-sm font-medium">{fieldLabelOf('ticker', lang)}</p>
                  <p className="font-mono text-sm">{stock.ticker}</p>
                </div>
                <FieldDescription className={half}>{t('stocks.form.lockedNote')}</FieldDescription>
              </>
            ) : (
              <>
                <FieldSet data-invalid={errors.market ? true : undefined}>
                  <FieldLegend variant="label" id="stock-market-legend">
                    {fieldLabelOf('market', lang)}
                    <Required />
                  </FieldLegend>
                  <RadioGroup
                    value={market}
                    onValueChange={(next) => setMarket(next as Market)}
                    aria-required="true"
                    aria-labelledby="stock-market-legend"
                    {...errorProps('market', errors.market)}
                    className="flex gap-4"
                  >
                    {(['US', 'TH'] as const).map((m, index) => (
                      <Field key={m} orientation="horizontal" className="w-auto">
                        <RadioGroupItem value={m} id={`stock-market-${m}`} data-field={index === 0 ? 'market' : undefined} />
                        <FieldLabel htmlFor={`stock-market-${m}`} className="font-normal">
                          {MARKET_LABELS[lang][m]}
                        </FieldLabel>
                      </Field>
                    ))}
                  </RadioGroup>
                  <FieldMessage name="market" error={errors.market} />
                </FieldSet>
                <Field data-invalid={errors.ticker ? true : undefined}>
                  <FieldLabel htmlFor="stock-ticker">
                    {fieldLabelOf('ticker', lang)}
                    <Required />
                  </FieldLabel>
                  <Input
                    id="stock-ticker"
                    data-field="ticker"
                    value={values.ticker}
                    // Upper case as typed (ASCII only); the domain rule normalises again on submit.
                    onChange={(e) => set('ticker', e.target.value.replace(/[a-z]/g, (c) => c.toUpperCase()))}
                    autoComplete="off"
                    maxLength={12}
                    aria-required="true"
                    className="max-w-40 font-mono uppercase"
                    {...errorProps('ticker', errors.ticker)}
                  />
                  <FieldMessage name="ticker" error={errors.ticker} />
                </Field>
              </>
            )}
            <SelectField
              name="exchange"
              required
              options={exchanges}
              value={values.exchange}
              onChange={(v) => set('exchange', v)}
              placeholder={market ? t('stocks.form.selectExchange') : t('stocks.form.chooseMarketFirst')}
              disabled={!market}
              error={errors.exchange}
            />
            <div className="space-y-0.5">
              <p className="text-sm font-medium">{t('stocks.form.currency')}</p>
              <p className="text-sm">{market ? <span>{CURRENCY_BY_MARKET[market]}</span> : <span className="text-muted-foreground">{t('stocks.form.setFromMarket')}</span>}</p>
            </div>
            <Field data-invalid={errors.name ? true : undefined} className={half}>
              <FieldLabel htmlFor="stock-name">
                {fieldLabelOf('name', lang)}
                <Required />
              </FieldLabel>
              <Input
                id="stock-name"
                data-field="name"
                value={values.name}
                onChange={(e) => set('name', e.target.value)}
                maxLength={200}
                aria-required="true"
                {...errorProps('name', errors.name)}
              />
              <FieldMessage name="name" error={errors.name} />
            </Field>
            <CheckGroup
              name="indexMembership"
              lens="indexMembership"
              options={indexes}
              value={values.indexMembership}
              onChange={(v) => set('indexMembership', v)}
              error={errors.indexMembership}
              empty={t('stocks.form.chooseMarketForIndexes')}
              className={half}
            />
          </FieldGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            <h2>{t('stocks.form.classification')}</h2>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <FieldGroup className="grid gap-4 md:grid-cols-2">
            <SelectField
              name="gicsSector"
              label={t('stocks.form.gicsSectorLabel')}
              lens="gicsSector"
              options={LENS_VALUES.gicsSector}
              value={values.gicsSector}
              onChange={(v) => set('gicsSector', v)}
              error={errors.gicsSector}
            />
            {market === 'TH' ? (
              <SelectField
                name="setIndustryGroup"
                lens="setIndustryGroup"
                options={LENS_VALUES.setIndustryGroup}
                value={values.setIndustryGroup}
                onChange={(v) => set('setIndustryGroup', v)}
                error={errors.setIndustryGroup}
              />
            ) : null}
            <SelectField
              name="economicCycle"
              lens="economicCycle"
              options={LENS_VALUES.economicCycle}
              value={values.economicCycle}
              shownValue={cycleDefault}
              onChange={(v) => set('economicCycle', v)}
              error={errors.economicCycle}
              badge={
                cycleDefault ? (
                  <Badge variant="outline" className="text-xs">
                    {t('stocks.form.default')}
                  </Badge>
                ) : null
              }
            />
            <SelectField name="size" lens="size" options={LENS_VALUES.size} value={values.size} onChange={(v) => set('size', v)} error={errors.size} />
            <SelectField name="style" lens="style" options={LENS_VALUES.style} value={values.style} onChange={(v) => set('style', v)} error={errors.style} />
            <SelectField
              name="volatility"
              lens="volatility"
              options={LENS_VALUES.volatility}
              value={values.volatility}
              onChange={(v) => set('volatility', v)}
              error={errors.volatility}
            />
            <SelectField
              name="lynchType"
              lens="lynchType"
              options={LENS_VALUES.lynchType}
              value={values.lynchType}
              onChange={(v) => set('lynchType', v)}
              error={errors.lynchType}
            />
            <SelectField
              name="lifeCycle"
              lens="lifeCycle"
              options={LENS_VALUES.lifeCycle}
              value={values.lifeCycle}
              onChange={(v) => set('lifeCycle', v)}
              error={errors.lifeCycle}
            />
            <SelectField name="moat" lens="moat" options={LENS_VALUES.moat} value={values.moat} onChange={(v) => set('moat', v)} error={errors.moat} />
            <Field data-invalid={errors.valueChain ? true : undefined}>
              <FieldLabel htmlFor="stock-valueChain">{fieldLabelOf('valueChain', lang)}</FieldLabel>
              <Input
                id="stock-valueChain"
                data-field="valueChain"
                value={values.valueChain}
                onChange={(e) => setValueChain(e.target.value)}
                maxLength={60}
                autoComplete="off"
                {...errorProps('valueChain', errors.valueChain)}
              />
              <FieldMessage name="valueChain" error={errors.valueChain} />
            </Field>
            <SelectField
              name="valueChainPosition"
              lens="valueChainPosition"
              options={LENS_VALUES.valueChainPosition}
              value={values.valueChainPosition}
              onChange={(v) => set('valueChainPosition', v)}
              disabledOptions={chainNamed ? [] : LENS_VALUES.valueChainPosition.filter((p) => p !== 'None')}
              error={errors.valueChainPosition}
            />
            <CheckGroup
              name="customers"
              lens="customers"
              options={LENS_VALUES.customers}
              value={values.customers}
              onChange={(v) => set('customers', v)}
              error={errors.customers}
              className={half}
            />
            <CheckGroup
              name="revenueTypes"
              lens="revenueTypes"
              options={LENS_VALUES.revenueTypes}
              value={values.revenueTypes}
              onChange={(v) => set('revenueTypes', v)}
              error={errors.revenueTypes}
              className={half}
            />
            <Field data-invalid={errors.themes ? true : undefined} className={half}>
              <FieldLabel htmlFor="stock-themes">{fieldLabelOf('themes', lang)}</FieldLabel>
              <TagInput
                id="stock-themes"
                dataField="themes"
                label={fieldLabelOf('themes', lang)}
                value={values.themes}
                onChange={(v) => set('themes', v)}
                invalid={Boolean(errors.themes)}
                describedBy={errors.themes ? 'stock-themes-error' : undefined}
              />
              <FieldMessage name="themes" error={errors.themes} />
            </Field>
          </FieldGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            <h2>{t('stocks.form.holding')}</h2>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <FieldGroup className="grid gap-4 md:grid-cols-2">
            <Field orientation="horizontal" className={half}>
              <Checkbox
                id="stock-held"
                data-field="held"
                checked={values.held}
                disabled={pending}
                onCheckedChange={(on) => set('held', on === true)}
              />
              <FieldLabel htmlFor="stock-held" className="font-normal">
                {t('holdings.iHold')}
              </FieldLabel>
            </Field>
            {values.held ? (
              <>
                <Field data-invalid={errors.holdingShares ? true : undefined}>
                  <FieldLabel htmlFor="stock-holdingShares">{t('holdings.sharesOptional')}</FieldLabel>
                  <Input
                    id="stock-holdingShares"
                    data-field="holdingShares"
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    value={values.holdingShares}
                    disabled={pending}
                    onChange={(e) => set('holdingShares', e.target.value)}
                    className="tabular-nums"
                    {...errorProps('holdingShares', errors.holdingShares)}
                  />
                  <FieldMessage name="holdingShares" error={errors.holdingShares} />
                </Field>
                <Field data-invalid={errors.holdingAverageCost ? true : undefined}>
                  <FieldLabel htmlFor="stock-holdingAverageCost">{t('holdings.averageCostOptional')}</FieldLabel>
                  <InputGroup>
                    <InputGroupAddon>
                      <span aria-hidden="true">{costCurrency === 'THB' ? '฿' : '$'}</span>
                    </InputGroupAddon>
                    <InputGroupInput
                      id="stock-holdingAverageCost"
                      data-field="holdingAverageCost"
                      type="text"
                      inputMode="decimal"
                      autoComplete="off"
                      value={values.holdingAverageCost}
                      disabled={pending}
                      onChange={(e) => set('holdingAverageCost', e.target.value)}
                      className="tabular-nums"
                      {...errorProps('holdingAverageCost', errors.holdingAverageCost)}
                    />
                  </InputGroup>
                  <FieldMessage name="holdingAverageCost" error={errors.holdingAverageCost} />
                </Field>
                <FieldSet className={half}>
                  <FieldLegend variant="label" id="stock-costCurrency-legend">
                    {t('holdings.costCurrency')}
                  </FieldLegend>
                  <RadioGroup
                    value={costCurrency}
                    onValueChange={(next) => set('costCurrency', next as 'USD' | 'THB')}
                    aria-labelledby="stock-costCurrency-legend"
                    disabled={pending}
                    className="flex gap-4"
                  >
                    {(['USD', 'THB'] as const).map((c) => (
                      <Field key={c} orientation="horizontal" className="w-auto">
                        <RadioGroupItem value={c} id={`stock-costCurrency-${c}`} />
                        <FieldLabel htmlFor={`stock-costCurrency-${c}`} className="font-normal">
                          {c}
                        </FieldLabel>
                      </Field>
                    ))}
                  </RadioGroup>
                </FieldSet>
                <FieldDescription className={half}>{t('holdings.leaveEmpty')}</FieldDescription>
              </>
            ) : null}
          </FieldGroup>
        </CardContent>
      </Card>

      {props.mode === 'create' ? (
        <Card>
          <CardHeader>
            <CardTitle>
              <h2>{t('stocks.form.lists')}</h2>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {lists.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t('stocks.form.noListsYet')}{' '}
                <Link to="/lists" className="underline">
                  {t('stocks.form.listsPage')}
                </Link>
                .
              </p>
            ) : (
              <FieldSet>
                <FieldLegend variant="label" className="sr-only">
                  {t('stocks.form.addToLists')}
                </FieldLegend>
                <div className="flex flex-wrap gap-x-6 gap-y-2">
                  {lists.map((list) => (
                    <Field key={list.id} orientation="horizontal" className="w-auto">
                      <Checkbox
                        id={`stock-list-${list.id}`}
                        checked={values.listIds.includes(list.id)}
                        onCheckedChange={(on) =>
                          set('listIds', on === true ? [...values.listIds, list.id] : values.listIds.filter((id) => id !== list.id))
                        }
                      />
                      <FieldLabel htmlFor={`stock-list-${list.id}`} className="font-normal">
                        {list.name}
                      </FieldLabel>
                    </Field>
                  ))}
                </div>
              </FieldSet>
            )}
          </CardContent>
        </Card>
      ) : null}

      <div
        className={
          props.inDialog
            ? 'sticky bottom-0 -mx-4 flex flex-col-reverse gap-2 border-t bg-popover px-4 py-3 sm:flex-row sm:justify-end'
            : 'flex flex-col-reverse gap-2 sm:flex-row sm:justify-end'
        }
      >
        {props.onCancel ? (
          <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={props.onCancel}>
            {t('stocks.form.cancel')}
          </Button>
        ) : (
          <Button variant="outline" asChild className="w-full sm:w-auto">
            <Link to={stock ? `/stocks/${stock.id}` : '/stocks'}>{t('stocks.form.cancel')}</Link>
          </Button>
        )}
        <Button type="submit" disabled={pending} className="w-full sm:w-auto">
          {pending ? <Loader2Icon className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : null}
          {pending ? t('stocks.form.saving') : stock ? t('stocks.form.saveChanges') : t('stocks.form.saveStock')}
        </Button>
      </div>
    </form>
  )
}
