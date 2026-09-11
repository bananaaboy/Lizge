/**
 * Drop target and file picker.
 *
 * `File` objects are read with `arrayBuffer()` and kept in memory. There is no
 * upload step because there is nowhere to upload to.
 */

import { useCallback, useRef, useState } from 'react'

import { formatBytes } from '../lib/format'
import { kindFromMime, useSession } from '../state/store'
import { ArrowRight, Button } from './ui/primitives'

export function FileDrop({ compact = false }: { compact?: boolean }) {
  const addAsset = useSession((state) => state.addAsset)
  const log = useSession((state) => state.log)
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [busy, setBusy] = useState(false)

  const ingest = useCallback(
    async (files: FileList | File[]) => {
      setBusy(true)
      try {
        for (const file of Array.from(files)) {
          const bytes = new Uint8Array(await file.arrayBuffer())
          addAsset({
            name: file.name,
            bytes,
            mime: file.type || 'application/octet-stream',
            sizeBytes: bytes.byteLength,
            kind: kindFromMime(file.type, file.name),
            audio: null,
            durationSeconds: null,
            origin: 'file',
          })
          log('bibliothek', `${file.name} geladen (${formatBytes(bytes.byteLength)}) — verbleibt lokal`)
        }
      } finally {
        setBusy(false)
      }
    },
    [addAsset, log],
  )

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault()
        setDragging(false)
        if (event.dataTransfer.files.length) void ingest(event.dataTransfer.files)
      }}
      className={`rounded-card bg-raised text-center ring-1 ring-inset transition-colors ${
        dragging ? 'ring-ink' : 'ring-line'
      } ${compact ? 'p-[21px]' : 'p-[42px]'}`}
    >
      <input
        ref={inputRef}
        type="file"
        multiple
        accept="audio/*,video/*,.mkv,.flac,.opus,.m4a,.ts"
        className="sr-only"
        onChange={(event) => {
          if (event.target.files?.length) void ingest(event.target.files)
          event.target.value = ''
        }}
      />
      {!compact ? (
        <p className="display-sm mb-[7px]">Dateien hierher ziehen</p>
      ) : null}
      <p className="mx-auto mb-[18px] max-w-[42ch] text-[13px] leading-[1.55] text-muted">
        Audio oder Video, beliebig viele. Die Dateien bleiben im Arbeitsspeicher dieses Tabs.
      </p>
      <Button size={compact ? 'sm' : 'md'} onClick={() => inputRef.current?.click()} disabled={busy}>
        {busy ? 'Wird gelesen…' : 'Dateien auswählen'}
        <ArrowRight />
      </Button>
    </div>
  )
}
