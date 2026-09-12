/**
 * The session library: everything currently held in memory.
 */

import { useEffect } from 'react'

import { saveBytes } from '../lib/download'
import { formatBytes, formatDuration } from '../lib/format'
import { useDecodedAudio } from '../hooks/useDecodedAudio'
import { useActiveAsset, useSession } from '../state/store'
import { AudioPreview } from './AudioPreview'
import { Badge } from './ui/primitives'

/**
 * A player for whichever file is selected.
 *
 * This sits in the library, which every panel shows, so playback of the source
 * is available in every tab rather than only in the ones that happen to produce
 * a result. Decoding happens once and is cached on the asset, so opening a
 * second panel does not pay for it again.
 */
function SelectedPlayer() {
  const asset = useActiveAsset()
  const { audio, decode, status } = useDecodedAudio(asset)

  useEffect(() => {
    if (asset && !audio && status === 'idle') void decode()
  }, [asset, audio, status, decode])

  if (!asset) return null

  if (!audio) {
    return (
      <p className="text-[12px] text-muted">
        {status === 'decoding' ? 'Wird für die Wiedergabe dekodiert…' : null}
        {status === 'error' ? 'Diese Datei lässt sich nicht abspielen.' : null}
      </p>
    )
  }

  return <AudioPreview sources={[{ id: asset.id, label: asset.name, audio }]} waveHeight={40} />
}

export function AssetList() {
  const assets = useSession((state) => state.assets)
  const activeId = useSession((state) => state.activeAssetId)
  const setActive = useSession((state) => state.setActiveAsset)
  const removeAsset = useSession((state) => state.removeAsset)
  const clearAssets = useSession((state) => state.clearAssets)

  if (assets.length === 0) {
    return (
      <p className="text-[13px] leading-[1.55] text-muted">
        Noch nichts geladen. Alles, was Sie hinzufügen, bleibt in diesem Tab.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-[11px]">
      <div className="flex items-baseline justify-between gap-3">
        <span className="eyebrow">Sitzung · {assets.length}</span>
        <button
          type="button"
          onClick={clearAssets}
          className="rounded-nav text-[12px] text-muted underline-offset-2 hover:text-ink hover:underline"
        >
          Alles verwerfen
        </button>
      </div>

      <SelectedPlayer />

      <ul className="flex flex-col gap-[7px]">
        {assets.map((asset) => {
          const active = asset.id === activeId
          return (
            <li key={asset.id}>
              <div
                className={`flex items-center gap-[11px] rounded-card px-[14px] py-[11px] transition-colors ${
                  active ? 'bg-panel-mid' : 'bg-raised hover:bg-panel-soft'
                }`}
              >
                <button
                  type="button"
                  onClick={() => setActive(asset.id)}
                  className="flex min-w-0 flex-1 flex-col items-start gap-[3px] text-left"
                >
                  <span className="w-full truncate text-body text-ink">{asset.name}</span>
                  <span className="numeric text-[11px] text-muted">
                    {formatBytes(asset.sizeBytes)}
                    {asset.durationSeconds ? ` · ${formatDuration(asset.durationSeconds)}` : ''}
                    {asset.audio ? ` · ${asset.audio.sampleRate / 1000} kHz` : ''}
                  </span>
                </button>
                {asset.origin === 'derived' ? <Badge>abgeleitet</Badge> : null}
                {/* Anything in the session can be saved from anywhere, which is
                    what makes the downloader a downloader rather than a way to
                    get files into other tools. */}
                <button
                  type="button"
                  aria-label={`${asset.name} speichern`}
                  title="Auf die Festplatte speichern"
                  onClick={() => saveBytes(asset.bytes, asset.name, asset.mime)}
                  className="rounded-nav p-1 text-muted transition-colors hover:text-ink"
                >
                  <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" aria-hidden>
                    <path
                      d="M8 2.5v7.5M5 7.5L8 10.5l3-3M3 12.5h10"
                      stroke="currentColor"
                      strokeWidth="1.4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
                <button
                  type="button"
                  aria-label={`${asset.name} entfernen`}
                  onClick={() => removeAsset(asset.id)}
                  className="rounded-nav p-1 text-muted transition-colors hover:text-ink"
                >
                  <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" aria-hidden>
                    <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
