import {
  CURRENCY_BY_MARKET,
  EXCHANGES_BY_MARKET,
  INDEXES_BY_MARKET,
  LENS_VALUES,
  type Market,
} from '@investhesis/domain'
import { Loader2Icon, TriangleAlertIcon } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useFetcher } from 'react-router'
import { toast } from 'sonner'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import type { StockFormResult } from '../stocks-data'
import {
  checkValues,
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
} from '../stock-form-model'
import type { ListSummary, Stock } from '../types'
import { CheckGroup, FieldMessage, Required, SelectField } from './form-controls'
import { errorProps } from './form-field-props'
import { TagInput } from './tag-input'

type StockFormProps = { mode: 'create'; lists: ListSummary[] } | { mode: 'edit'; stock: Stock }

type FormAlert = { kind: 'exists'; existingStockId: string } | { kind: 'missing' } | { kind: 'message'; text: string }
type Focus = { target: FieldName | 'alert'; n: number }

const half = 'md:col-span-2'

/** What the form shows for an answer that was not a success. */
function interpret(result: StockFormResult, mode: StockFormProps['mode']): { alert: FormAlert | null; errors?: FieldErrors; focus: FieldName | 'alert' } {
  if (result.code === 'stock_exists' && result.existingStockId) {
    return { alert: { kind: 'exists', existingStockId: result.existingStockId }, focus: 'alert' }
  }
  if (result.status === 404) {
    return {
      alert:
        mode === 'edit'
          ? { kind: 'missing' }
          : { kind: 'message', text: 'One of the selected lists no longer exists. Reload the page and try again.' },
      focus: 'alert',
    }
  }
  if (result.status === 400 && result.errors.length > 0) {
    const { fields, rest } = splitServerErrors(result.errors)
    return {
      alert: rest.length > 0 ? { kind: 'message', text: rest.join('. ') } : null,
      errors: fields,
      focus: rest.length > 0 ? 'alert' : (firstInvalid(fields) ?? 'alert'),
    }
  }
  const text =
    result.status === 0
      ? "Couldn't reach the server. Check your connection and try again."
      : "Couldn't save the stock. Try again."
  return { alert: { kind: 'message', text }, focus: 'alert' }
}

/** Add stock and Edit stock (ux-design.md): one form, the market and ticker locked in edit mode. */
export function StockForm(props: StockFormProps) {
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
    const outcome = interpret(fetcher.data, props.mode)
    setAnswered(fetcher.data)
    setAlert(outcome.alert)
    if (outcome.errors) setErrors(outcome.errors)
    requestFocus(outcome.focus)
  }

  const set = <K extends keyof FormValues>(key: K, value: FormValues[K]) => {
    setValues((v) => ({ ...v, [key]: value }))
    if (key in errors) setErrors(({ [key as FieldName]: _gone, ...rest }) => rest)
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
    const checked = checkValues(values)
    if (!checked.ok) {
      setErrors(checked.errors)
      const first = firstInvalid(checked.errors)
      if (first) requestFocus(first)
      return
    }
    setErrors({})
    const body = stock ? patchBody(checked.input, values, stock) : createBody(checked.input, values, values.economicCycle !== '')
    if (stock && Object.keys(body).length === 0) {
      toast('No changes to save')
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

  return (
    <form ref={formRef} onSubmit={onSubmit} noValidate className="max-w-4xl space-y-6">
      {alert ? (
        <Alert ref={alertRef} variant="destructive" tabIndex={-1} className="outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
          <TriangleAlertIcon aria-hidden="true" />
          <AlertDescription>
            {alert.kind === 'exists' ? (
              <>
                {ticker} ({market}) is already saved.{' '}
                <Link to={`/stocks/${encodeURIComponent(alert.existingStockId)}`} className="underline">
                  Open {ticker}
                </Link>
              </>
            ) : alert.kind === 'missing' ? (
              <>
                This stock no longer exists. It may have been deleted.{' '}
                <Link to="/stocks" className="underline">
                  Go to stocks
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
            <h2>Identity</h2>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <FieldGroup className="grid gap-4 md:grid-cols-2">
            {stock ? (
              <>
                <div className="space-y-0.5">
                  <p className="text-sm font-medium">Market</p>
                  <p className="text-sm">{stock.market}</p>
                </div>
                <div className="space-y-0.5">
                  <p className="text-sm font-medium">Ticker</p>
                  <p className="font-mono text-sm">{stock.ticker}</p>
                </div>
                <FieldDescription className={half}>To change market or ticker, delete this stock and add it again.</FieldDescription>
              </>
            ) : (
              <>
                <FieldSet data-invalid={errors.market ? true : undefined}>
                  <FieldLegend variant="label" id="stock-market-legend">
                    Market
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
                          {m}
                        </FieldLabel>
                      </Field>
                    ))}
                  </RadioGroup>
                  <FieldMessage name="market" error={errors.market} />
                </FieldSet>
                <Field data-invalid={errors.ticker ? true : undefined}>
                  <FieldLabel htmlFor="stock-ticker">
                    Ticker
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
              placeholder={market ? 'Select exchange' : 'Choose a market first'}
              disabled={!market}
              error={errors.exchange}
            />
            <div className="space-y-0.5">
              <p className="text-sm font-medium">Currency</p>
              <p className="text-sm">{market ? <span>{CURRENCY_BY_MARKET[market]}</span> : <span className="text-muted-foreground">Set from market</span>}</p>
            </div>
            <Field data-invalid={errors.name ? true : undefined} className={half}>
              <FieldLabel htmlFor="stock-name">
                Company name
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
              options={indexes}
              value={values.indexMembership}
              onChange={(v) => set('indexMembership', v)}
              error={errors.indexMembership}
              empty="Choose a market to see its indexes."
              className={half}
            />
          </FieldGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            <h2>Classification</h2>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <FieldGroup className="grid gap-4 md:grid-cols-2">
            <SelectField
              name="gicsSector"
              label="Sector (GICS)"
              options={LENS_VALUES.gicsSector}
              value={values.gicsSector}
              onChange={(v) => set('gicsSector', v)}
              error={errors.gicsSector}
            />
            {market === 'TH' ? (
              <SelectField
                name="setIndustryGroup"
                options={LENS_VALUES.setIndustryGroup}
                value={values.setIndustryGroup}
                onChange={(v) => set('setIndustryGroup', v)}
                error={errors.setIndustryGroup}
              />
            ) : null}
            <SelectField
              name="economicCycle"
              options={LENS_VALUES.economicCycle}
              value={values.economicCycle}
              shownValue={cycleDefault}
              onChange={(v) => set('economicCycle', v)}
              error={errors.economicCycle}
              badge={
                cycleDefault ? (
                  <Badge variant="outline" className="text-xs">
                    Default
                  </Badge>
                ) : null
              }
            />
            <SelectField name="size" options={LENS_VALUES.size} value={values.size} onChange={(v) => set('size', v)} error={errors.size} />
            <SelectField name="style" options={LENS_VALUES.style} value={values.style} onChange={(v) => set('style', v)} error={errors.style} />
            <SelectField
              name="volatility"
              options={LENS_VALUES.volatility}
              value={values.volatility}
              onChange={(v) => set('volatility', v)}
              error={errors.volatility}
            />
            <SelectField
              name="lynchType"
              options={LENS_VALUES.lynchType}
              value={values.lynchType}
              onChange={(v) => set('lynchType', v)}
              error={errors.lynchType}
            />
            <SelectField
              name="lifeCycle"
              options={LENS_VALUES.lifeCycle}
              value={values.lifeCycle}
              onChange={(v) => set('lifeCycle', v)}
              error={errors.lifeCycle}
            />
            <SelectField name="moat" options={LENS_VALUES.moat} value={values.moat} onChange={(v) => set('moat', v)} error={errors.moat} />
            <Field data-invalid={errors.valueChain ? true : undefined}>
              <FieldLabel htmlFor="stock-valueChain">Value chain</FieldLabel>
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
              options={LENS_VALUES.valueChainPosition}
              value={values.valueChainPosition}
              onChange={(v) => set('valueChainPosition', v)}
              disabledOptions={chainNamed ? [] : LENS_VALUES.valueChainPosition.filter((p) => p !== 'None')}
              error={errors.valueChainPosition}
            />
            <CheckGroup
              name="customers"
              options={LENS_VALUES.customers}
              value={values.customers}
              onChange={(v) => set('customers', v)}
              error={errors.customers}
              className={half}
            />
            <CheckGroup
              name="revenueTypes"
              options={LENS_VALUES.revenueTypes}
              value={values.revenueTypes}
              onChange={(v) => set('revenueTypes', v)}
              error={errors.revenueTypes}
              className={half}
            />
            <Field data-invalid={errors.themes ? true : undefined} className={half}>
              <FieldLabel htmlFor="stock-themes">Themes</FieldLabel>
              <TagInput
                id="stock-themes"
                dataField="themes"
                label="Themes"
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

      {props.mode === 'create' ? (
        <Card>
          <CardHeader>
            <CardTitle>
              <h2>Lists</h2>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {lists.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No lists yet — you can create one on the{' '}
                <Link to="/lists" className="underline">
                  Lists page
                </Link>
                .
              </p>
            ) : (
              <FieldSet>
                <FieldLegend variant="label" className="sr-only">
                  Add to lists
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

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="outline" asChild className="w-full sm:w-auto">
          <Link to={stock ? `/stocks/${stock.id}` : '/stocks'}>Cancel</Link>
        </Button>
        <Button type="submit" disabled={pending} className="w-full sm:w-auto">
          {pending ? <Loader2Icon className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : null}
          {pending ? 'Saving…' : stock ? 'Save changes' : 'Save stock'}
        </Button>
      </div>
    </form>
  )
}
