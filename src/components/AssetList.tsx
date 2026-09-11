/**
 * The session library: everything currently held in memory.
 */

import { formatBytes, formatDuration } from '../lib/format'
import { useSession } from '../state/store'
import { Badge } from './ui/primitives'

export function AssetList() {
  const assets = useSession((state) => state.assets)
  const activeId = useSession((state) => state.activeAssetId)
  const setActive = useSession((state) => state.setActiveAsset)
  const removeAsset = useSession((state) => state.removeAsset)
  const clearAssets = useSession((state) => state.clearAssets)

  if (assets.length === 0) {
    return (
      <p className="text-[13px] leading-[1.55] text-charcoal/60">
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
          className="rounded-nav text-[12px] text-charcoal/60 underline-offset-2 hover:text-forest-ink hover:underline"
        >
          Alles verwerfen
        </button>
      </div>

      <ul className="flex flex-col gap-[7px]">
        {assets.map((asset) => {
          const active = asset.id === activeId
          return (
            <li key={asset.id}>
              <div
                className={`flex items-center gap-[11px] rounded-card px-[14px] py-[11px] transition-colors ${
                  active ? 'bg-mint-veil' : 'bg-cream-paper hover:bg-keylime-wash'
                }`}
              >
                <button
                  type="button"
                  onClick={() => setActive(asset.id)}
                  className="flex min-w-0 flex-1 flex-col items-start gap-[3px] text-left"
                >
                  <span className="w-full truncate text-body text-forest-ink">{asset.name}</span>
                  <span className="numeric text-[11px] text-charcoal/60">
                    {formatBytes(asset.sizeBytes)}
                    {asset.durationSeconds ? ` · ${formatDuration(asset.durationSeconds)}` : ''}
                    {asset.audio ? ` · ${asset.audio.sampleRate / 1000} kHz` : ''}
                  </span>
                </button>
                {asset.origin === 'derived' ? <Badge>abgeleitet</Badge> : null}
                <button
                  type="button"
                  aria-label={`${asset.name} entfernen`}
                  onClick={() => removeAsset(asset.id)}
                  className="rounded-nav p-1 text-charcoal/40 transition-colors hover:text-forest-ink"
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
