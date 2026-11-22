import { CircleCheckIcon, DownloadIcon } from 'lucide-react'
import { Link } from 'react-router'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { buildErrorCsv } from '../error-csv'
import { saveFile } from '@/lib/save-file'
import type { ImportSummary } from '../types'

export const ERROR_ROWS_FILENAME = 'investhesis-import-errors.csv'

/** Step 3: the counts, a link to the target list and (when rows failed) the error-rows CSV built here. */
export function SummaryPanel({ summary, onAnother }: { summary: ImportSummary; onAnother: () => void }) {
  const { targetList, created, skipped, updated, failed } = summary
  return (
    <div className="space-y-4">
      <Alert role="status">
        <CircleCheckIcon aria-hidden="true" />
        <AlertTitle>{`Import finished into "${targetList.name}"`}</AlertTitle>
        <AlertDescription>{`${created} created · ${skipped} skipped · ${updated} updated · ${failed} failed`}</AlertDescription>
      </Alert>
      <div className="flex flex-wrap gap-2">
        <Button asChild className="w-full sm:w-auto">
          <Link to={`/lists/${encodeURIComponent(targetList.id)}`}>{`Open ${targetList.name}`}</Link>
        </Button>
        {failed > 0 ? (
          <Button
            variant="outline"
            className="w-full sm:w-auto"
            onClick={() => saveFile(new Blob([buildErrorCsv(summary.errorRows)], { type: 'text/csv;charset=utf-8' }), ERROR_ROWS_FILENAME)}
          >
            <DownloadIcon aria-hidden="true" />
            Download error rows (CSV)
          </Button>
        ) : null}
        <Button variant="ghost" className="w-full sm:w-auto" onClick={onAnother}>
          Import another
        </Button>
      </div>
    </div>
  )
}
