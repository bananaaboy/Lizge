/**
 * The session library: everything currently held in memory.
 */

import { useEffect } from 'react'

import { actionsFor } from '../lib/actions'
import { saveBytes } from '../lib/download'
import { formatBytes, formatDuration } from '../lib/format'
import { useDecodedAudio } from '../hooks/useDecodedAudio'
import { KIND_LABEL, useActiveAsset, useSession } from '../state/store'
import { AudioPreview } from './AudioPreview'
import { Badge, Card } from './ui/primitives'

/**
 * A player for whichever file is selected.
 *
 * This sits in the library, which every panel shows, so playback of the source
 * is available in every tab rather than only in the ones that happen to produce
 * a result. Decoding happens once and is cached on the asset, so opening a
 * second panel does not pay for it again.
 */
function SelectedPlayer() {
  const selected = useActiveAsset()
  // Decoding a PNG as audio is a guaranteed failure and a pointless wait.
  const asset = selected && (selected.kind === 'audio' || selected.kind === 'video') ? selected : null
  const { audio, decode, status } = useDecodedAudio(asset)

  useEffect(() => {
    if (asset && !audio && status === 'idle') void decode()
  }, [asset, audio, status, decode])

  if (!asset) return null

  if (!audio) {
    return (
      <p className="text-small text-muted">
        {status === 'decoding' ? 'Wird für die Wiedergabe dekodiert…' : null}
        {status === 'error' ? 'Diese Datei lässt sich nicht abspielen.' : null}
      </p>
    )
  }

  return <AudioPreview sources={[{ id: asset.id, label: asset.name, audio }]} waveHeight={40} />
}

/**
 * The session column as every panel renders it.
 *
 * Both return nothing when the session is empty. A card reading "nothing
 * loaded" beside a tool that is itself explaining that it needs a file is the
 * same sentence twice, and on the opening screen it left a dead 320px column
 * next to the only thing there was to do.
 *
 * `SessionCard` is for panels that already have a sidebar of their own;
 * `SessionAside` is for the two where the session is the whole sidebar.
 */
export function SessionCard() {
  const count = useSession((state) => state.assets.length)
  if (count === 0) return null
  return (
    <Card tone="cream" size="compact">
      <AssetList />
    </Card>
  )
}

export function SessionAside() {
  const count = useSession((state) => state.assets.length)
  if (count === 0) return null
  return (
    <aside>
      <SessionCard />
    </aside>
  )
}

/**
 * What can be done with the file that is selected.
 *
 * The principle this serves is the one the whole app is arranged around: a
 * file should not have to be carried to a tool. It says what it is, the tools
 * that fit it are listed right there, and one click is the whole journey —
 * which also means the capabilities are discovered by using the app rather
 * than by reading the tab bar and guessing.
 */
function WhatFits() {
  const asset = useActiveAsset()
  const panel = useSession((state) => state.panel)
  const setPanel = useSession((state) => state.setPanel)
  if (!asset) return null

  const fits = actionsFor(asset.kind)
  if (fits.length === 0) {
    return (
      <p className="text-small leading-[1.5] text-muted">
        Für {KIND_LABEL[asset.kind]}-Dateien gibt es hier noch kein Werkzeug. Speichern und
        Verwalten geht trotzdem.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-[8px]">
      <span className="text-small font-semibold text-muted">
        Damit geht
      </span>
      <div className="flex flex-wrap gap-[4px]">
        {fits.map((action) => (
          <button
            key={action.id}
            type="button"
            title={action.hint}
            onClick={() => setPanel(action.panel)}
            className={`press px-[8px] py-[4px] text-small ${
              action.panel === panel
                ? 'bg-ink text-on-ink'
                : 'bg-panel-soft text-ink hover:bg-panel-mid'
            }`}
          >
            {action.label}
          </button>
        ))}
      </div>
    </div>
  )
}

export function AssetList() {
  const assets = useSession((state) => state.assets)
  const activeId = useSession((state) => state.activeAssetId)
  const setActive = useSession((state) => state.setActiveAsset)
  const removeAsset = useSession((state) => state.removeAsset)
  const clearAssets = useSession((state) => state.clearAssets)

  if (assets.length === 0) {
    return (
      <p className="text-small leading-[1.55] text-muted">
        Noch nichts geladen. Alles, was Sie hinzufügen, bleibt in diesem Tab.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-[12px]">
      <div className="flex items-baseline justify-between gap-3">
        <span className="eyebrow">Sitzung · {assets.length}</span>
        <button
          type="button"
          onClick={clearAssets}
          className="rounded-nav text-small text-muted underline-offset-2 hover:text-ink hover:underline"
        >
          Alles verwerfen
        </button>
      </div>

      <SelectedPlayer />
      <WhatFits />

      <ul className="flex flex-col gap-[8px]">
        {assets.map((asset) => {
          const active = asset.id === activeId
          return (
            <li key={asset.id}>
              <div
                className={`flex items-center gap-[12px] rounded-card px-[16px] py-[12px] transition-colors ${
                  active ? 'bg-panel-mid' : 'bg-raised hover:bg-panel-soft'
                }`}
              >
                <button
                  type="button"
                  onClick={() => setActive(asset.id)}
                  className="flex min-w-0 flex-1 flex-col items-start gap-[4px] text-left"
                >
                  <span className="w-full truncate text-body text-ink">{asset.name}</span>
                  <span className="value text-micro text-muted">
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
