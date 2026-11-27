import { InfoIcon, Loader2Icon, TriangleAlertIcon } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useRevalidator } from 'react-router'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { checkListName } from '@/features/lists/list-name'
import type { ListSummary } from '@/features/stocks/types'
import { ApiError, type ApiClient } from '@/lib/api-client'
import { DropZone } from './components/drop-zone'
import { PreviewTable } from './components/preview-table'
import { DuplicateModeGroup, NEW_LIST, TargetList } from './components/review-options'
import { StepIndicator, type WizardStep } from './components/step-indicator'
import { SummaryPanel } from './components/summary-panel'
import { TemplateLinks } from './components/template-links'
import { importProblemMessage } from './problem-message'
import type { DuplicateMode, ImportSummary, PreviewResponse } from './types'

type ImportWizardProps = {
  api: ApiClient
  lists: readonly ListSummary[]
  /** `?listId=`: the list to pre-select. */
  initialListId?: string
  /** Inside a dialog: no card of its own (the dialog supplies the title) and the steps fill its width. */
  inDialog?: boolean
}

/**
 * The import wizard (ux-design.md §Import). The chosen `File` lives in state because confirm re-sends it
 * (design.md §Web); the calls go through the api client rather than a route action.
 */
export function ImportWizard({ api, lists, initialListId, inDialog = false }: ImportWizardProps) {
  const { t } = useTranslation()
  const revalidator = useRevalidator()
  const [step, setStep] = useState<WizardStep>('file')
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<PreviewResponse | null>(null)
  const [summary, setSummary] = useState<ImportSummary | null>(null)
  const [busy, setBusy] = useState<'checking' | 'importing' | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [confirmError, setConfirmError] = useState<string | null>(null)
  const [target, setTarget] = useState(() => (lists.some((l) => l.id === initialListId) ? (initialListId ?? '') : ''))
  const [newName, setNewName] = useState('')
  const [nameError, setNameError] = useState<string | undefined>()
  const [duplicateMode, setDuplicateMode] = useState<DuplicateMode>('skip')
  const sending = useRef(false)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const firstRender = useRef(true)

  // Focus follows the step; the first render leaves it on the page's h1.
  useEffect(() => {
    if (firstRender.current) firstRender.current = false
    else headingRef.current?.focus()
  }, [step])

  // A list deleted elsewhere (the loader reran) is no longer a valid choice.
  const targetValid = target === NEW_LIST || lists.some((l) => l.id === target)
  const chosen = targetValid ? target : ''

  function restart() {
    setStep('file')
    setFile(null)
    setPreview(null)
    setSummary(null)
    setFileError(null)
    setConfirmError(null)
    setNameError(undefined)
    setNewName('')
    setDuplicateMode('skip')
  }

  async function check(picked: File) {
    if (sending.current) return
    sending.current = true
    setBusy('checking')
    setFileError(null)
    try {
      const form = new FormData()
      form.append('file', picked)
      const result = await api.post<PreviewResponse>('/imports/preview', { body: form })
      setFile(picked)
      setPreview(result)
      setConfirmError(null)
      setStep('review')
    } catch (error) {
      setFileError(importProblemMessage(error))
    } finally {
      sending.current = false
      setBusy(null)
    }
  }

  const importable = preview ? preview.counts.new + preview.counts.duplicate : 0
  const needsName = chosen === NEW_LIST
  const canSubmit = file !== null && importable > 0 && chosen !== '' && (!needsName || newName.trim() !== '') && busy === null

  async function confirm(event: FormEvent) {
    event.preventDefault()
    if (!file || !canSubmit || sending.current) return
    let listName = ''
    if (needsName) {
      const checkedName = checkListName(newName)
      if (!checkedName.ok) {
        setNameError(checkedName.message)
        document.getElementById('import-new-list')?.focus()
        return
      }
      listName = checkedName.name
    }
    sending.current = true
    setBusy('importing')
    setNameError(undefined)
    setConfirmError(null)
    try {
      // Text fields before the file, so the API reads the options before it streams the file.
      const form = new FormData()
      form.append('duplicateMode', preview && preview.counts.duplicate > 0 ? duplicateMode : 'skip')
      if (needsName) form.append('newListName', listName)
      else form.append('targetListId', chosen)
      form.append('file', file)
      const result = await api.post<ImportSummary>('/imports', { body: form })
      setSummary(result)
      setStep('done')
      // A new list now exists, and counts changed.
      void revalidator.revalidate()
    } catch (error) {
      if (error instanceof ApiError && error.status === 409 && error.code === 'list_name_taken') {
        setNameError(t('imports.nameTaken'))
        document.getElementById('import-new-list')?.focus()
      } else if (error instanceof ApiError && error.status === 404) {
        setConfirmError(t('imports.listGone'))
        setTarget('')
        void revalidator.revalidate()
      } else {
        setConfirmError(importProblemMessage(error))
      }
    } finally {
      sending.current = false
      setBusy(null)
    }
  }

  const content = (
    <>
      {/* Announced politely: "Checking file…" and "Importing…". */}
      <div aria-live="polite" className="sr-only">
        {busy === 'checking' ? t('imports.status.checking') : busy === 'importing' ? t('imports.status.importing') : ''}
      </div>
      <h2 ref={headingRef} tabIndex={-1} className="font-heading text-lg font-semibold outline-none">
        {t(`imports.headings.${step}`)}
      </h2>

      {step === 'file' ? (
        <div className="space-y-4">
          <TemplateLinks api={api} />
          <DropZone loading={busy === 'checking'} onFile={check} />
          {fileError ? (
            <Alert variant="destructive">
              <TriangleAlertIcon aria-hidden="true" />
              <AlertDescription>{fileError}</AlertDescription>
            </Alert>
          ) : null}
        </div>
      ) : null}

      {step === 'review' && preview ? (
        <form onSubmit={confirm} noValidate className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="break-all font-medium">{`${preview.fileName} · ${t('imports.rowCount', { count: preview.rows.length, n: preview.rows.length.toLocaleString('en-US') })}`}</p>
            <Button type="button" variant="outline" size="sm" onClick={restart}>
              {t('imports.chooseAnother')}
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className="tabular-nums">{t('imports.counts.new', { count: preview.counts.new })}</Badge>
            <Badge variant="outline" className="tabular-nums">{t('imports.counts.duplicate', { count: preview.counts.duplicate })}</Badge>
            <Badge variant="destructive" className="tabular-nums text-foreground">{t('imports.counts.error', { count: preview.counts.error })}</Badge>
          </div>
          {preview.headerWarnings.length > 0 ? (
            <Alert role="status">
              <TriangleAlertIcon aria-hidden="true" />
              <AlertDescription>
                {preview.headerWarnings.map((w) => (
                  <p key={w}>{w}</p>
                ))}
              </AlertDescription>
            </Alert>
          ) : null}
          {preview.ignoredColumns.length > 0 ? (
            <Alert role="status">
              <InfoIcon aria-hidden="true" />
              <AlertDescription>
                <p>
                  {t('imports.ignoredLead')}{' '}
                  {preview.ignoredColumns.flatMap((name, i) => [
                    i > 0 ? ', ' : '',
                    <span key={name} className="font-mono">
                      {name}
                    </span>,
                  ])}
                  {t('imports.ignoredEnd')}
                </p>
                <p>{t('imports.ignoredAdvice')}</p>
              </AlertDescription>
            </Alert>
          ) : null}
          <PreviewTable fileName={preview.fileName} rows={preview.rows} />
          <div className="space-y-4">
            <TargetList
              lists={lists}
              value={chosen}
              onChange={(value) => {
                setTarget(value)
                setNameError(undefined)
              }}
              newName={newName}
              onNewName={(value) => {
                setNewName(value)
                setNameError(undefined)
              }}
              nameError={nameError}
            />
            {preview.counts.duplicate > 0 ? <DuplicateModeGroup value={duplicateMode} onChange={setDuplicateMode} /> : null}
            <p className="text-sm">
              {importable === 0 ? t('imports.nothingToImport') : t('imports.errorRowsSkipped')}
            </p>
          </div>
          {confirmError ? (
            <Alert variant="destructive">
              <TriangleAlertIcon aria-hidden="true" />
              <AlertDescription>{confirmError}</AlertDescription>
            </Alert>
          ) : null}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={restart}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {busy === 'importing' ? (
                <>
                  <Loader2Icon className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
                  {t('imports.status.importing')}
                </>
              ) : (
                t('imports.importButton', { stocks: t('imports.stockCount', { count: importable, n: importable.toLocaleString('en-US') }) })
              )}
            </Button>
          </div>
        </form>
      ) : null}

      {step === 'done' && summary ? <SummaryPanel summary={summary} onAnother={restart} /> : null}
    </>
  )

  if (inDialog) {
    return (
      <div className="space-y-4">
        <StepIndicator current={step} />
        {content}
      </div>
    )
  }
  return (
    <Card className="max-w-5xl">
      <CardHeader className="space-y-3">
        <CardTitle>{t('imports.title')}</CardTitle>
        <StepIndicator current={step} />
      </CardHeader>
      <CardContent className="space-y-4">{content}</CardContent>
    </Card>
  )
}
