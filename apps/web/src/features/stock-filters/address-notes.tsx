import { InfoIcon } from 'lucide-react'
import { Alert } from '@/components/ui/alert'

/** One line per part of the address that was dropped (FR-006). The address itself is not rewritten. */
export function AddressNotes({ notes }: { notes: readonly string[] }) {
  if (notes.length === 0) return null
  return (
    <Alert role="status">
      <InfoIcon aria-hidden="true" />
      <div className="space-y-1">
        {notes.map((note) => (
          <p key={note}>{note}</p>
        ))}
      </div>
    </Alert>
  )
}
