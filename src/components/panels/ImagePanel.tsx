/**
 * Images: scale, crop, straighten, adjust, convert — and the same again over a
 * whole folder at once.
 *
 * The panel is built around one rule: never describe what a setting will do
 * when it can be shown instead. Every control redraws the preview, the result
 * size is measured rather than estimated, and the before/after switch is one
 * click away at all times.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { saveBytes } from '../../lib/download'
import { formatBytes } from '../../lib/format'
import {
  DEFAULT_IMAGE_OPS,
  IMAGE_FORMATS,
  extensionFor,
  factsOf,
  outputSize,
  processImage,
  readImage,
  type CropRect,
  type ImageFormat,
  type ImageOps,
} from '../../lib/image'
import { createZip } from '../../lib/zip'
import { useAssetsOfKind, useActiveAssetOfKind, useSession } from '../../state/store'
import { SessionCard } from '../AssetList'
import { FileDrop } from '../FileDrop'
import {
  ArrowRight,
  Button,
  Card,
  Eyebrow,
  Field,
  Notice,
  Progress,
  Reveal,
  Select,
  Slider,
  Stat,
} from '../ui/primitives'

/** Widths people actually ask for, plus whatever they type. */
const WIDTH_PRESETS = [
  { value: 0, label: 'Originalgröße' },
  { value: 3840, label: '3840 px — 4K' },
  { value: 1920, label: '1920 px — Full HD' },
  { value: 1280, label: '1280 px — Web' },
  { value: 800, label: '800 px — Blog' },
  { value: 400, label: '400 px — Vorschau' },
]

function useObjectUrl(bytes: Uint8Array | null, mime: string): string | null {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!bytes) return setUrl(null)
    const view = bytes.slice()
    const next = URL.createObjectURL(new Blob([view.buffer as ArrayBuffer], { type: mime }))
    setUrl(next)
    return () => URL.revokeObjectURL(next)
  }, [bytes, mime])
  return url
}

export function ImagePanel() {
  const asset = useActiveAssetOfKind('image')
  const images = useAssetsOfKind('image')
  const addAsset = useSession((state) => state.addAsset)
  const log = useSession((state) => state.log)

  const [ops, setOps] = useState<ImageOps>(DEFAULT_IMAGE_OPS)
  const [bitmap, setBitmap] = useState<ImageBitmap | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ bytes: Uint8Array; mime: string; width: number; height: number } | null>(null)
  const [comparing, setComparing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [batch, setBatch] = useState<{ done: number; total: number } | null>(null)
  const [dragging, setDragging] = useState<CropRect | null>(null)
  const frameRef = useRef<HTMLDivElement>(null)

  const patch = (next: Partial<ImageOps>) => setOps((value) => ({ ...value, ...next }))

  /* -- decode ------------------------------------------------------------- */
  useEffect(() => {
    let cancelled = false
    setResult(null)
    setError(null)
    setOps((value) => ({ ...value, crop: null }))
    if (!asset) return setBitmap(null)
    void readImage(asset.bytes, asset.mime)
      .then((next) => {
        // Losing the race means nobody will ever draw this one, and an
        // ImageBitmap holds its pixels until it is closed — switching between
        // a few large photos would otherwise leave every one of them in memory.
        if (cancelled) return next.close()
        setBitmap((previous) => {
          previous?.close()
          return next
        })
      })
      .catch((failure: Error) => !cancelled && (setBitmap(null), setError(failure.message)))
    return () => {
      cancelled = true
    }
  }, [asset])

  /* -- live preview -------------------------------------------------------- */
  // Redrawn on every change, but never more than one run behind: a slider
  // dragged across its range would otherwise queue thirty full-size renders.
  useEffect(() => {
    if (!bitmap) return
    let cancelled = false
    const timer = setTimeout(() => {
      void processImage(bitmap, ops)
        .then((next) => !cancelled && setResult(next))
        .catch((failure: Error) => !cancelled && setError(failure.message))
    }, 120)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [bitmap, ops])

  const facts = useMemo(() => (bitmap ? factsOf(bitmap) : null), [bitmap])
  const target = useMemo(() => (bitmap ? outputSize(bitmap, ops) : null), [bitmap, ops])
  const sourceUrl = useObjectUrl(asset?.bytes ?? null, asset?.mime ?? 'image/*')
  const resultUrl = useObjectUrl(result?.bytes ?? null, result?.mime ?? 'image/png')

  /* -- crop by dragging on the preview ------------------------------------- */
  const pointFrom = useCallback((event: React.PointerEvent) => {
    const box = frameRef.current?.getBoundingClientRect()
    if (!box) return null
    return {
      x: Math.min(1, Math.max(0, (event.clientX - box.left) / box.width)),
      y: Math.min(1, Math.max(0, (event.clientY - box.top) / box.height)),
    }
  }, [])

  const onPointerDown = (event: React.PointerEvent) => {
    if (!bitmap) return
    const start = pointFrom(event)
    if (!start) return
    event.currentTarget.setPointerCapture(event.pointerId)
    setDragging({ x: start.x, y: start.y, width: 0, height: 0 })
  }

  const onPointerMove = (event: React.PointerEvent) => {
    if (!dragging) return
    const now = pointFrom(event)
    if (!now) return
    setDragging((value) => (value ? { ...value, width: now.x - value.x, height: now.y - value.y } : value))
  }

  const onPointerUp = () => {
    if (!dragging) return
    const rect = {
      x: Math.min(dragging.x, dragging.x + dragging.width),
      y: Math.min(dragging.y, dragging.y + dragging.height),
      width: Math.abs(dragging.width),
      height: Math.abs(dragging.height),
    }
    setDragging(null)
    // A click rather than a drag clears the crop instead of setting a sliver.
    if (rect.width < 0.02 || rect.height < 0.02) return patch({ crop: null })
    patch({ crop: rect })
  }

  const live = dragging ?? ops.crop

  /* -- outputs -------------------------------------------------------------- */
  const outputName = (name: string, mime: string) =>
    `${name.replace(/\.[^.]+$/, '')}.${extensionFor(mime)}`

  const keep = () => {
    if (!result || !asset) return
    const name = outputName(asset.name, result.mime)
    addAsset({
      name,
      bytes: result.bytes,
      mime: result.mime,
      sizeBytes: result.bytes.byteLength,
      kind: 'image',
      audio: null,
      durationSeconds: null,
      origin: 'derived',
    })
    log('bilder', `${name} in die Sitzung übernommen (${formatBytes(result.bytes.byteLength)})`)
  }

  /**
   * The same settings over every image in the session.
   *
   * Runs one at a time with a yield in between: a hundred full-size canvas
   * draws back to back freeze the tab, and a frozen tab looks like a crash.
   */
  const runBatch = async () => {
    if (images.length === 0) return
    setBusy(true)
    setBatch({ done: 0, total: images.length })
    const entries: { name: string; data: Uint8Array }[] = []
    try {
      for (const [index, image] of images.entries()) {
        const source = await readImage(image.bytes, image.mime)
        const done = await processImage(source, ops)
        entries.push({ name: outputName(image.name, done.mime), data: done.bytes })
        source.close()
        setBatch({ done: index + 1, total: images.length })
        await new Promise((resolve) => setTimeout(resolve, 0))
      }
      const archive = createZip(entries)
      saveBytes(archive, 'bilder.zip', 'application/zip')
      const before = images.reduce((sum, image) => sum + image.sizeBytes, 0)
      const after = entries.reduce((sum, entry) => sum + entry.data.byteLength, 0)
      log(
        'bilder',
        `${entries.length} Bilder verarbeitet — ${formatBytes(before)} → ${formatBytes(after)} ` +
          `(${Math.round((after / before) * 100)} %)`,
      )
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
    } finally {
      setBusy(false)
      setBatch(null)
    }
  }

  if (!asset) {
    return (
      <Card tone="keylime">
        <Eyebrow>Bilder</Eyebrow>
        <h2 className="display-md mt-[8px] mb-[12px]">Skalieren, zuschneiden, umwandeln</h2>
        <p className="mb-[16px] max-w-[62ch] text-body leading-[1.55] text-prose/85">
          In der Sitzung liegt noch kein Bild. JPEG, PNG, WebP, GIF und meist auch AVIF werden
          gelesen; gerechnet wird auf der Zeichenfläche des Browsers, also ohne Wartezeit.
        </p>
        <FileDrop />
      </Card>
    )
  }

  const ratio = result && asset.sizeBytes > 0 ? result.bytes.byteLength / asset.sizeBytes : null

  return (
    <div className="grid gap-[18px] lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="flex flex-col gap-[16px]">
        <Card tone="keylime">
          <div className="flex flex-wrap items-baseline justify-between gap-[12px]">
            <Eyebrow>Bilder</Eyebrow>
            <span className="truncate text-[12px] text-muted">{asset.name}</span>
          </div>

          {error ? (
            <div className="mt-[14px]">
              <Notice tone="error" title="Nicht verarbeitbar">
                {error}
              </Notice>
            </div>
          ) : null}

          {/* -- preview ------------------------------------------------------ */}
          <div
            ref={frameRef}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            className="relative mt-[14px] flex min-h-[220px] cursor-crosshair touch-none items-center justify-center overflow-hidden rounded-card bg-panel-soft p-[12px] select-none"
          >
            {(comparing ? sourceUrl : resultUrl) ? (
              <img
                src={(comparing ? sourceUrl : resultUrl) ?? ''}
                alt=""
                draggable={false}
                className="max-h-[420px] max-w-full rounded-nav object-contain"
              />
            ) : (
              <p className="text-[13px] text-muted">Wird gelesen…</p>
            )}

            {live && Math.abs(live.width) > 0.01 ? (
              <div
                aria-hidden
                className="pointer-events-none absolute border-2 border-ink bg-ink/10"
                style={{
                  left: `${Math.min(live.x, live.x + live.width) * 100}%`,
                  top: `${Math.min(live.y, live.y + live.height) * 100}%`,
                  width: `${Math.abs(live.width) * 100}%`,
                  height: `${Math.abs(live.height) * 100}%`,
                }}
              />
            ) : null}
          </div>

          <div className="mt-[10px] flex flex-wrap items-center gap-[9px]">
            <span className="text-[12px] text-muted">
              Zum Zuschneiden über das Bild ziehen, einfacher Klick hebt es auf.
            </span>
            <div className="ml-auto flex gap-[6px]">
              {ops.crop ? (
                <Button size="sm" variant="ghost" onClick={() => patch({ crop: null })}>
                  Ausschnitt zurück
                </Button>
              ) : null}
              <Button
                size="sm"
                variant={comparing ? 'primary' : 'quiet'}
                onMouseDown={() => setComparing(true)}
                onMouseUp={() => setComparing(false)}
                onMouseLeave={() => setComparing(false)}
                onTouchStart={() => setComparing(true)}
                onTouchEnd={() => setComparing(false)}
              >
                Vorher halten
              </Button>
            </div>
          </div>

          {/* -- the four that matter ----------------------------------------- */}
          <div className="mt-[18px] grid gap-[14px] sm:grid-cols-2">
            <Field label="Breite" hint="Die Höhe folgt dem Seitenverhältnis.">
              <Select value={ops.width} onChange={(event) => patch({ width: Number(event.target.value) })}>
                {WIDTH_PRESETS.map((preset) => (
                  <option key={preset.value} value={preset.value}>
                    {preset.label}
                  </option>
                ))}
                {!WIDTH_PRESETS.some((preset) => preset.value === ops.width) ? (
                  <option value={ops.width}>{ops.width} px</option>
                ) : null}
              </Select>
            </Field>

            <Field label="Format" hint={IMAGE_FORMATS.find((entry) => entry.id === ops.format)?.hint}>
              <Select
                value={ops.format}
                onChange={(event) => patch({ format: event.target.value as ImageFormat })}
              >
                {IMAGE_FORMATS.map((format) => (
                  <option key={format.id} value={format.id}>
                    {format.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          {ops.format !== 'png' ? (
            <div className="mt-[14px]">
              <Slider
                label="Qualität"
                display={`${Math.round(ops.quality * 100)} %`}
                min={0.3}
                max={1}
                step={0.05}
                value={ops.quality}
                onChange={(event) => patch({ quality: Number(event.target.value) })}
              />
            </div>
          ) : null}

          <div className="mt-[16px] flex flex-wrap items-center gap-[7px]">
            <span className="mr-[4px] text-[11px] font-semibold uppercase tracking-[0.08em] text-ink">
              Drehen
            </span>
            {([0, 90, 180, 270] as const).map((angle) => (
              <Button
                key={angle}
                size="sm"
                variant={ops.rotate === angle ? 'primary' : 'quiet'}
                onClick={() => patch({ rotate: angle })}
              >
                {angle === 0 ? 'Keine' : `${angle}°`}
              </Button>
            ))}
            <Button
              size="sm"
              variant={ops.flipH ? 'primary' : 'quiet'}
              onClick={() => patch({ flipH: !ops.flipH })}
            >
              Waagerecht spiegeln
            </Button>
            <Button
              size="sm"
              variant={ops.flipV ? 'primary' : 'quiet'}
              onClick={() => patch({ flipV: !ops.flipV })}
            >
              Senkrecht spiegeln
            </Button>
          </div>

          <Reveal label="Helligkeit, Farbe und Schärfe" className="mt-[16px]">
            <div className="grid gap-[14px] rounded-card bg-panel-soft p-[16px] sm:grid-cols-2">
              <Slider
                label="Helligkeit"
                display={`${Math.round(ops.brightness * 100)} %`}
                min={0.3} max={2} step={0.05} value={ops.brightness}
                onChange={(event) => patch({ brightness: Number(event.target.value) })}
              />
              <Slider
                label="Kontrast"
                display={`${Math.round(ops.contrast * 100)} %`}
                min={0.3} max={2} step={0.05} value={ops.contrast}
                onChange={(event) => patch({ contrast: Number(event.target.value) })}
              />
              <Slider
                label="Sättigung"
                display={`${Math.round(ops.saturation * 100)} %`}
                min={0} max={2} step={0.05} value={ops.saturation}
                onChange={(event) => patch({ saturation: Number(event.target.value) })}
              />
              <Slider
                label="Schärfen"
                display={ops.sharpen === 0 ? 'aus' : `${Math.round(ops.sharpen * 100)} %`}
                min={0} max={1} step={0.05} value={ops.sharpen}
                onChange={(event) => patch({ sharpen: Number(event.target.value) })}
              />
              <Slider
                label="Weichzeichnen"
                display={ops.blur === 0 ? 'aus' : `${ops.blur.toFixed(1)} px`}
                min={0} max={12} step={0.5} value={ops.blur}
                onChange={(event) => patch({ blur: Number(event.target.value) })}
              />
              <div className="flex items-end">
                <Button size="sm" variant="ghost" onClick={() => setOps({ ...DEFAULT_IMAGE_OPS, format: ops.format })}>
                  Alles zurücksetzen
                </Button>
              </div>
            </div>
          </Reveal>

          <div className="mt-[18px] flex flex-wrap items-center gap-[10px]">
            <Button
              disabled={!result || busy}
              onClick={() => result && asset && saveBytes(result.bytes, outputName(asset.name, result.mime), result.mime)}
            >
              Speichern
              <ArrowRight />
            </Button>
            <Button variant="quiet" disabled={!result || busy} onClick={keep}>
              In die Sitzung übernehmen
            </Button>
          </div>
        </Card>

        {/* -- what came out ------------------------------------------------- */}
        {result && facts && target ? (
          <Card tone="slate" size="compact">
            <Eyebrow>Ergebnis</Eyebrow>
            <div className="mt-[14px] grid gap-[14px] rounded-card bg-raised p-[18px] sm:grid-cols-4">
              <Stat label="Abmessung" value={`${target.width} × ${target.height}`} emphasis
                note={`vorher ${facts.width} × ${facts.height}`} />
              <Stat label="Größe" value={formatBytes(result.bytes.byteLength)} emphasis
                note={`vorher ${formatBytes(asset.sizeBytes)}`} />
              <Stat
                label="Gegenüber Quelle"
                value={ratio === null ? '—' : `${Math.round(ratio * 100)} %`}
                note={ratio !== null && ratio < 1 ? `${Math.round((1 - ratio) * 100)} % gespart` : 'größer geworden'}
              />
              <Stat label="Format" value={extensionFor(result.mime).toUpperCase()}
                note={result.mime.replace('image/', '')} />
            </div>
          </Card>
        ) : null}
      </div>

      <aside className="flex flex-col gap-[16px]">
        {images.length > 1 ? (
          <Card tone="mint" size="compact">
            <Eyebrow>Alle Bilder auf einmal</Eyebrow>
            <p className="mt-[9px] text-[13px] leading-[1.5] text-prose/85">
              Dieselben Einstellungen auf alle {images.length} Bilder der Sitzung, Ergebnis als ZIP.
            </p>
            <div className="mt-[12px]">
              <Button size="sm" onClick={() => void runBatch()} disabled={busy}>
                {busy ? 'Läuft…' : `${images.length} Bilder verarbeiten`}
              </Button>
            </div>
            {batch ? (
              <div className="mt-[12px]">
                <Progress value={batch.done / batch.total} label={`${batch.done} von ${batch.total}`} />
              </div>
            ) : null}
          </Card>
        ) : null}

        <SessionCard />
      </aside>
    </div>
  )
}
