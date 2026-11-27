import { NOT_SET_LABELS, lensValueLabel } from '@investhesis/domain'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldError, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { fieldLabelOf, type FieldName } from '../stock-form-model'
import { useLanguage } from '../use-language'
import { errorProps, NONE } from './form-field-props'

/** Visible `*` for the eye, "required" for a screen reader. */
export function Required() {
  const { t } = useTranslation()
  return (
    <>
      <span aria-hidden="true">*</span>
      <span className="sr-only">{t('stocks.form.required')}</span>
    </>
  )
}

export function FieldMessage({ name, error }: { name: FieldName; error: string | undefined }) {
  return error ? <FieldError id={`stock-${name}-error`}>{error}</FieldError> : null
}

type SelectFieldProps = {
  name: FieldName
  label?: string
  /** The lens whose labels name the options (Thai shows the label, the English value is the hover title); none for plain values such as exchanges. */
  lens?: string
  options: readonly string[]
  value: string
  onChange: (value: string) => void
  error?: string
  required?: boolean
  disabled?: boolean
  /** Options that cannot be chosen right now. */
  disabledOptions?: readonly string[]
  /** Without a "Not set" item (required fields): shows this while empty. */
  placeholder?: string
  /** What the select shows while `value` is empty, if not "Not set" (the sector default). */
  shownValue?: string
  badge?: ReactNode
  className?: string
}

/** A labelled single-choice select with an optional "Not set" item. */
export function SelectField({
  name,
  label: labelProp,
  lens,
  options,
  value,
  onChange,
  error,
  required,
  disabled,
  disabledOptions = [],
  placeholder,
  shownValue,
  badge,
  className,
}: SelectFieldProps) {
  const lang = useLanguage()
  const label = labelProp ?? fieldLabelOf(name, lang)
  const optionLabel = (option: string) => (lens ? lensValueLabel(lens, option, lang) : option)
  const id = `stock-${name}`
  const shown = value || shownValue || (placeholder ? '' : NONE)
  return (
    <Field data-invalid={error ? true : undefined} className={className}>
      <FieldLabel htmlFor={id}>
        {label}
        {required ? <Required /> : null}
        {badge}
      </FieldLabel>
      <Select value={shown} onValueChange={(next) => onChange(next === NONE ? '' : next)} disabled={disabled}>
        <SelectTrigger
          id={id}
          data-field={name}
          aria-required={required ? true : undefined}
          className={cn('w-full', shown === NONE && 'text-muted-foreground')}
          {...errorProps(name, error)}
        >
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {placeholder ? null : (
            <SelectItem value={NONE} className="text-muted-foreground">
              {NOT_SET_LABELS[lang]}
            </SelectItem>
          )}
          {options.map((option) => (
            <SelectItem key={option} value={option} disabled={disabledOptions.includes(option)} title={optionLabel(option) === option ? undefined : option}>
              {optionLabel(option)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <FieldMessage name={name} error={error} />
    </Field>
  )
}

type CheckGroupProps = {
  name: FieldName
  lens?: string
  options: readonly string[]
  value: string[]
  onChange: (value: string[]) => void
  error?: string
  empty?: string
  className?: string
}

/** A fieldset of checkboxes for a multi-value lens. */
export function CheckGroup({ name, lens, options, value, onChange, error, empty, className }: CheckGroupProps) {
  const lang = useLanguage()
  const toggle = (option: string, on: boolean) => onChange(on ? [...value, option] : value.filter((v) => v !== option))
  return (
    <FieldSet className={className} {...(error ? { 'aria-describedby': `stock-${name}-error` } : {})}>
      <FieldLegend variant="label">{fieldLabelOf(name, lang)}</FieldLegend>
      {options.length === 0 && empty ? <p className="text-sm text-muted-foreground">{empty}</p> : null}
      <div className="flex flex-wrap gap-x-6 gap-y-2">
        {options.map((option, index) => {
          const id = `stock-${name}-${option}`
          return (
            <Field key={option} orientation="horizontal" className="w-auto">
              <Checkbox
                id={id}
                data-field={index === 0 ? name : undefined}
                checked={value.includes(option)}
                onCheckedChange={(on) => toggle(option, on === true)}
                {...(index === 0 ? errorProps(name, error) : {})}
              />
              <FieldLabel htmlFor={id} className="font-normal" title={lens && lensValueLabel(lens, option, lang) !== option ? option : undefined}>
                {lens ? lensValueLabel(lens, option, lang) : option}
              </FieldLabel>
            </Field>
          )
        })}
      </div>
      <FieldMessage name={name} error={error} />
    </FieldSet>
  )
}
