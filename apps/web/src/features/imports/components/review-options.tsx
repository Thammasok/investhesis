import { useTranslation } from 'react-i18next'
import { Field, FieldDescription, FieldError, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { ListSummary } from '@/features/stocks/types'
import type { DuplicateMode } from '../types'

/** The select value for "New list…"; real list ids are UUIDs, so it cannot clash. */
export const NEW_LIST = '__new__'

type TargetListProps = {
  lists: readonly ListSummary[]
  value: string
  onChange: (value: string) => void
  newName: string
  onNewName: (value: string) => void
  nameError: string | undefined
}

/** "Add to list": an existing list or "New list…" with a name input below. */
export function TargetList({ lists, value, onChange, newName, onNewName, nameError }: TargetListProps) {
  const { t } = useTranslation()
  return (
    <div className="space-y-3">
      <Field>
        <FieldLabel htmlFor="import-target">
          {t('imports.target.label')}
          <span aria-hidden="true">*</span>
          <span className="sr-only">{t('imports.target.required')}</span>
        </FieldLabel>
        <Select value={value} onValueChange={onChange}>
          <SelectTrigger id="import-target" aria-required="true" className="w-full sm:w-72">
            <SelectValue placeholder={t('imports.target.placeholder')} />
          </SelectTrigger>
          <SelectContent>
            {lists.map((list) => (
              <SelectItem key={list.id} value={list.id}>
                {list.name}
              </SelectItem>
            ))}
            {lists.length > 0 ? <SelectSeparator /> : null}
            <SelectItem value={NEW_LIST}>{t('imports.target.newList')}</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      {value === NEW_LIST ? (
        <Field data-invalid={nameError ? true : undefined}>
          <FieldLabel htmlFor="import-new-list">
            {t('imports.target.newName')}
            <span aria-hidden="true">*</span>
            <span className="sr-only">{t('imports.target.required')}</span>
          </FieldLabel>
          <Input
            id="import-new-list"
            value={newName}
            onChange={(event) => onNewName(event.target.value)}
            aria-invalid={nameError ? true : undefined}
            aria-describedby={nameError ? 'import-new-list-error' : undefined}
            autoComplete="off"
            className="w-full sm:w-72"
          />
          {nameError ? <FieldError id="import-new-list-error">{nameError}</FieldError> : null}
        </Field>
      ) : null}
    </div>
  )
}

/** Skip or update, for all duplicate rows. Only rendered when the file has duplicates. */
export function DuplicateModeGroup({ value, onChange }: { value: DuplicateMode; onChange: (value: DuplicateMode) => void }) {
  const { t } = useTranslation()
  return (
    <FieldSet>
      <FieldLegend variant="label" id="import-duplicates-legend">
        {t('imports.duplicates.legend')}
        <span aria-hidden="true">*</span>
      </FieldLegend>
      <RadioGroup aria-labelledby="import-duplicates-legend" value={value} onValueChange={(v) => onChange(v as DuplicateMode)}>
        {(
          [
            ['skip', t('imports.duplicates.skip'), t('imports.duplicates.skipHint')],
            ['update', t('imports.duplicates.update'), t('imports.duplicates.updateHint')],
          ] as const
        ).map(([mode, label, description]) => (
          <div key={mode} className="flex items-start gap-2">
            <RadioGroupItem id={`import-dup-${mode}`} value={mode} aria-describedby={`import-dup-${mode}-hint`} className="mt-0.5" />
            <div className="space-y-0.5">
              <Label htmlFor={`import-dup-${mode}`}>{label}</Label>
              <FieldDescription id={`import-dup-${mode}-hint`}>{description}</FieldDescription>
            </div>
          </div>
        ))}
      </RadioGroup>
    </FieldSet>
  )
}
