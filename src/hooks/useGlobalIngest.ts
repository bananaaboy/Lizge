/**
 * Files dropped anywhere on the page, or pasted from the clipboard.
 *
 * A drop target you have to aim at is a small tax on every single use. Since
 * the whole window has no other use for a drop, it accepts one — and the
 * clipboard path covers the case where a file came from a screenshot tool or a
 * chat window.
 */

import { useCallback, useEffect, useState } from 'react'

import { formatBytes } from '../lib/format'
import { kindFromMime, useSession } from '../state/store'

const MEDIA_PATTERN = /^(audio|video)\//

export function useGlobalIngest(): { dragging: boolean } {
  const addAsset = useSession((state) => state.addAsset)
  const log = useSession((state) => state.log)
  const [dragging, setDragging] = useState(false)

  const ingest = useCallback(
    async (files: File[], source: string) => {
      const usable = files.filter(
        (file) => MEDIA_PATTERN.test(file.type) || kindFromMime(file.type, file.name) !== 'unknown',
      )
      if (usable.length === 0) return

      for (const file of usable) {
        const bytes = new Uint8Array(await file.arrayBuffer())
        addAsset({
          name: file.name || 'eingefügt',
          bytes,
          mime: file.type || 'application/octet-stream',
          sizeBytes: bytes.byteLength,
          kind: kindFromMime(file.type, file.name),
          audio: null,
          durationSeconds: null,
          origin: 'file',
        })
        log('bibliothek', `${file.name || 'eingefügt'} ${source} (${formatBytes(bytes.byteLength)})`)
      }
    },
    [addAsset, log],
  )

  useEffect(() => {
    // Depth counting, because dragenter/dragleave fire for every child element
    // the pointer crosses and a naive boolean flickers.
    let depth = 0

    const onDragEnter = (event: DragEvent) => {
      if (!event.dataTransfer?.types.includes('Files')) return
      depth += 1
      setDragging(true)
    }
    const onDragOver = (event: DragEvent) => {
      if (!event.dataTransfer?.types.includes('Files')) return
      event.preventDefault()
      event.dataTransfer.dropEffect = 'copy'
    }
    const onDragLeave = () => {
      depth = Math.max(0, depth - 1)
      if (depth === 0) setDragging(false)
    }
    const onDrop = (event: DragEvent) => {
      if (!event.dataTransfer?.files.length) return
      event.preventDefault()
      depth = 0
      setDragging(false)
      void ingest(Array.from(event.dataTransfer.files), 'per Drag & Drop geladen')
    }
    const onPaste = (event: ClipboardEvent) => {
      const target = event.target as HTMLElement | null
      // Do not swallow a paste meant for the URL field.
      if (target && ['INPUT', 'TEXTAREA'].includes(target.tagName)) return
      const files = Array.from(event.clipboardData?.files ?? [])
      if (files.length === 0) return
      event.preventDefault()
      void ingest(files, 'aus der Zwischenablage eingefügt')
    }

    window.addEventListener('dragenter', onDragEnter)
    window.addEventListener('dragover', onDragOver)
    window.addEventListener('dragleave', onDragLeave)
    window.addEventListener('drop', onDrop)
    window.addEventListener('paste', onPaste)
    return () => {
      window.removeEventListener('dragenter', onDragEnter)
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('dragleave', onDragLeave)
      window.removeEventListener('drop', onDrop)
      window.removeEventListener('paste', onPaste)
    }
  }, [ingest])

  return { dragging }
}
