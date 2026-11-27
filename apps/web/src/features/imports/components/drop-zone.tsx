import { Loader2Icon, UploadIcon } from 'lucide-react'
import { useState, type DragEvent } from 'react'
import { cn } from '@/lib/utils'

type DropZoneProps = {
  loading: boolean
  onFile: (file: File) => void
}

/** A label around a visually hidden file input: the keyboard and the picker work without drag and drop. */
export function DropZone({ loading, onFile }: DropZoneProps) {
  const [dragging, setDragging] = useState(false)

  function onDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault()
    setDragging(false)
    // Two files: the first is used. A drop without files (text) does nothing.
    const file = event.dataTransfer.files[0]
    if (file && !loading) onFile(file)
  }

  return (
    <label
      onDragOver={(event) => {
        event.preventDefault()
        if (!loading) setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      className={cn(
        'flex flex-col items-center gap-2 rounded-lg border border-dashed p-8 text-center hover:bg-muted/50 focus-within:ring-[3px] focus-within:ring-ring/50',
        dragging && 'border-primary bg-muted/50',
        loading && 'opacity-60',
      )}
    >
      <input
        type="file"
        accept=".csv,.xlsx"
        aria-label="Choose file"
        aria-describedby="import-limits"
        disabled={loading}
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0]
          // Reset so choosing the same file again fires another change.
          event.target.value = ''
          if (file) onFile(file)
        }}
      />
      {loading ? (
        <p className="flex items-center gap-2 font-medium">
          <Loader2Icon className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
          Checking file…
        </p>
      ) : (
        <p className="flex flex-wrap items-center justify-center gap-x-2">
          <UploadIcon className="size-4" aria-hidden="true" />
          <span>Drop a .csv or .xlsx file here, or</span>
          <span className="rounded-md border px-2 py-0.5 text-sm font-medium">Choose file</span>
        </p>
      )}
      <p id="import-limits" className="text-sm text-muted-foreground">
        Up to 1 MB and 1,000 rows. Only the first sheet is read.
      </p>
    </label>
  )
}
